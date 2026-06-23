# Daemon 学习文档（TS 版）

> 这一系列文档复刻 multica 的本地 **daemon**（agent 运行时），但把实现语言从 Go 换成 TypeScript，跑在 Node.js 上。目标是吃透「daemon 作为 Electron 旁路进程」这套架构的核心，而不是照抄全部子系统。

## 这份文档和 `frontend/` 的关系

- `frontend/` 讲 web/desktop **渲染层**的共享与平台抽象，已完成阶段 0~7 的骨架。
- `daemon/` 讲一个**独立于 Electron 主进程、同时服务 web 与 desktop**的本地 agent runtime：它探测机器上已装的 coding-agent CLI（`claude` / `codex` / ……），暴露 localhost HTTP API，接收任务、spawn 子进程执行、把结果流式返回。
- 两条线在**阶段 6 · Shell 集成**处会合：`apps/desktop` 负责 spawn `apps/daemon` 子进程、poll `/health`、经 IPC 暴露给渲染层；`apps/web` 直接用浏览器 HTTP 适配器连接同一套 daemon API。

## 阅读顺序

| 文档 | 作用 |
|---|---|
| `00-学习计划.md` | 总纲：八阶段路径、目标架构、约定 |
| `01-架构与思维模型.md` | 阶段 0：daemon 是什么、为什么独立进程、Go 与 TS 的取舍 |
| `02-项目骨架.md` | 阶段 1：最小可启动骨架、`tsx`、`AbortController`、信号处理 |
| `03-config-与-logger.md` | 阶段 2：env + `zod` 校验、pino 结构化多流日志 |
| `04-health-http-server.md` | 阶段 3：19514 端口 `node:http`、`/health` + `/shutdown`、端口冲突 |
| `05-claude-backend.md` | 阶段 4：`Backend` 接口 + `ClaudeBackend`、spawn + stdin + stream-json 解析、abort 杀进程树 |
| `06-task-api.md` | 阶段 5：`POST /task/run` + `GET /task/:id/events` NDJSON 流 + `DELETE` 取消；store append-only 回放、runner 状态机、并发上限 |

阶段 6（Shell 集成）及之后随进度生成。

对照 multica 源码阅读：`D:\Projects\src\multica\server\internal\daemon\`、`D:\Projects\src\multica\server\pkg\agent\`、`D:\Projects\src\multica\apps\desktop\src\main\daemon-manager.ts`。

## 当前进度

已完成到**阶段 5（Task HTTP API + NDJSON）**：

- `apps/daemon` 骨架可起：`pnpm dev:daemon` 跑通、`AbortController` 单点关闭、Ctrl-C 干净退出。
- Config + Logger：`DEMO_DAEMON_*` env 经 `zod` 校验，pino 同时打 stdout（pretty）与 `~/.demo/daemon/daemon.log`（JSON）。
- Health server：`GET /health` 返回 `starting`/`running` 状态，`POST /shutdown` 触发优雅退出，端口被占时清晰报错退出。
- 共享类型 `@demo/core/daemon/*`（`DaemonConfig` schema、`HealthResponse`、task 协议）已下沉到 core，供将来 Electron 端复用。
- Claude backend：`Backend` 接口 + `ClaudeBackend`，spawn `claude`、stdin 写 prompt、stdout 行缓冲解析 stream-json、`AbortSignal` 经 `taskkill /T` 杀进程树；`probeClaude` 探测版本并填充 `health.agents`。
- Task HTTP API：`POST /task/run` 创建即返回 `task_id`、`GET /task/:id/events` NDJSON 流式（append-only 历史 + live 订阅，回放防丢首包）、`DELETE /task/:id` 经 `AbortController` 即时取消；runner 维护 `pending→running→done/failed/cancelled` 状态机；并发上限 `DEMO_DAEMON_MAX_TASKS`（默认 4）。

下一步进入阶段 6 · Shell 集成：在 `@demo/core` 定义 `DaemonClient` 接口，`apps/desktop` 经 IPC 适配 + spawn daemon-manager，`apps/web` 直接用浏览器 fetch 连同一套 HTTP，共享 chat UI 只依赖这层抽象。
