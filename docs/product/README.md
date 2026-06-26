# Product 学习文档（local-first 通用 agent 工作台）

> 这一系列是项目的**产品总纲**：把 `frontend/`（共享渲染层）+ `daemon/`（本地 agent runtime）两条线，组装成一个 **local-first、能干活的通用 agent 工作台**。产品形态参考 [`nexu-io/open-design`](https://github.com/nexu-io/open-design) 的架构精髓，但**不限于设计领域**——artifact 是任意「干活的产物」（代码 / 文档 / 原型 / 配置 / 脚本）。**不走 multica 的 linear issue/task 分发模式。**

> 两个面向未来的特色：**双 runtime**（agent runtime 可本地可云端，用户选）+ **local-first 本地 SQLite + 未来云端 ElectricSQL 同步**。

## 这份文档和 `frontend/`、`daemon/`、`server/` 的关系

- `frontend/` 讲 **web/desktop 渲染层**的共享与平台抽象（已完成阶段 0~7）。
- `daemon/` 讲**本地 agent runtime**（`apps/daemon`，spawn claude、19514 HTTP、流式 chat，已完成全部八阶段）。
- `server/` 讲**远端认证服务**（已**暂停**——未来会被重新激活为「云端 runtime shell」，见下）。
- `product/`（本系列）是**产品总纲**：新增**共享业务内核 `packages/runtime`**，把 `apps/daemon` 演进成**本地 runtime shell**，组装出产品形态——多 agent、session/artifact 模型、SQLite 持久化、artifact-first preview、skills、project/workspace、本地文件系统能力、导出；并**为云端 runtime shell 预留**。它统领 frontend/daemon。

三条线的关系：

```
frontend  → 渲染层（web + desktop 共享 UI / 平台抽象）        【已完成】
daemon    → 本地 agent runtime（Backend 抽象 + spawn claude）  【已完成】
product   → 产品总纲：共享内核 packages/runtime + 本地 runtime shell（daemon 演进）
            多 agent · session/artifact · SQLite · preview · skills · project · 文件系统 · 导出
            双 runtime（本地先做、云端预留）· 未来 ElectricSQL 同步              【本系列】
server    → 远端认证（暂停）→ 未来升级为「云端 runtime shell」（复用共享内核）
```

> 与 `AGENTS.md` 不冲突：本支线新增 `packages/runtime` 共享包、把 `apps/daemon` 演进为本地 shell，不改写既有包边界规则；不引入 multica 的 cloud task server（第 6 节）。

## 阅读顺序

| 文档 | 作用 | 是否写代码 |
|---|---|---|
| `00-学习计划.md` | 总纲：产品定位、共享内核+双runtime 架构、九阶段路径、关键决策与约定 | 否 |
| `01-架构与思维模型.md` | 阶段 0：做什么 vs multica/open-design、local-first+artifact-first、共享内核+双runtime、数据流、关键决策、对照表、自测题 | 否 |
| `02-数据层与共享内核.md` | 阶段 1：`packages/runtime` 骨架、Drizzle schema（sync-friendly）、本地 SQLite、daemon 接入 Hono | 是 |
| `03-session与artifact模型.md` | 阶段 2：`task` 升级为 `session`+`artifact`；内核领域逻辑 + Hono 路由；`RuntimeClient` 扩展 | 是 |
| `04-多agent-adapter.md` | 阶段 3：agent 注册表 + 路由 + 多 agent 探测（claude + 1） | 是 |
| `05-artifact-preview.md` | 阶段 4：sandboxed iframe 预览、流式 artifact parser | 是 |
| `06-skills文件系统.md` | 阶段 5：`SKILL.md` 解析、registry 多目录扫描 + 热重载、picker、注入 | 是 |
| `07-project-workspace-ui.md` | 阶段 6：project 列表/创建、文件面板、session 历史、artifact 浏览；TanStack DB 接本地 SQLite | 是 |
| `08-本地文件系统能力.md` | 阶段 7：`PlatformCapabilities` 扩展、folder import、agent 在真实项目干活 | 是 |
| `09-导出与dogfood.md` | 阶段 8：artifact 导出（HTML/ZIP）、打包、端到端 dogfood | 是 |
| （后期）`10-云端runtime-shell.md` | 云端 shell（复用共享内核）、Postgres、ElectricSQL 同步、认证；客户端切云端模式 | 是 |

> 阶段 1~8 文档随实现逐篇推进（沿用 `daemon/` 系列「先读文档 → 写代码 → 验证 → 下一阶段」的节奏）。阶段依赖：**1→2→（3/4/5 可调换）→6→7→8**；云端 runtime shell 是 8 之后的后期展望。

## 对照源码阅读

本系列对照两个上游 + 数据同步参考 + 本项目现状：

- **open-design（产品形态 + 架构参考）**：`https://github.com/nexu-io/open-design`
  - `docs/architecture.md`（拓扑、组件图、数据流、preview、安全模型）、`docs/roadmap.md`（分阶段、决策 log）、`docs/skills-protocol.md`、`docs/agent-adapters.md`
  - 它的 daemon + adapter 架构本就借鉴 multica。
- **multica（daemon + adapter 骨架原型 + 云端 runtime 参考）**：`D:\Projects\src\multica\`
  - `apps/desktop/src/main/daemon-manager.ts`、`server/internal/daemon/`、`server/pkg/agent/`
- **数据访问 / 同步参考**：
  - TanStack DB：`https://tanstack.com/db/latest`（SQLite persistence + electric-collection）
  - Electric Collection：`https://tanstack.com/db/latest/docs/collections/electric-collection`（Postgres-centric shape sync）
  - Drizzle ORM：`https://orm.drizzle.team`
- **本项目现状（演进的起点）**：
  - `apps/daemon/src/agent/{backend,claude,stream-json,probe}.ts`（Backend 抽象 + ClaudeBackend）
  - `apps/daemon/src/task/{store,router,runner}.ts`（task 模型——待升级为 session/artifact）
  - `apps/daemon/src/health/server.ts`（裸 node:http——待替换为 Hono）
  - `packages/core/daemon/{client,task}.ts`（DaemonClient——待演进为 RuntimeClient）
  - `packages/views/daemon/chat-view.tsx`（chat-only UI——待演进为 artifact-first）
  - `packages/core/platform/types.ts`（PlatformCapabilities——待扩展文件系统能力）

## 当前进度

本支线**刚起步**：

- ✅ 阶段 0 文档骨架完成：`00-学习计划.md`（总纲）、`01-架构与思维模型.md`（理论）、本 `README.md`。产品定位、**共享内核 + 双 runtime** 架构、九阶段路径、关键决策与技术选型已锚定。
- ⏳ 阶段 1~8：从「数据层 + 共享内核骨架」逐篇推进（边做边写），把现有「单 agent + 纯 chat + 内存 task + 裸 http」演进成「共享内核 + 本地 runtime shell + 多 agent + artifact-first + SQLite + skills + project + 本地干活」的完整工作台；云端 runtime shell 作为后期展望。

**技术选型速览**（详见 `00` 第 6 节）：共享业务内核 `packages/runtime`（本地/云端复用）/ 本地 runtime shell 先做、云端预留（双 runtime）/ Hono 共享 API 层（替换裸 node:http）/ SQLite+Drizzle（元数据）+ 文件（artifact 内容）/ sync-friendly schema + 未来 ElectricSQL 同步 / 多 agent registry 路由 / sandboxed iframe 预览 / `SKILL.md` 文件系统 / folder import + 继承 agent 权限模型 / Vite+TanStack+Electron（非 Next.js）。

下一步：读完 `00` + `01` 后告诉我，我们从阶段 1（数据层 + 共享内核骨架）开始动手。
