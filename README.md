# desktop-web-demo

一个学习项目：从零搭一套 **web 与 Electron 桌面端同步开发** 的前端骨架，两端共享同一套 UI 与业务逻辑；再引入一个**本地 Node.js daemon**，作为两个壳子共用的 agent 运行时。

核心命题：

- **同构共享** —— 让 `apps/web` 和 `apps/desktop` 共享同一套 UI 与业务逻辑，两个 app 只是两个「薄外壳」，改一处、两端同步生效。
- **本地 runtime** —— 让两端通过同一套本地 HTTP API 与 `apps/daemon` 通信；daemon 探测机器上已装的 coding-agent CLI，接收任务、spawn 子进程、流式返回结果。

---

## 技术栈

- **路由**：TanStack Router（file-router）—— web 与 desktop 渲染层同构共享
- **构建**：Vite（web）、electron-vite（desktop）
- **桌面**：Electron
- **UI**：React 19 + Tailwind v4（shadcn 风格）
- **daemon**：Node.js + TypeScript，原生 `node:http` 暴露本地 HTTP API
- **工程**：pnpm workspace + turbo

---

## 仓库结构

```
desktop-web-demo/
├── apps/
│   ├── web/            # 浏览器外壳
│   ├── desktop/        # Electron 桌面外壳（main/preload/renderer）
│   └── daemon/         # 本地 agent runtime（Node.js + localhost HTTP）
├── packages/
│   ├── ui/             # @demo/ui   原子组件 + 样式
│   ├── views/          # @demo/views 共享页面 + 布局
│   └── core/           # @demo/core 平台能力接口 + 共享类型
├── docs/
│   ├── frontend/       # 共享前端学习文档
│   ├── daemon/         # 本地 daemon 学习文档
│   └── design.md       # UI 设计规范
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

依赖方向单向：`apps → @demo/views → @demo/ui + @demo/core`；`ui` 与 `core` 互相独立；`apps/daemon` 只依赖 `@demo/core` 的类型与纯函数。

---

## 快速开始

```bash
pnpm install            # 根目录安装（自动链接 workspace 各包）
pnpm dev:web            # 启动浏览器端
pnpm dev:desktop        # 启动桌面端
pnpm dev:daemon         # 启动本地 daemon
```

---

## 学习文档

两条学习线，分别按编号顺序阅读：

- **共享前端**：`docs/frontend/` —— web + desktop 同构共享、平台能力抽象、主 UI 骨架。
- **本地 daemon**：`docs/daemon/` —— 本地 agent runtime、HTTP API、子进程流式。
- **UI 规范**：`docs/design.md` —— 所有界面实现以此为准。

各目录的 `README.md` 有完整索引与当前进度。

---

## 协作约定

- 提交信息用**简体中文**、Conventional Commits 结构化风格，详见 `CLAUDE.md` 第 13 节。
- 提交信息**不含**任何 AI / Claude 协作署名。
