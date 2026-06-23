# 04 · 阶段 3 — Health HTTP server

> 目标：在 `apps/daemon` 里起 `127.0.0.1:19514` 的本地 HTTP server，暴露 `GET /health`（返回状态 JSON）和 `POST /shutdown`（触发优雅退出）。**约束：`curl http://127.0.0.1:19514/health` 返回 `{"status":"running",...}`；端口被占时第二个 daemon 报清晰错误退出。**

---

## 1. 为什么 daemon 一定要有 HTTP server

阶段 1 我们说过：Windows 下没有 POSIX 信号，`process.kill(pid, 'SIGTERM')` 等价 SIGKILL，**没有优雅退出的机会**。这条结论直接推出 daemon **必须**有一个 HTTP 端点——这是 Windows 下唯一可靠的「优雅关闭」入口。

除了 `/shutdown`，这个端口还承担另一个职责：**让外部（Electron）探测 daemon 的状态**。Electron 的 daemon-manager spawn 子进程后，**不能假设**「子进程起了 = daemon 就绪」——daemon 自己还要做 preflight（探测 claude、起 server）。Electron 唯一可靠的探测方式：poll `GET /health`，看 status 字段。

所以 daemon 的 HTTP server 有两个目的：

1. **被探测**（liveness + readiness）
2. **被控制**（shutdown）

阶段 5 之后还会加第三个：**被调用**（task API）。同一个 19514 端口。

---

## 2. 核心概念：liveness ≠ readiness

Kubernetes 的经典概念，同样适用 daemon：

- **liveness**：「进程在跑」——端口能连上就算活。
- **readiness**：「可以接活儿」——preflight 完成、`ready=true`。

为什么必须分？

```
时间轴：
t0 ─┬─ daemon 进程启动
    │
t1 ─┼─ createLogger()
    │
t2 ─┼─ startHealthServer()  ← 端口绑上，liveness = true
    │
t3 ─┼─ probeClaude()         ← preflight，可能慢
    │
t4 ─┴─ ready = true          ← readiness = true
```

t2 到 t4 之间，端口在听（活），但 daemon 还不能接任务（没就绪）。如果 daemon-manager 只看「端口能连」，会在 t2 就认为 daemon 起来，然后推 task——task 会失败。

**解法**：`/health` 返回 `status: "starting"`（t2~t4）或 `"running"`（t4 之后）。daemon-manager 看 `status === "running"` 才认为就绪。

multica 的对应代码：`server/internal/daemon/health.go::healthHandler` 里：

```go
status := "starting"
if d.ready.Load() {
    status = "running"
}
```

我们用同样模式：`ready` 是一个布尔值，preflight 完后置 true。

---

## 3. 为什么用 `node:http` 不用 hono

阶段 4 之后我们会用 hono 做 mock-server，但**daemon 的 HTTP server 故意用原生 `node:http`**。理由：

1. **学习目的**：本阶段的核心是「理解 HTTP server 的生命周期」（listen / close / 错误处理），框架会把这些细节藏起来。
2. **极简**：本阶段只有 2 个路由，原生 `createServer` + 一个 `if/else if` 路由就够。引 hono 反而多一层依赖。
3. **对照 multica**：multica 用 Go 标准库 `net/http`，不引框架。我们用 `node:http` 对齐。

阶段 5 加 task API 时会**继续用 `node:http`**——加几个路由而已，仍然不需要框架。**只有 mock-server 用 hono**，因为它有 6+ 个路由 + 状态管理，框架收益超过成本。

---

## 4. 优雅关闭的关键顺序

`POST /shutdown` handler 必须**先回响应再 abort**：

```typescript
function shutdownHandler(_req, res, deps) {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ status: "shutting down" }));
  // ✅ 响应 flush 后再 abort
  setImmediate(() => deps.shutdown("http-shutdown"));
}
```

如果反过来（先 abort 再回响应）：

```typescript
function shutdownHandler(_req, res, deps) {
  deps.shutdown("...");           // ❌ 触发 abort
  res.end(...);                    // ❌ server.close() 已开始，连接被断
}
```

`controller.abort()` 会触发 main.ts 的清理逻辑，里面调 `healthServer.close()`。close 后再写响应，连接已断，curl 收到 `connection reset` 而不是 200。

**`setImmediate` 的作用**：把 abort 推到下一个事件循环 tick，让 Node 先把 res.end() 的字节 flush 出去。这是 Node 单线程事件循环的经典套路——同步代码（`res.end()`）一定先于 `setImmediate` 回调执行。

> 对照 multica：它用 `go d.cancelFunc()` 起一个 goroutine 异步 cancel，原理一样——让响应先 flush。

---

## 5. 操作清单

1. 新建 `packages/core/daemon/health.ts`（`HealthResponse` 类型 + `HealthStatus` 联合类型）。
2. 新建 `apps/daemon/src/health/server.ts`（`startHealthServer()` + 路由 + handlers）。
3. 改 `apps/daemon/src/main.ts`：
   - 启动时调 `startHealthServer()`
   - preflight 完后置 `ready = true`
   - abort handler 里 `healthServer.close()`
   - 端口冲突时清晰报错 + exit
4. 验证。

---

## 6. 关键文件内容

### 6.1 `packages/core/daemon/health.ts`

```typescript
// /health 响应形状。daemon 与 desktop 都 import 这份类型——
// desktop 解析 /health 返回时用 DaemonStatus，避免两边字段漂移。

export type HealthStatus = "starting" | "running";

export interface HealthResponse {
  status: HealthStatus;
  pid: number;
  uptimeMs: number;
  healthPort: number;
  logDir: string;
  // 阶段 4 之后填：探测到的 agent provider 列表（如 ["claude"]）
  agents: string[];
  // 阶段 5 之后填：正在执行的 task 数
  activeTaskCount: number;
}
```

### 6.2 `apps/daemon/src/health/server.ts`

```typescript
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Logger } from "pino";
import type { HealthResponse } from "@demo/core/daemon/health";

// daemon 运行时状态。main.ts 持有，server 通过 getState() 读。
export interface DaemonRuntimeState {
  startedAt: number;
  ready: boolean;
  logDir: string;
  // 后续阶段填充：agents、activeTaskCount
}

export interface HealthServerDeps {
  port: number;
  logger: Logger;
  getState: () => DaemonRuntimeState;
  shutdown: (reason: string) => void;
}

export async function startHealthServer(
  deps: HealthServerDeps,
): Promise<Server> {
  const server = createServer(createHandler(deps));

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      deps.logger.info(
        { addr: `127.0.0.1:${deps.port}` },
        "health server listening",
      );
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(deps.port, "127.0.0.1");
  });

  return server;
}

function createHandler(deps: HealthServerDeps) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        return healthHandler(res, deps);
      }
      if (req.method === "POST" && url.pathname === "/shutdown") {
        return shutdownHandler(res, deps);
      }
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "not found", path: url.pathname }));
    } catch (err) {
      deps.logger.error({ err, path: url.pathname }, "health handler error");
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "internal" }));
      }
    }
  };
}

function healthHandler(res: ServerResponse, deps: HealthServerDeps) {
  const state = deps.getState();
  const body: HealthResponse = {
    status: state.ready ? "running" : "starting",
    pid: process.pid,
    uptimeMs: Date.now() - state.startedAt,
    healthPort: deps.port,
    logDir: state.logDir,
    agents: [], // 阶段 4 之后填
    activeTaskCount: 0, // 阶段 5 之后填
  };
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function shutdownHandler(res: ServerResponse, deps: HealthServerDeps) {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ status: "shutting down" }));
  // 响应 flush 后再 abort，否则 server.close() 会立刻断连。
  // setImmediate 把回调推到下一 tick，让 res.end() 的字节先发出去。
  setImmediate(() => deps.shutdown("http-shutdown"));
}
```

几个关键设计：

- **`createServer` 单实例**：不引 Express middleware 链，handler 一个函数走完路由 + try/catch。
- **`server.once("error", ...)` + `once("listening", ...)`**：promisify `listen()`，让 caller 可以 await。error 和 listening 互斥，谁先触发谁清理另一个。
- **路由匹配**：`new URL(req.url, base)` 把路径解析出来，避免手写字符串 split。base 任意（不用域名），只是为了解析相对 URL。
- **`if (!res.headersSent)`**：catch 里防御性写——如果错误发生在响应已开始发送之后（比如流写到一半），不能再改 status code，只能让连接自然结束。
- **shutdownHandler 的 `setImmediate`**：见第 4 节解释。

### 6.3 `apps/daemon/src/main.ts`（替换）

```typescript
import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import {
  startHealthServer,
  type DaemonRuntimeState,
} from "./health/server.ts";

const config = loadConfig();
const logger = createLogger({
  level: config.logLevel,
  logDir: config.logDir,
});

class ShutdownReason extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ShutdownReason";
  }
}

const controller = new AbortController();

// daemon 运行时状态。所有字段 mutate 都在 main.ts，server 通过 getState 读。
const runtime: DaemonRuntimeState = {
  startedAt: Date.now(),
  ready: false,
  logDir: config.logDir,
};

let shuttingDown = false;
function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, "shutdown triggered");
  controller.abort(new ShutdownReason(reason));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// 启动 HTTP server。端口被占（另一个 daemon 在跑）时清晰报错退出。
let healthServer: Server | undefined;
try {
  healthServer = await startHealthServer({
    port: config.healthPort,
    logger,
    getState: () => runtime,
    shutdown,
  });
} catch (err) {
  const e = err as NodeJS.ErrnoException;
  if (e.code === "EADDRINUSE") {
    logger.error(
      { port: config.healthPort },
      "another daemon is already running; set DEMO_DAEMON_HEALTH_PORT to use a different port",
    );
    process.exit(1);
  }
  logger.error({ err }, "failed to start health server");
  process.exit(1);
}

// preflight 完成（本阶段很轻，阶段 4 之后这里会加 probeClaude）。
runtime.ready = true;
logger.info("daemon ready");

// 主循环：每 5 秒打一行 alive。health server 已接管 liveness，
// 这里只是开发时看 daemon 还在的视觉信号。阶段 5 之后会被 task loop 替换。
const tick = setInterval(() => {
  logger.debug("alive");
}, 5000);

controller.signal.addEventListener("abort", () => {
  clearInterval(tick);
  healthServer?.close();
  logger.info("bye");
  setTimeout(() => process.exit(0), 50);
});

logger.info({ config }, "daemon started");
```

差异：

- 加了 `runtime: DaemonRuntimeState` 对象，server 通过 `getState` 读。
- `startHealthServer` 包在 try/catch 里，端口冲突专门识别 `EADDRINUSE`。
- `runtime.ready = true` 是 preflight 完成的信号。
- abort handler 里 `healthServer?.close()`——关 HTTP server 让端口立刻释放。
- alive log 从 `info` 降到 `debug`，因为 health server 已经接管「证明活着」职责，alive 退化为 dev 信号。
- top-level await：Node 20 + ESM 支持，main.ts 顶层可以直接 `await startHealthServer(...)`。

需要加 import `Server` 类型：

```typescript
import type { Server } from "node:http";
```

---

## 7. 验证

```bash
# 1. 启动 daemon（后台）
pnpm dev:daemon
```

```bash
# 2. health check
curl http://127.0.0.1:19514/health
```

预期：

```json
{
  "status": "running",
  "pid": 12345,
  "uptimeMs": 1234,
  "healthPort": 19514,
  "logDir": "C:\\Users\\you\\.demo\\daemon",
  "agents": [],
  "activeTaskCount": 0
}
```

```bash
# 3. unknown route
curl -i http://127.0.0.1:19514/unknown
```

预期：`HTTP/1.1 404` + `{"error":"not found","path":"/unknown"}`。

```bash
# 4. HTTP 触发关闭（Windows 下唯一可靠的优雅停服路径）
curl -X POST http://127.0.0.1:19514/shutdown
```

预期：`{"status":"shutting down"}` 返回，daemon 进程在 500ms 内退出（看 daemon 日志有 `shutdown triggered: http-shutdown` + `bye`）。

```bash
# 5. 端口冲突
pnpm dev:daemon &       # 第一个 daemon
pnpm dev:daemon         # 第二个，应该报错退出
```

预期第二个 daemon 打日志：

```
ERROR: another daemon is already running; set DEMO_DAEMON_HEALTH_PORT to use a different port
    port: 19514
```

并以 exit code 1 退出。第一个 daemon 继续跑。

```bash
# 6. liveness vs readiness
# 启动 daemon 后立刻 curl /health（可能在 preflight 完成前）
# 应该看到 status: "starting"。本阶段 preflight 太快难以捕捉，
# 但代码路径是对的。阶段 4 加 probeClaude 后会有明显延迟。
```

---

## 8. 常见陷阱

### 8.1 `EADDRINUSE` 没被 catch

**症状**：第二个 daemon 起来后看到未捕获异常崩溃，错误信息是 raw `listen EADDRINUSE`。

**根因**：`server.listen()` 的错误通过 `server.on('error', ...)` 发射，不是 `listen()` 抛出。如果不注册 error handler，Node 默认把错误 throw 到 process，崩溃。

**解法**：本阶段代码 `startHealthServer` 里用 `server.once("error", onError)` 捕获，Promise reject 传给 caller。main.ts 的 try/catch 接住。

### 8.2 `/shutdown` 后 curl 收到 connection reset

**症状**：`curl -X POST /shutdown` 看到 `curl: (56) Recv failure: Connection was reset`，而不是 200 响应。

**根因**：abort 触发了 `healthServer.close()`，close 把所有活跃连接立刻断了，/shutdown 的响应没发出去。

**解法**：handler 里用 `setImmediate(() => deps.shutdown(...))` 把 abort 推到下一 tick。本阶段代码已经这么做。如果仍 reset，把 `setImmediate` 改成 `setTimeout(_, 100)` 给更多 flush 时间。

### 8.3 abort 后 server 没立刻释放端口

**症状**：daemon 退出后立刻重启，新 daemon 报 `EADDRINUSE`，过 1~2 秒才能起。

**根因**：`server.close()` 是异步的——它停止接受**新**连接，但**现有**连接会等 keep-alive 超时（默认 5 秒）才关。daemon 退出后端口被内核 TIME_WAIT 保留一小段时间。

**解法**：本阶段没 keep-alive 连接（curl 默认 connection: close），所以 close 立刻释放。如果阶段 5 之后出现，调 `server.closeAllConnections()`（Node 18.2+）强制断现有连接。

### 8.4 `req.url` 包含 query string

**症状**：`curl http://127.0.0.1:19514/health?verbose=1` 返回 404。

**根因**：handler 用 `url.pathname` 提取路径——`new URL("/health?verbose=1", "http://localhost").pathname === "/health"`，正确。**不要**直接比 `req.url === "/health"`，会包含 query。

**解法**：本阶段代码用 `new URL(req.url, base).pathname`，正确处理 query。

### 8.5 top-level await 报错

**症状**：`SyntaxError: await is only valid in async functions` 启动崩溃。

**根因**：Node < 14.8 或 CommonJS 不支持 top-level await。本项目 Node 20 + ESM（`type: module`），应该 OK。

**解法**：确认 `apps/daemon/package.json` 有 `"type": "module"`（阶段 1 已加）。如果仍报错，把 main.ts 的顶层逻辑包进 IIFE：`async function main() { ... } main().catch(...)`。

---

## 9. 本阶段产出清单

- [ ] `packages/core/daemon/health.ts`
- [ ] `apps/daemon/src/health/server.ts`
- [ ] `apps/daemon/src/main.ts` 起健康 server + preflight + 端口冲突处理
- [ ] `pnpm typecheck` 通过
- [ ] `curl /health` 返回正确 JSON
- [ ] `curl -X POST /shutdown` 触发优雅退出
- [ ] 第二个 daemon 启动时报清晰错误退出（exit 1）

---

**下一步**：跑通验证后告诉我，进阶段 4（Claude backend：`Backend` 接口 + `ClaudeBackend` + stream-json 解析 + 子进程 abort）。
