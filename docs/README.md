# desktop-web-demo 学习文档

这是一个**学习项目**。目标：参照 `multica` 项目的架构与开发方式，在本仓库里复刻一套「web 与 Electron 桌面端同步开发」的前端，并做出 multica 风格的主要 UI。

你已有的基础：Next.js / TypeScript / React 经验，前端已用 **TanStack Router** 初始化好，包管理器是 **pnpm**。要补的短板：**Electron**，尤其是「怎么让同一份代码同时跑在浏览器和桌面端」。

---

## 文档组织

文档分两类：

**学习阶段文档**（编号即阅读顺序，`00` 是总纲，`01` 起每个编号对应一个阶段，配概念讲解 + 可运行代码）：

| 文档 | 主题 | 是否写代码 |
|---|---|---|
| `00-学习计划.md` | 总纲：目标、架构、八阶段路径、约定 | 否（先读这个） |
| `01-架构与思维模型.md` | 从 web 到 desktop 的认知迁移、monorepo 全景、核心抽象 | 否（理论基础） |
| `02-monorepo-化.md` | 把单 app 改造成 pnpm workspace | 是 |
| `03-抽取-packages-ui.md` | 第一个共享包，掌握 workspace 依赖 | 是 |
| `04-抽取-packages-views.md` | 共享页面/布局，理解复用的关键 | 是 |
| `05-引入-electron.md` | 搭起 apps/desktop，让 Electron 显示同一套 UI | 是 |
| `06-平台能力抽象.md` | 处理 web 与 desktop 的差异（原生能力） | 是 |
| `07-复刻主要-ui.md` | 做出 multica 风格的侧边栏/顶栏/页面 | 是 |
| `08-打包与收尾.md` | electron-builder、脚本、总结 | 是 |

> 阶段文档随学习进度逐步生成，不会一次性铺开。

**参考文档**（随时查阅，不按阶段）：

| 文档 | 主题 |
|---|---|
| `design.md` | UI 设计规范：设计哲学、颜色/字体/间距 token、交互状态纪律、反模式清单、提交前检查清单。所有 UI 以此为准。 |

---

## 怎么用这些文档

1. **先通读 `00` 和 `01`**：建立「为什么这么设计」的心智模型，不动手。
2. **从 `02` 开始逐阶段推进**：每个阶段都做到「能跑 + 理解」，再进下一阶段。每个阶段都有明确的「验证方式」，跑通才算完成。
3. **遇到 multica 的真实代码**：文档里用反引号路径标注，例如 `apps/desktop/src/main/index.ts:310`，可直接对照 multica 仓库阅读。

---

## 约定（贯穿全系列）

- **包名前缀**：workspace 包统一用 `@demo/` 前缀，例如 `@demo/web`、`@demo/desktop`、`@demo/ui`、`@demo/views`、`@demo/core`。
- **语言**：所有讲解用简体中文；代码注释在关键处用中文点明「为什么」。
- **栈**：web 与 desktop 渲染层统一用 **Vite + React 19 + TanStack Router + Tailwind v4**。这套选择会带来一个比 multica 更简洁的架构（详见 `01`）。
- **包管理器**：pnpm（已在用）。
- **任务编排**：turbo（和 multica 一致，学习它的 monorepo 开发方式）。

---

## 一句话目标

> 让 `apps/web` 和 `apps/desktop` 共享同一套 UI 与业务逻辑（放在 `packages/*`），两个 app 只是两个「薄外壳」，一个跑在浏览器、一个跑在 Electron 窗口里。改一处，两端同步生效。
