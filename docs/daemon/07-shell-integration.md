# 07 · 阶段 6 — Shell 集成（daemon 接入 desktop / web）

> 目标：把阶段 5 的 daemon HTTP API 接进两个壳子——desktop 由主进程 spawn/管理 daemon 子进程、renderer 经 IPC 调主进程；web 直接用浏览器 fetch。两端共享同一套 chat UI，UI 只依赖 `@demo/core` 的 `DaemonClient` 接口，**不感知传输差异**。**约束**：desktop 点 Start → running → 写 prompt 见流式回复；web 在 daemon 已运行时打开同页也能对话；Stop 干净退出。

> 本文是**设计先行文档**：先讲清楚要做什么、为什么这么设计，代码再跟上。读完你应当能口述两条数据流（desktop / web）与流式 IPC 的生命周期。

---

## 1. 这一层要解决什么

阶段 5 让 daemon 暴露了完整 HTTP。但 UI 还用不上它，因为横着两个问题：

1. **两端传输方式不同**。desktop 是 Electron：renderer（Chromium）要调 daemon，按 CLAUDE.md 第 8 节，**经 preload IPC 调主进程，由主进程转成 HTTP**（主进程统一管理 daemon 连接，renderer 不直接碰网络）。web 是纯浏览器：**直接 fetch** 同一套 localhost HTTP。
2. **共享 chat UI 不能写死传输**。如果把 `window.desktopAPI` 或 `fetch('http://127.0.0.1:19514')` 写进 `@demo/views`，这套 UI 就和某个壳子绑死，换到另一端直接崩。

解法就是 `DaemonClient` 接口：定义「daemon 能做什么」，两端各写一个实现（IPC 版 / fetch 版），在 `__root` 注入。共享 UI 只用接口——和阶段 0~7 已经用的 `PlatformCapabilities`（`openExternal`）是同一个套路。

```
                ┌─────────────────────────────────────────┐
                │  packages/views/daemon/chat-view.tsx     │
                │  只调 useDaemonClient()，不知道传输细节   │
                └──────────────────┬──────────────────────┘
                                   │ DaemonClient 接口（@demo/core）
              ┌────────────────────┴────────────────────┐
              ▼                                          ▼
   desktop: IPC 实现                          web: fetch 实现
   window.desktopAPI.daemon*                  fetch(127.0.0.1:19514)
              │                                          │
              ▼                                          ▼
   main 进程（daemon-manager + ipc）          浏览器直连
              │                                          │
              ▼                                          ▼
   spawn + fetch ──> apps/daemon HTTP <── fetch
```

---

## 2. 与 multica 的对照（裁什么、留什么）

multica 的 `apps/desktop/src/main/daemon-manager.ts` 是个 1000+ 行的大文件，因为它服务云端：7 态状态机（含 `installing_cli` / `cli_not_found` / `auth_expired`）、CLI 二进制下载与分发、多 profile（按 server_url 隔离端口）、PAT 认证探测、版本比对与 drain 后重启……这些**我们全裁掉**——我们是纯本地单机，没有 cloud、没有认证、没有多后端。

| 维度 | multica | 本项目（阶段 6） | 取舍 |
|---|---|---|---|
| 状态机 | 7 态（含 cli 安装/认证） | 5 态：`stopped/starting/running/stopping/error` | 删掉安装与认证态 |
| daemon 二进制 | bundle + 下载管理 + PATH 三级回退 | dev 直接 `pnpm -C apps/daemon start`（tsx 跑源码） | 阶段 7 才打包分发 |
| renderer 取 task | **不直连 daemon**，走云端 backend | desktop 经 IPC→main→daemon HTTP；web 直 fetch | 同机直连，无云端 |
| 认证 | JWT→PAT，token 探测 | 无 | daemon 不持凭证，claude 自管 token |
| 多 profile | 按 server_url 分端口 | 固定单端口 19514 | 单 daemon |

**保留的核心模式**（这才是要学的）：

1. **主进程是 daemon 的 lifecycle owner**：spawn 子进程、poll `/health` 推状态、stop 时清理。
2. **状态经 IPC 推 renderer**：main 主动 `webContents.send('daemon:status', …)`，renderer 订阅而非轮询。
3. **renderer 只看抽象**：不直接碰子进程，也不直接碰 daemon HTTP（desktop 下）。

---

## 3. 核心概念

### 3.1 `DaemonClient`：传输无关的客户端接口

为什么**不**塞进现有的 `PlatformCapabilities`？两者语义不同：

| | `PlatformCapabilities` | `DaemonClient` |
|---|---|---|
| 典型方法 | `openExternal(url)` | `start()/stop()/runTask()/streamTaskEvents()` |
| 副作用 | 一次性、瞬时 | 状态机 + 长流 + 取消 |
| 生命周期 | 无 | 有（health 轮询、订阅清理） |

所以单独建接口与 Provider（`@demo/core/daemon/client.ts` + `client-context.tsx`），写法和 `platform/context.tsx` 一模一样：

```typescript
// packages/core/daemon/client.ts（纯类型）
export type DaemonStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export interface DaemonClient {
  readonly capabilities: { manageProcess: boolean }; // web=false
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<DaemonStatus>;
  onStatusChange(cb: (s: DaemonStatus) => void): () => void; // 返回 unsub
  getHealth(): Promise<DaemonHealth | null>;
  runTask(req: TaskRunRequest): Promise<TaskRunResponse>;     // 复用 core/daemon/task
  streamTaskEvents(taskId: string, onEvent: (e: TaskEvent) => void): Promise<void>;
  cancelTask(taskId: string): Promise<void>;
}
```

> 复用阶段 5 已下沉的 `TaskRunRequest / TaskRunResponse / TaskEvent / isTerminalTaskStatus`（`@demo/core/daemon/task`），不重复定义。

两端在 `__root.tsx` 各注入一个实现：

```tsx
// desktop __root
<PlatformCapabilitiesProvider capabilities={desktopPlatformCapabilities}>
  <DaemonClientProvider client={desktopDaemonClient}>
    <AppLayout />
  </DaemonClientProvider>
</PlatformCapabilitiesProvider>
```

### 3.2 两端适配：两条数据流

**desktop（全 IPC）**——renderer 不碰网络，所有 daemon 调用经 main：

```
renderer                preload(invoke/on)          main                     daemon
runTask ──────────> daemon:run-task ──────────> fetch POST /task/run ──> 200 {task_id}
stream  ──────────> daemon:subscribe-events ──> fetch GET /events ──────> NDJSON 流
        <────────── daemon:task-event(逐条)  <── 逐行解析转发
        <────────── (收到终止 status, invoke resolve)
cancel  ──────────> daemon:cancel-task ───────> fetch DELETE /task/:id
status  <────────── daemon:status(推送)       <── manager poll /health
start   ──────────> daemon:start ─────────────> manager.spawn ──────────> 子进程
```

**web（直 fetch）**——renderer 直接连 daemon HTTP，没有 main 这一层：

```
renderer                                   daemon
runTask ──fetch POST /task/run ──────────> 200 {task_id}
stream  ──fetch GET /events (ReadableStream 读 NDJSON)
cancel  ──fetch DELETE /task/:id
status  ──setInterval 轮询 /health → onStatusChange 推
start/stop ── no-op（manageProcess=false，UI 禁用按钮）
```

> 为什么 web 不经 main？web 根本没有 main 进程（它是浏览器）。它的「适配」就是「不需要适配」——直接用浏览器原生 fetch。这正是抽象的价值：同一个 `streamTaskEvents` 接口，desktop 走 IPC、web 走 fetch，UI 一行不改。

### 3.3 daemon-manager 状态机（desktop main）

```
            start()                 poll /health == running
  stopped ─────────> starting ──────────────────────────> running
     ▲                  │ spawn 失败 / 超时                  │
     │                  └────────────> error                 │ stop()
     │                                                     ▼
     └───────────────────────────────── stopping <──────────
                  child exit / POST /shutdown
```

- **spawn**：dev 下 `spawn('pnpm', ['-C', daemonDir, 'start'], { shell, env, windowsHide })`；prod（阶段 7）换 `node resources/daemon/daemon.js`。daemonDir 用 `__dirname` 反推（electron-vite 编译后 main 的 `__dirname` = `apps/desktop/out/main`，`path.resolve(__dirname, '../../../daemon')` = apps/daemon）。
- **poll**：每 2s `fetch /health`，2s 超时。`running` → 状态 `running`；连续失败 → `error`。
- **stop**：先 `POST /shutdown`（daemon 优雅退出，阶段 3 已实现），3s 超时后 `taskkill /T` 兜底（复用 `apps/daemon/src/platform/windows.ts` 的 `killProcessTree` 思路），监听 child `exit` → `stopped`。
- **app quit**：`before-quit` 调 `stop()`，避免孤儿 daemon。

### 3.4 流式 IPC 的生命周期（本阶段最易错，重点理解）

`streamTaskEvents` 要把 daemon 的 NDJSON 流，经 main 中转，逐条送到 renderer。四个坑：

**(a) 不丢首包。** daemon 的 `store.subscribe` 会**同步回放**历史事件再接 live（阶段 5 保证，回放与注册间无 await）。但 main 是异步 fetch——main 开始读流时，daemon 已经在推事件。只要 **renderer 先注册 listener，再 invoke**，main 转发的事件就不会漏：

```typescript
// desktop renderer 的 streamTaskEvents
const off = desktopAPI.onDaemonTaskEvent(({ taskId: tid, event }) => {
  if (tid === taskId) onEvent(event);   // ① 先订阅（按 taskId 过滤）
})
await desktopAPI.daemonSubscribeEvents(taskId)  // ② 再 invoke，main 开始 fetch+转发
```

**(b) 多并发 task 的事件路由。** daemon 推送的事件带 `{taskId, event}`。每个 `streamTaskEvents` 注册一个 listener，按 `taskId` 过滤后 `onEvent`。maxTasks ≤ 4，并发 listener 数量可控。

**(c) 防泄漏（renderer 卸载要停 main 的 fetch）。** IPC 的 `invoke` 是请求-响应：main 的 handler 在 fetch 流结束前不 resolve。如果 renderer 卸载组件、丢弃 promise，**main 的 fetch 还在跑**（泄漏）。所以新增 `daemon:unsubscribe-events(taskId)`：

```
main 维护 Map<taskId, AbortController>
subscribe-events: controller = new AbortController(); map.set(taskId, controller);
                  fetch(url, { signal: controller.signal })  // 逐行转发
unsubscribe-events: map.get(taskId)?.abort()  // fetch 抛 AbortError，handler catch 后 resolve
```

chat-view 的 `useEffect` cleanup 里调 unsubscribe + off listener。

**(d) 流终止信号复用终止 status 事件。** 不另开 `task-events-done` 通道——`streamTaskEvents` 收到 `type==='status' && isTerminalTaskStatus(status)` 时 resolve。少一个通道，少一处状态。

### 3.5 CORS：web fetch 的前提（容易漏）

web renderer（`http://localhost:xxxx`）fetch `http://127.0.0.1:19514` 是**跨域**。daemon 的 `health/server.ts` 现在没设 CORS header，浏览器会直接拦掉。所以必须改 daemon：所有响应加 `Access-Control-Allow-Origin: *`，`OPTIONS` 预检直接返 `204`。

> 这一步碰的是阶段 5 的 daemon 代码，是 web 端能跑的**前提**，不是可选优化。

### 3.6 `capabilities.manageProcess`：两端按钮差异

web 不能 spawn/stop daemon 进程（没有主进程）。`DaemonClient.capabilities.manageProcess`：desktop=true、web=false。daemon-panel 的 Start/Stop 据此 `disabled` + tooltip「web 端无法管理进程，请在 desktop 启动」。

---

## 4. 文件结构与职责

### 新建

| 文件 | 职责 |
|---|---|
| `packages/core/daemon/client.ts` | `DaemonClient` 接口 + `DaemonStatus` + `DaemonHealth` + `capabilities`（纯类型） |
| `packages/core/daemon/client-context.tsx` | `DaemonClientProvider` + `useDaemonClient()`（照搬 platform/context） |
| `apps/desktop/src/main/daemon-manager.ts` | spawn/poll/stop 状态机 + onStatusChange + quit stop |
| `apps/desktop/src/main/ipc/daemon.ts` | 7 个 ipcMain.handle + `Map<taskId,AbortController>` + task-event 流式转发 + status 推送 |
| `apps/desktop/src/renderer/src/daemon/client.ts` | desktopDaemonClient（IPC 适配） |
| `apps/web/src/platform/daemon-client.ts` | webDaemonClient（fetch + health 轮询） |
| `packages/views/daemon/use-daemon-status.ts` | `useDaemonStatus()` hook |
| `packages/views/daemon/daemon-panel.tsx` | 状态条 + Start/Stop |
| `packages/views/daemon/chat-view.tsx` | prompt 输入 + 流式消息列表 |
| `apps/{desktop,web}/.../routes/daemon.tsx` | `/daemon` 薄路由，挂 ChatView |

### 修改

| 文件 | 改动 |
|---|---|
| `packages/core/package.json` | exports 加 `"./daemon/client-context"`（.tsx 单列，通配只匹配 .ts） |
| `packages/views/package.json` | exports 加 `"./daemon/*"` |
| `apps/desktop/src/main/index.ts` | 建 DaemonManager + 注册 ipc + createWindow 存 mainWindow + before-quit stop |
| `apps/desktop/src/preload/index.ts` + `.d.ts` | desktopAPI 扩展 daemon* 方法 + Window 类型 |
| `apps/{desktop,web}/.../routes/__root.tsx` | 包 `DaemonClientProvider` |
| `packages/views/layout/app-sidebar.tsx` | 「运行时」`to:'/'` → `to:'/daemon'` |
| `apps/daemon/src/health/server.ts` | 加 CORS |

### 前置（已完成）
- `pnpm ui:add input scroll-area card badge`（base-nova / Base UI）。chat/panel UI 依赖。

---

## 5. 关键代码讲解

### 5.1 `DaemonClient` 接口与 Provider

见 3.1。`client.ts` 是纯类型，`client-context.tsx` 与 `platform/context.tsx` 几乎对称。注意 `.tsx` 要在 `core/package.json` 的 exports 里**单列**（`"./daemon/*":"./daemon/*.ts"` 通配吃不到 `.tsx`），和 `platform/context` 的处理一致。

### 5.2 daemon-manager 状态机（要点）

```typescript
class DaemonManager {
  private child: ChildProcess | null = null;
  private status: DaemonStatus = "stopped";
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<(s: DaemonStatus) => void>();

  async start() {
    if (this.status === "running" || this.status === "starting") return;
    this.setStatus("starting");
    this.child = spawn(cmd, args, { shell: ..., env, windowsHide: true });
    this.child.on("exit", (code) => { /* 非 stop 触发 → error/stopped */ });
    this.startPolling();
  }

  private async pollOnce() {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: timeout(2000) });
      const h = await r.json();
      if (h.status === "running") this.setStatus("running");
    } catch { /* starting 中暂不计较；连续失败才 error */ }
  }

  async stop() {
    this.setStatus("stopping");
    try { await fetch(`.../shutdown`, { method: "POST", signal: timeout(3000) }); }
    catch { this.child && killProcessTree(this.child); } // 兜底
    this.stopPolling();
    this.setStatus("stopped");
  }
}
```

### 5.3 IPC 流式转发（要点，对应 3.4）

```typescript
// main/ipc/daemon.ts
const streams = new Map<string, AbortController>();

ipcMain.handle("daemon:subscribe-events", async (e, taskId) => {
  const controller = new AbortController();
  streams.set(taskId, controller);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/task/${taskId}/events`, { signal: controller.signal });
    // 逐行读 NDJSON（reader + 行 buffer），每行：
    const event = JSON.parse(line);
    mainWindow.webContents.send("daemon:task-event", { taskId, event });
  } catch {
    // abort 或网络错——静默，不 reject（renderer 已可能卸载）
  } finally {
    streams.delete(taskId);
  }
});

ipcMain.handle("daemon:unsubscribe-events", (_e, taskId) => {
  streams.get(taskId)?.abort();
});

manager.onStatusChange((s) => mainWindow.webContents.send("daemon:status", s));
```

### 5.4 desktop renderer client（IPC 适配）

`streamTaskEvents`：先 `onDaemonTaskEvent`（按 taskId 过滤）→ `await daemonSubscribeEvents` → 收到终止 status 时 resolve → `finally` 里 unsubscribe + off。

### 5.5 web client（fetch + 轮询）

`streamTaskEvents`：`fetch GET /events` → `response.body.getReader()` → 自己做行 buffer（跨 chunk 的半行）→ 每行 `JSON.parse` → `onEvent`。`onStatusChange`：内部 `setInterval` 每 3s 轮询 `/health`，unsub 时 `clearInterval`。

> NDJSON 行解析两端各写一份（main 用 Node reader、web 用浏览器 ReadableStream），**不抽进 core**——core 既不能耦合 Node stream 也不能耦合 DOM。

### 5.6 chat-view（共享 UI）

最小可用：顶部 `DaemonPanel`（状态 + Start/Stop），下方 prompt `Input` + 发送 `Button`，消息列表用 `ScrollArea`。流式消息累积进 state；过滤 `type==='log' && text?.startsWith('system:')` 的噪音（claude `--verbose` 的 thinking_tokens，见 06 文档陷阱 8.3）。遵守 design.md：字号 `text-xs/sm/base`、字重 `font-normal/medium`、语义 token、无硬编码色。

---

## 6. 操作清单

1. core 接口 + Provider（`client.ts` / `client-context.tsx` / exports）。
2. `ui:add input scroll-area card badge`。
3. views daemon UI（`use-daemon-status` / `daemon-panel` / `chat-view` / exports）。
4. daemon health 加 CORS。
5. desktop main（`daemon-manager` / `ipc/daemon`）+ preload 扩展 + `index.ts` 接线。
6. 两端 renderer 接线（desktop/web daemon client + Provider + `/daemon` 路由 + sidebar）。

---

## 7. 验证

**实测状态（实现后）**：
- ✅ 全量 `pnpm typecheck`（6 包全绿）。
- ✅ 两端 `build` 通过，且重新生成 `routeTree.gen.ts`（`/daemon` 路由已注册，产物含 `daemon-*.js` chunk）。
- ✅ daemon CORS 实测：`OPTIONS` 预检 → `204` + `access-control-allow-origin: *`；`GET /health` 带 `Origin` → 同样带 CORS header（web fetch 前提满足）。
- ⚠️ GUI 交互（desktop 点 Start、web/chat 流式渲染）受限于本机自动化环境（无可靠浏览器驱动），建议人工按下方步骤验证。

- **每步**：对应包 `pnpm typecheck`。
- **完成後**：全量 `pnpm typecheck`（6 包）+ `pnpm build`（重新生成两端 `routeTree.gen.ts`，`/daemon` 才会被注册——`routeTree.gen.ts` 是 `@ts-nocheck` 的生成文件，tsc 不查它内容，但运行时必须靠 vite 重新生成）。
- **GUI 人工**：desktop Start→running→chat 流式；web（daemon 已起）打开 /daemon 对话（验证 CORS）；Stop 干净退出；明暗主题双模。

---

## 8. 常见陷阱

1. **renderer 卸载泄漏 main 的 fetch 流** → 靠 `unsubscribe-events` + AbortController（3.4c）。
2. **web 跨域被拦** → daemon 加 CORS（3.5），容易漏。
3. **首包丢失** → renderer 必须先订阅再 invoke（3.4a）。
4. **Windows spawn pnpm 失败** → `pnpm` 是 `pnpm.cmd`，必须 `shell:true`。
5. **routeTree 没更新** → tsc 不报（`@ts-nocheck`），但运行时 `/daemon` 不存在；必须跑一次 build/dev。
6. **chat 被日志刷屏** → 过滤 `system:` 开头的 log 事件。

---

## 9. 产出清单

- [x] core `client.ts` + `client-context.tsx` + exports
- [x] ui input/scroll-area/card/badge
- [x] views `daemon-panel` + `chat-view` + `use-daemon-status` + exports
- [x] daemon health CORS
- [x] desktop `daemon-manager` + `ipc/daemon` + preload + `index.ts`
- [x] desktop/web daemon client + Provider + `/daemon` 路由 + sidebar
- [x] `pnpm typecheck` + `pnpm build` 通过
- [ ] GUI 验证（desktop 全链路 + web 直连 + CORS）—— 编译/CORS 已验证，交互待人工

---

**下一步**：进阶段 7 · 打包 + 引导安装——electron-builder extraResource 把 daemon 产物 bundle 进 desktop；首次启动检测 `claude --version`，缺失引导 `npm install -g @anthropic-ai/claude-code`。
