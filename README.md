# desktop-web-demo

一个学习项目：参照 https://github.com/multica-ai/multica 的架构，复刻一套 **web 与 Electron 桌面端同步开发** 的前端，并做出 multica 风格的主要 UI。

核心命题：**让 `apps/web` 和 `apps/desktop` 共享同一套 UI 与业务逻辑，两个 app 只是两个「薄外壳」——改一处，两端同步生效。**

---

## 技术栈

- **路由**：TanStack Router（file-router）—— web 与 desktop 渲染层同构共享
- **构建**：Vite（web）、electron-vite（desktop）
- **桌面**：Electron
- **UI**：React 19 + Tailwind v4（shadcn 风格）
- **工程**：pnpm workspace + turbo

> 为什么不用 multica 的 Next.js？因为 Next.js 是 SSR 架构，很难干净地塞进 Electron 渲染层，multica 因此被迫在两端用不同路由并发明一层适配器。我们用纯客户端的 TanStack Router，两端同构，省掉那层复杂度。详见 `docs/01`。

---

## 仓库结构

```
desktop-web-demo/
├── apps/
│   ├── web/            # 浏览器外壳
│   └── desktop/        # Electron 桌面外壳（阶段 4 起）
├── packages/
│   ├── ui/             # @demo/ui   原子组件 + 样式
│   ├── views/          # @demo/views 共享页面 + 布局
│   └── core/           # @demo/core 平台能力接口 + 无头逻辑
├── docs/               # 学习文档（简体中文，按阶段编号）
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

依赖方向单向：`apps → @demo/views → @demo/ui + @demo/core`；`ui` 与 `core` 互相独立。

---

## 快速开始

```bash
pnpm install            # 根目录安装（自动链接 workspace 各包）
pnpm dev:web            # 启动浏览器端 http://localhost:3000
pnpm dev:desktop        # 启动桌面端（阶段 4 之后）
```

> 仓库目前处于**阶段 1**：已完成 monorepo 化，web 可运行；desktop 与共享包随后续阶段逐步加入。完整路线见 `docs/00-学习计划.md`。

---

## 学习文档

所有讲解在 `docs/` 下，简体中文，按编号顺序阅读：

- `docs/00-学习计划.md` —— 总纲（目标、八阶段路径、架构图）
- `docs/01-架构与思维模型.md` —— 理论基础（web→desktop 迁移、三进程模型、核心抽象）
- `docs/02-monorepo-化.md` —— 阶段 1 实操
- `docs/README.md` —— 完整索引

---

## 协作约定

- 提交信息用**简体中文**、Conventional Commits 结构化风格，详见 `CLAUDE.md` 第 7 节。
- 提交信息**不含**任何 AI / Claude 协作署名。
