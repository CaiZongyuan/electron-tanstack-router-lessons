# 06 · 阶段 5 — Task HTTP API + NDJSON 流式输出

> 目标：在 health server 上挂 `POST /task/run`、`GET /task/:id/events`、`DELETE /task/:id`，把阶段 4 的 `Backend` 包成「创建即返回、流式拉取、即时取消」的 HTTP 服务。**约束**：`curl` 推一个 task 能拿到 `task_id`，`curl` 拉 `/events` 看到 NDJSON 流，`curl DELETE` 后流终止。

---

## 1. 这一层管什么

阶段 4 的 `Backend` 只回答一个问题：「给我一个 prompt，还你一条消息流」。它**不管**：

- 任务有 ID 吗、能被引用吗？
- 多个客户端订阅同一个任务怎么办？晚来的客户端怎么不丢首包？
- 怎么从 HTTP 触发取消？
- 同时跑太多怎么办？

这些「任务生命周期 + 对外 HTTP」的事，就是阶段 5 的 `task/` 三件套（store / runner / router）的职责。`Backend` 在它下面当纯执行单元。

```
HTTP client                task router            task store           runner            Backend
 POST /task/run ────────> create() ───────────> 记录 task ────────> start() ────────> execute()
 GET  /task/:id/events ─> subscribe() ────────> 回放历史 + live
 DELETE /task/:id ──────> cancel() ───────────> abort ───────────> 收尾 cancelled
                                                          append() <──── message ──── yield Message
```

---

## 2. 与 multica 的裁剪（重点）

multica 是**云端架构**：daemon 不存任务，任务在 PostgreSQL；daemon 轮询 `claim` 任务、把消息**批量上报**给 server、靠**轮询** `GetTaskStatus` 检测取消。这一整套都是「云端调度」的复杂度。

我们是**纯本地单机**：shell 与 daemon 同机，没有中间 server。所以几乎全部裁掉，换成最直接的形态：

| 维度 | multica（云端） | 本项目（本地，阶段 5） | 取舍 |
|---|---|---|---|
| 任务存储 | PostgreSQL 表 | 进程内 `Map` | 同机无需持久化；daemon 重启即清空，可接受 |
| 任务来源 | daemon 轮询 `POST /claim` | shell 主动 `POST /task/run` | 不需要调度器，推即可 |
| 消息输出 | daemon 批量 `POST .../messages` 上报 | `GET /task/:id/events` 实时拉 NDJSON | 同机直连，实时流更简单 |
| 取消检测 | 轮询 `GetTaskStatus` | `DELETE` → `AbortController.abort()` | 单进程内 abort 即时，无需轮询 |
| ID | UUID v7 | `t-` + 随机 8 hex | 可读优先，无碰撞风险即可 |
| 多 runtime 注册/心跳 | 有 | **删** | 单 daemon 无此需求 |

> 能借鉴 multica 的只有**思想**：状态机（queued→running→done/failed/cancelled）、runner 消费消息流（`executeAndDrain` 的 `for range Messages`）、`Backend` 接口（阶段 4 已落地）。**实现形态完全不同**——这正是「参照架构、不照抄云端」的体现（见 `00-学习计划` 第 3 节架构图注释）。

---

## 3. 五个核心概念

### 3.1 状态机：`pending → running → done | failed | cancelled`

```
       create          start(drain)
pending ──────> pending ──────────> running
                                      │
                  ┌───────────────────┼───────────────────┐
                  ▼                   ▼                   ▼
            abort 信号            无 result /           拿到 result
          （DELETE）             出现 error 帧          且无 error
                  ▼                   ▼                   ▼
            cancelled             failed                done
```

- `done`：backend 流正常结束且拿到 `result` 帧、没有 `error` 帧。
- `failed`：没拿到 `result`（子进程异常退出等），或流里出现过 `error` 帧（backend 自己补的，见阶段 4）。
- `cancelled`：`signal.aborted`，取消优先级最高。

终态判定在 `runner.drain` 末尾一次性完成（见 6.2）。`done/failed/cancelled` 是终止态，订阅流据此收尾。

### 3.2 append-only 历史 + pub/sub（防丢首包）—— 本阶段最关键

一个 task = 一条**只追加**的事件流。store 同时维护：

- `events: TaskEvent[]`：全部历史（append-only）。
- `sinks: Set<回调>`：当前 live 订阅者。

订阅 `subscribe(id, sink)` 做两步，**且两步之间没有 `await`**：

```typescript
for (const e of rec.events) sink(e); // ① 同步回放历史
rec.sinks.add(sink);                 // ② 加入 live 订阅
```

为什么这能防丢首包：Node 单线程 + 事件循环。runner 的 `append`（来自 `for await` 的 microtask）与 `subscribe` 的两步，**不会在「回放完、还没 add」的间隙插队**。回放循环是纯同步的，期间任何 `append` 都得排队到下一个 microtask。于是历史与 live **不重不漏**：

- 历史里有的，回放时已发给 sink；
- 回放后产生的新事件，sink 已在 live 集合里，照收。

> 对照 multica：它没有这个问题——消息先入库，客户端随时查库，天然不丢。我们用「同步回放 + live 订阅」在内存里复刻了同样的保证，省掉了数据库。

### 3.3 流式输出用 NDJSON，不用 SSE

`GET /task/:id/events` 响应：

- `content-type: application/x-ndjson`：每行一个 JSON 事件，以 `\n` 分隔。
- 不用 SSE（`text/event-stream`）：两端都用 `fetch` + `ReadableStream` 读，浏览器和 Node 同构，不需要 `EventSource` 的限制（如只能 GET、不能带自定义 header）。这是 `00-学习计划` 第 6 条既定决策。
- 终止收尾：收到**终止 status 事件**后 `res.end()`。终止由 `store.onTerminal` 驱动（见 6.1），订阅回调只管转发事件，不管结束——职责分离。

### 3.4 取消传播：`DELETE → abort → killProcessTree`

```
DELETE /task/:id
  → store.cancel(id)
    → taskRecord.controller.abort()       // AbortController
      → backend.execute 的 signal abort   // 阶段 4 已接
        → 关 stdin + killProcessTree      // taskkill /T，连孙子进程
  → runner 的 for await 结束（signal.aborted）
    → append status:cancelled → onTerminal → HTTP 流 end
```

与 multica 的「轮询 `GetTaskStatus`」相比，本地单进程里 abort 是**同步触发**的，没有轮询延迟。daemon 自己 shutdown 时 `cancelAll()` 取消所有未结束 task，避免孤儿 claude 进程。

### 3.5 并发上限

`store.create` 时检查 `runningCount() >= maxConcurrent`，超出抛 `OverCapacityError`，router 映射成 **429**。`maxConcurrent` 来自 `DEMO_DAEMON_MAX_TASKS`（默认 4）。

阶段 5 **不做排队队列**（YAGNI）：满了就拒绝，客户端自行重试（响应带 `retry_after_ms`）。将来要排队再加。

---

## 4. HTTP 协议

### 端点

| 方法 | 路径 | 作用 | 成功状态码 |
|---|---|---|---|
| `POST` | `/task/run` | 创建并启动 task | `202` + `{task_id}` |
| `GET` | `/task/:id/events` | NDJSON 流式事件 | `200` + 流 |
| `GET` | `/task/:id` | task 概要 | `200` + `TaskSummary` |
| `DELETE` | `/task/:id` | 取消 task | `202` + `{task_id,status:"cancelled"}` |

### `POST /task/run`

请求体（`TaskRunRequest`）：

```jsonc
{ "prompt": "必填", "agent": "claude", "cwd": "...", "model": "...", "maxTurns": 8 }
```

响应：`202 { "task_id": "t-5a14a2f5" }`。

错误：空 prompt → `400`；超并发 → `429 { error, retry_after_ms }`；非法 JSON → `400`。

### `GET /task/:id/events`

每行一个 `TaskEvent`（NDJSON）。字段：

```jsonc
{
  "seq": 0,            // 单 task 内单调递增
  "at": 1782210649591, // epoch ms
  "type": "status",    // status | system | text | thinking | tool_use | tool_result | log | result | error
  // 按 type 选填：text / tool / callId / input / output / sessionId / isError / level / status
}
```

`type` 与阶段 4 的 `MessageType` 一致，额外多一个 `status`（task 状态变化）。流以一条**终止 status**（`done/failed/cancelled`）结束，随后连接关闭。

### `DELETE /task/:id`

`202 { task_id, status: "cancelled" }`。对已终止的 task 返回 `409`。

---

## 5. 操作清单

1. `packages/core/daemon/task.ts`：task 共享类型（`TaskStatus` / `TaskEvent` / `TaskRunRequest` / `TaskRunResponse` / `TaskSummary` + `isTerminalTaskStatus`）。
2. `packages/core/daemon/config.ts` + `apps/daemon/src/config.ts`：加 `DEMO_DAEMON_MAX_TASKS`（默认 4）。
3. `apps/daemon/src/task/store.ts`：内存态存储 + pub/sub + 回放 + abort 开关。
4. `apps/daemon/src/task/runner.ts`：消费 backend 流，维护状态机。
5. `apps/daemon/src/task/router.ts`：HTTP 三端点 + NDJSON 流 + 错误映射。
6. `apps/daemon/src/health/server.ts`：`HealthServerDeps` 加 `routeTask?` / `getActiveTaskCount?`（依赖注入，不反向依赖 task）。
7. `apps/daemon/src/main.ts`：建 `Backend`/`TaskStore`/`TaskRunner`，注入 health，shutdown 时 `cancelAll`。
8. `pnpm typecheck` + `curl` 全链路验证。

---

## 6. 关键文件内容

### 6.1 `apps/daemon/src/task/store.ts`（回放与终止）

```typescript
// 订阅：先同步回放历史，再加入 live。两步之间无 await，防丢首包。
subscribe(id: string, sink: EventSink): () => void {
  const rec = this.tasks.get(id);
  if (!rec) return () => {};
  for (const e of rec.events) sink(e); // ① 同步回放
  rec.sinks.add(sink);                 // ② 接 live
  return () => { rec.sinks.delete(sink); };
}

// 注册终止回调。已终止的 task 用 queueMicrotask 触发，
// 让订阅者先把终止事件 flush 出去再关流。
onTerminal(id: string, cb: TerminalListener): () => void {
  const rec = this.tasks.get(id);
  if (!rec) return () => {};
  if (isTerminalTaskStatus(rec.summary.status)) {
    queueMicrotask(cb);
    return () => {};
  }
  rec.terminalListeners.add(cb);
  return () => { rec.terminalListeners.delete(cb); };
}

// 追加事件：写历史 + 推所有 live 订阅者。
append(id: string, event: Omit<TaskEvent, "seq" | "at">): void {
  const rec = this.tasks.get(id);
  if (!rec) return;
  const full: TaskEvent = { ...event, seq: rec.seq++, at: Date.now() };
  rec.events.push(full);
  for (const sink of rec.sinks) sink(full);
}

// 改状态 + 追加 status 事件；转入终止态时触发 terminalListeners。
setStatus(id, status, patch?) {
  const rec = this.tasks.get(id);
  if (!rec) return;
  Object.assign(rec.summary, patch, { status });
  this.append(id, { type: "status", status });
  if (isTerminalTaskStatus(status)) {
    const listeners = rec.terminalListeners; // 先摘下，防回调内再注册
    rec.terminalListeners = new Set();
    for (const cb of listeners) cb();
  }
}

// 取消：abort controller，runner 自然收尾为 cancelled。
cancel(id: string): boolean {
  const rec = this.tasks.get(id);
  if (!rec || isTerminalTaskStatus(rec.summary.status)) return false;
  rec.controller.abort();
  return true;
}
```

> 终止触发的顺序很关键：`setStatus` 先 `append`（把终止 status 推给 sink，先 flush 出去），再触发 `terminalListeners`（关流）。这样客户端**先收到终止事件，再看到连接关闭**。

### 6.2 `apps/daemon/src/task/runner.ts`（状态机）

```typescript
private async drain(id, input, signal) {
  this.store.setStatus(id, "running", { startedAt: Date.now() });

  let sawResult = false, sawError = false, errorText: string | undefined, sessionId: string | undefined;
  try {
    for await (const msg of this.backend.execute(input.prompt, { ...input, signal })) {
      if (msg.type === "result") { sawResult = true; if (msg.sessionId) sessionId = msg.sessionId; }
      else if (msg.type === "error") { sawError = true; errorText = msg.text; }
      this.store.append(id, messageToEvent(msg));
    }
  } catch (err) { /* 兜底：backend 流异常 */ }

  // 终态判定：取消 > 失败 > 完成
  let status: TaskStatus, error: string | undefined;
  if (signal.aborted) status = "cancelled";
  else if (!sawResult || sawError) { status = "failed"; error = errorText ?? "未产出结果"; }
  else status = "done";
  this.store.setStatus(id, status, { finishedAt: Date.now(), sessionId, error });
}
```

对照 multica `daemon.go::executeAndDrain`：`for msg := range session.Messages` 消费消息流。区别是 multica 消费完上报给 server，我们消费完写进内存 store 供客户端拉取。

### 6.3 `apps/daemon/src/task/router.ts`（NDJSON 流）

```typescript
function streamEvents(res, deps, id) {
  const rec = deps.store.get(id);
  if (!rec) { sendJson(res, 404, { error: "task not found", task_id: id }); return; }

  res.statusCode = 200;
  res.setHeader("content-type", "application/x-ndjson");
  res.setHeader("cache-control", "no-cache");
  res.flushHeaders(); // 先发 header，再回放历史

  const off = deps.store.subscribe(id, (e) => writeNdjson(res, e));        // 回放 + live
  const offTerm = deps.store.onTerminal(id, () => {                        // 终止关流
    off();
    if (!res.writableEnded) res.end();
  });
  res.on("close", () => { off(); offTerm(); });                            // 客户端断开清理
}
```

`handleTaskRoute` 同步返回 `boolean`：被 `health/server.ts` 的 handler 用来判断「task 路由是否接管，否则走 health/404」。其中 `POST /task/run` 是异步的（要读 body），所以 `handleTaskRoute` 里用 `void runTask(...); return true;`——handler 立即放行，runTask 在后台读 body 并保证写 res。

### 6.4 health / main 接线（依赖注入）

`health/server.ts` 不直接 import task 模块（避免基础设施反向依赖功能模块），改成注入两个回调：

```typescript
export interface HealthServerDeps {
  // ...
  routeTask?: (req, res, url) => boolean;   // 处理 /task/*
  getActiveTaskCount?: () => number;        // /health 的 activeTaskCount
}
```

`createHandler` 里先试 `routeTask`：`if (deps.routeTask?.(req, res, url)) return;`。

`main.ts`：

```typescript
const backend = new ClaudeBackend({ logger });
const taskStore = new TaskStore({ maxConcurrent: config.maxTasks, logger });
const taskRunner = new TaskRunner({ backend, store: taskStore, logger });

healthServer = await startHealthServer({
  // ...
  routeTask: (req, res, url) =>
    handleTaskRoute(req, res, url, { store: taskStore, runner: taskRunner, logger }),
  getActiveTaskCount: () => taskStore.runningCount(),
});

// shutdown 时取消所有未结束 task（abort 同步触发 killProcessTree，不残留孤儿）
controller.signal.addEventListener("abort", () => {
  clearInterval(tick);
  taskStore.cancelAll();
  healthServer?.close();
  // ...
});
```

---

## 7. 验证

```bash
# 0. 起 daemon（用非默认端口避免冲突）
DEMO_DAEMON_HEALTH_PORT=19599 pnpm -C apps/daemon start &
sleep 8

# 1. health：agents + activeTaskCount
curl -s http://127.0.0.1:19514/health
# 期望（装了 claude）：{"status":"running",...,"agents":["claude"],"activeTaskCount":0}
```

```bash
# 2. 创建 task + 拉流（NDJSON，阻塞到终止）
TID=$(curl -s -X POST http://127.0.0.1:19514/task/run \
  -H "content-type: application/json" \
  -d '{"prompt":"用一句话回答：2加2等于几"}' | sed -n 's/.*"task_id":"\([^"]*\)".*/\1/p')
curl -s -N http://127.0.0.1:19514/task/$TID/events
```

实测输出（节选，`seq` 单调递增）：

```
{"type":"status","status":"running","seq":0,...}
{"type":"system","sessionId":"a1d4...","seq":1,...}
{"type":"log","text":"...","seq":2,...}
...
{"type":"text","text":"2 加 2 等于 4。","seq":584,...}
{"type":"result","text":"2 加 2 等于 4。","isError":false,"sessionId":"a1d4...","seq":585,...}
{"type":"status","status":"done","seq":586,...}     ← 终止帧，随后连接关闭
```

```bash
# 3. 取消：建一个长任务，中途 DELETE，再延迟订阅看回放
TID=$(curl -s -X POST .../task/run -d '{"prompt":"用 Bash 执行 sleep 40"}' | ...)
sleep 2
curl -s -X DELETE .../task/$TID          # → {"task_id":...,"status":"cancelled"}
sleep 2
curl -s -N .../task/$TID/events          # 回放：status:running → status:cancelled，流即终止
curl -s -X DELETE .../task/$TID          # 再次删除 → 409
```

```bash
# 4. 并发上限（maxTasks=4）：并发发 5 个，第 5 个 429
#    req1~4: {"task_id":"..."}；req5: {"error":"已达并发上限 4 ...","retry_after_ms":1000}
```

```bash
# 5. 错误路径
curl -X POST .../task/run -d '{}'                          # → 400
curl .../task/nope/events                                  # → 404
```

---

## 8. 常见陷阱

### 8.1 订阅丢首包 / 重复

**症状**：晚订阅的客户端漏掉开头几条，或同一条事件收到两次。

**根因**：「回放历史」与「加入 live 订阅」之间如果插入了 `await`，runner 的 `append` 就可能：在回放已发、live 未注册时产生新事件（丢）；或 live 注册后又被历史回放一次（重）。

**解法**：`subscribe` 的回放与 `add` 之间**绝不 await**（本阶段已保证）。这是纯同步段，microtask 无法插队。

### 8.2 流不结束（挂住）

**症状**：task 已 `done`，但 `curl /events` 一直不退出。

**根因**：终止 status 事件发出了，但没人调 `res.end()`。

**解法**：`store.onTerminal` 注册关流回调，`setStatus` 在转终止态时触发它。且对「订阅时已终止」的 task 用 `queueMicrotask` 触发（否则永远不会触发）。

### 8.3 `claude --verbose` 的 system 日志刷屏

**症状**：`/events` 流里大量 `{"type":"log","text":"system: thinking_tokens",...}`，淹没真正的文本。

**根因**：`--verbose` 下 claude 会把内部的 `thinking_tokens` 等子事件当 `system` 帧吐出，阶段 4 的 `toMessages` 把它们透传成 `log`。

**解法**：UI 侧过滤掉 `text` 以 `"system:"` 开头的 `log` 事件，或只渲染 `text/thinking/tool_use/tool_result/result`。daemon 侧保持透传（便于排查），不在协议层删——那是 UI 呈现策略。

### 8.4 prompt 被 claude 当成「续接对话」

**症状**：明明问「2+2」，claude 却回答无关内容（如提到文档某小节）。

**根因**：claude 在项目目录以 `--input-format stream-json` 跑，会把 stdin 的 prompt 和工作目录的上下文/CLAUDE.md 混合理解。

**解法**：这是 claude 自身行为，与 daemon 无关。daemon 正确传递了 prompt（中文能识别即证明 UTF-8 无误）。生产里靠 system prompt / `cwd` 隔离来约束。

### 8.5 Windows 取消留孤儿进程

**症状**：`DELETE` 后 claude 没了，但它 spawn 的 `bash`/`node` 还在。

**根因**：`child.kill()` 在 Windows 只杀父进程。

**解法**：阶段 4 的 `killProcessTree`（`taskkill /T`）已封装，取消链路经 `controller.abort` → backend `onAbort` → `killProcessTree`。验证：长任务取消后 `tasklist | grep -E "claude|node"` 应无残留。

---

## 9. 本阶段产出清单

- [x] `packages/core/daemon/task.ts`（`TaskStatus` / `TaskEvent` / 请求响应类型 + `isTerminalTaskStatus`）
- [x] `packages/core/daemon/config.ts` + `apps/daemon/src/config.ts`（`DEMO_DAEMON_MAX_TASKS`）
- [x] `apps/daemon/src/task/store.ts`（内存态 + pub/sub + 回放 + abort + cancelAll）
- [x] `apps/daemon/src/task/runner.ts`（消费 backend + 状态机）
- [x] `apps/daemon/src/task/router.ts`（`POST /task/run` / `GET /events` / `DELETE` / `GET` 概要）
- [x] `apps/daemon/src/health/server.ts`（注入 `routeTask` / `getActiveTaskCount`）
- [x] `apps/daemon/src/main.ts`（接线 backend/store/runner + shutdown cancelAll）
- [x] `pnpm typecheck` 通过（6 包全绿）
- [x] `curl` 验证：创建→流式→终止、取消→回放、429、400/404/409、health activeTaskCount

---

**下一步**：进阶段 6 · Shell 集成——在 `@demo/core` 定义 `DaemonClient` 接口；`apps/desktop` 经 IPC 适配 + spawn daemon-manager；`apps/web` 直接用浏览器 fetch 连同一套 HTTP；共享 chat UI 只依赖这层抽象。
