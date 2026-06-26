# Server 学习文档（Hono 认证 server）

> 这一系列文档兑现 `daemon/00` 目标架构图里那个被「晾在远处」的方块——**远端 hono server（用户认证 / license / 同步设置）**。我们用一个 **Hono + TypeScript** 写的远端服务把这块做出来，**不碰 task 分发**，与本地 daemon 是两条永不相交的平行线。

## 这份文档和 `frontend/`、`daemon/` 的关系

- `frontend/` 讲 web/desktop **渲染层**的共享与平台抽象（已完成阶段 0~7）。
- `daemon/` 讲**本地** agent runtime（`apps/daemon`，localhost :19514，已完成全部八阶段）。
- `server/`（本系列）讲一个**远端**认证服务（`apps/server`）：用户登录、license 签发/验签、用户设置同步。它是 desktop 主进程与 web renderer 的共同 client，**但 daemon 完全不与它通信**。

三条线的边界：

```
frontend  → 渲染层（web + desktop 共享 UI）
daemon    → 本机 agent runtime（:19514，desktop spawn 它、web 直连它）
server    → 远端认证服务（HTTPS，desktop main 与 web 都是它的 client）
            daemon 与 server 之间：✗ 完全不通信
```

> 与 `AGENTS.md` 第 6 节不冲突：那条约束否定的是 multica 的 **Go cloud task server**（task 分发、多机协同、daemon 编排）。本系列做的是**认证边缘服务**，不碰 task，daemon 依旧只认本机壳子的 localhost HTTP。

## 阅读顺序

| 文档 | 作用 | 是否写代码 |
|---|---|---|
| `00-学习计划.md` | 总纲：目标架构、九阶段路径、技术选型、约定 | 否 |
| `01-架构与思维模型.md` | 阶段 0：server 是什么、为什么独立于 daemon、与 multica 差异 | 否 |
| `02-项目骨架.md` | 阶段 1：`apps/server` 最小 Hono、`tsx watch`、`/health`、信号处理 | 是 |
| `03-config-与-logger.md` | 阶段 2：env + `zod`、pino 结构化日志（对齐 daemon 阶段 2） | 是 |
| `04-数据层.md` | 阶段 3：Drizzle ORM + SQLite、schema、`drizzle-kit` 迁移 | 是 |
| `05-注册与登录.md` | 阶段 4：argon2id、opaque session token、Bearer 中间件、限流 | 是 |
| `06-license.md` | 阶段 5：Ed25519 签发、client 离线验签（multica 无此子系统） | 是 |
| `07-设置同步.md` | 阶段 6：用户级 KV、多端 last-write-wins | 是 |
| `08-客户端集成.md` | 阶段 7：`AuthClient` 下沉 core、desktop secure storage + IPC、web fetch | 是 |
| `09-部署与发布.md` | 阶段 8：Docker、生产 Postgres、TLS、CI | 是 |

> 阶段 1~8 文档随实现逐篇推进（沿用 `daemon/` 系列「先读文档 → 写代码 → 验证 → 下一阶段」的节奏）。

## 对照 multica 源码阅读

本系列对照 multica 的 Go server（**只取认证边缘，弃整条 task 管线**）：

- **认证边缘（对照心智）**：`D:\Projects\src\multica\server\internal\auth\`（`jwt.go`、`cookie.go`）、`internal\handler\auth.go`（SendCode/VerifyCode/GetMe/UpdateMe）、`internal\handler\personal_access_token.go`、`internal\middleware\auth.go`、`internal\middleware\ratelimit.go`。
- **数据层（对照心智）**：`migrations\001_init.up.sql`（user 表）、`migrations\009`/`011`/`064`（验证码/PAT/通知偏好）、`pkg\db\queries\user.sql`、`sqlc.yaml`（Postgres + sqlc）。
- **明确不取（理解为什么不照搬）**：`internal\daemon\`、`internal\daemonws\`、`internal\scheduler\`、`pkg\agent\`（claude/codex/cursor/…）、`internal\realtime\`、`internal\events\`——整条 cloud task 管线。
- **multica 没有 license 子系统**：全仓 grep 仅在 skill 文件名过滤命中 "license"。本系列的 license 是自我设计（Ed25519 离线验签），无 multica 先例可对照。

## 当前进度

本支线**刚起步**：

- ✅ 阶段 0 文档骨架完成：`00-学习计划.md`（总纲）、`01-架构与思维模型.md`（理论）、本 `README.md`。方向、架构、技术选型、九阶段路径已锚定。
- ⏳ 阶段 1~8：`apps/server` 尚未创建，待方向确认后从阶段 1（项目骨架）逐篇推进。

**技术选型速览**（详见 `00` 第 6 节）：Hono + Node ≥ 20 / Drizzle + SQLite（→生产 Postgres）/ argon2id 密码 / opaque session token（Bearer）/ Ed25519 离线 license / `AuthClient` 下沉 `packages/core/server/*`。

下一步：读完 `00` + `01` 后告诉我，我们从阶段 1 开始动手建 `apps/server`。
