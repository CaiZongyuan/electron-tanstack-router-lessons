## 工作方式（与用户协作，必读）

- **包安装与运行命令由用户手动执行**：`pnpm install`、`pnpm dev:*`、`pnpm build`、`pnpm typecheck`、`pnpm test`、打包等会**改变环境或启动进程**的命令，一律交给用户在终端手动跑——这是学习项目，让用户亲手执行以加深理解。Claude 只负责文档与代码的编写，并给出「**待执行命令清单 + 预期结果 + 如何判断通过**」，由用户运行后反馈。
- Claude 可自主执行：读文件、搜索、写/改文件、git 暂存与提交（提交信息遵循第 13 节规范）。
- 验证类结论：在用户反馈运行结果之前，**不要声称**「构建通过 / 类型检查通过」之类。改为「请在终端执行 X，预期看到 Y」。

---

## 1. 这是什么项目

一个**学习项目**。目标：参照 https://github.com/multica-ai/multica 的架构与开发方式，在本仓库复刻一套「**web 与 Electron 桌面端同步开发**」的前端，并做出 multica 风格的主要 UI。multica 仓库本地路径 `/root/Projects/Agents/multica`（pnpm + turbo monorepo，web 用 Next.js、desktop 用 Electron）。

- **不照搬 multica 的技术选型**：我们的 web 与 desktop 渲染层统一用 **Vite + React 19 + TanStack Router + Tailwind v4**。这个选择带来一个关键简化（见第 8 节）。
- **没有后端、没有 Go server、没有 mobile、没有 daemon/CLI**：这些都是 multica 的范围，本项目一律不涉及。不要照搬相关规则。
- 进度与讲解在 `docs/`，按 `00 → 01 → 02 …` 推进，每个编号是一个学习阶段。

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 路由（web + desktop 共享） | TanStack Router（file-router 模式） |
| 构建（web） | Vite |
| 桌面外壳 | Electron + electron-vite |
| UI | React 19 + Tailwind v4（shadcn 风格组件） |
| 包管理 | pnpm（workspace） |
| 任务编排 | turbo |
| 语言 | TypeScript（strict） |

## 3. 目标仓库结构

```
desktop-web-demo/
├── apps/
│   ├── web/            # 浏览器外壳（Vite + TanStack Router）
│   └── desktop/        # Electron 桌面外壳（main/preload/renderer）
├── packages/
│   ├── ui/             # @demo/ui   原子组件 + 样式 token
│   ├── views/          # @demo/views 共享页面 + 布局外壳
│   └── core/           # @demo/core 平台能力接口 + 无头逻辑 + 共享类型
├── docs/               # 学习文档（简体中文）+ docs/design.md 设计规范
├── pnpm-workspace.yaml
├── turbo.json
└── package.json        # 根（含 dev:web / dev:desktop 等脚本）
```

包名统一 `@demo/` 前缀。共享包**导出原始 `.ts/.tsx` 源码**（非编译产物），由各 app 的 Vite 各自编译。依赖方向**单向**：`apps → @demo/views → @demo/ui + @demo/core`；`@demo/ui` 与 `@demo/core` 互相独立。

## 4. 包边界（硬约束，违反即错误）

| 包 | 禁止 |
|---|---|
| `@demo/ui` | import `@demo/core`；含业务逻辑 |
| `@demo/views` | 直接调用平台原生能力（须走 `@demo/core` 能力接口） |
| `@demo/core` | `react-dom`、`localStorage`、DOM、UI 库 |

补充（对齐 multica 思路，按本项目栈调整）：

- `apps/web`、`apps/desktop` 的 renderer 才允许写平台专属 API（Next.js / Electron / 浏览器原生能力）。
- 每个 `apps/*` 和 `packages/*` 必须在自己 `package.json` 里声明直接 import 的外部依赖（不能靠隐式 hoisting）。
- 共享依赖用 `workspace:*`；关键库版本在两端保持一致（必要时用 pnpm `catalog:`）。

## 5. 共享规则（什么时候该抽包）

如果同一段逻辑在 web 和 desktop 都要用，就抽到共享包——**除非它依赖平台 API**：

1. 平台 API（Electron、浏览器原生能力）留在 app 层 / 平台适配层。
2. 无头逻辑、共享类型、能力接口 → `@demo/core`。
3. 业务页面、布局外壳 → `@demo/views`。
4. 原子组件 → `@demo/ui`。
5. web 与 desktop 完全相同的组件，必须进共享包，不要在两个 app 各写一份。

## 6. 状态管理分工

即使现在用 mock 数据，也要从一开始就保持**服务端状态 / 客户端状态分离**的心智：

- **服务端状态**（将来从 API 来的数据：issue 列表、工作区等）：归 TanStack Query。即便现在是 mock，也用 query hook 包一层，便于将来换真实 API。
- **客户端状态**（UI 状态：当前工作区、筛选、抽屉开关、主题）：归 Zustand，或 React Context（仅用于「平台管线」如 Provider 注入）。
- 共享的 Zustand store 放 `@demo/core`，不放 `@demo/views` 或 app 目录。
- Context 只用于平台管线（如能力接口 Provider），不用于业务状态。

## 7. 新增一个 web/desktop 共享页的流程

1. 页面/组件写进 `packages/views/<domain>/`。
2. 在 `apps/web` 的 TanStack 路由里挂载它；阶段 4 后再在 `apps/desktop` 渲染层路由里挂载同一个组件。
3. 共享代码里导航用 TanStack Router 的 `Link` / `useNavigate`（两端同构，无需适配器）。
4. 需要平台能力（打开外链、通知等）时，调 `@demo/core` 的能力接口，不要直接调 `window.desktopAPI` 或浏览器 API。
5. 平台专属 UI 留在 app 层，或通过 props/slot 注入。

## 8. 最关键的设计判断（必须理解）

multica 的 web 用 Next.js、desktop 渲染层用 react-router-dom，**两套路由 API 不同**，被迫发明 `NavigationAdapter` 接口（`packages/views/navigation/types.ts`）做隔离。

**本项目两端同构（都用 TanStack Router），所以：**

- ✅ **路由层可直接共享**：`@demo/views` 直接用 TanStack 的 `Link` / `useNavigate` / `useParams`，**不需要** `NavigationAdapter`。不要照搬 multica 这层抽象。
- ⚠️ **但「平台能力」仍必须抽象**：打开外链、原生通知、文件、对话框等，web（浏览器 API）与 desktop（经 IPC 走主进程）永远不同。在 `@demo/core` 定义能力接口，两端各自实现并在 Provider 注入。

一句话：**路由同构省掉导航适配器；平台能力抽象不可省。**

## 9. UI 设计规范（详见 `docs/design.md`）

所有 UI 以 `docs/design.md` 为准。要点（违反即需改）：

- **克制即高级**：默认做减法；层次靠灰度，颜色只传递语义；一致性大于个性。
- **颜色用语义 token**（`bg-background`、`text-muted-foreground`、`text-destructive`…），**禁止硬编码** Tailwind 色值（`text-gray-500`、`bg-blue-600`）。
- **字号只用** `text-xs` / `text-sm` / `text-base` 三档；**字重只用** `font-normal` / `font-medium`（禁 `font-bold`/`semibold`）。
- **间距用 Tailwind 内置 scale（4px 网格）**，禁任意像素值。分隔优先用「增大间距」，分割线是最后手段。
- **交互状态纪律**：hover 比 active 更淡；active 被 hover 时必须仍可辨识（用字重/颜色维度区分，不只靠背景）。
- **优先 shadcn 组件**：用 `pnpm ui:add <组件>` 把组件源码脚手架进 `packages/ui/components/ui/`（配置在 `packages/ui/components.json`，style `base-nova` / Base UI，与 multica 同构；shadcn 没有的再手写）。图标统一 Lucide；圆角用 `--radius` 派生的 token。
- **明暗主题必须双模验证**；dark 模式用深灰不是纯黑。
- 详细的反模式清单、检查清单见 `docs/design.md` 第 10、11 节。

## 10. 代码规则

- TypeScript strict；类型显式。
- **代码注释用简体中文**，只在意图不明显处写，点明「为什么」，简短。（这是本项目与 multica「注释用英文」的**有意差异**——本项目面向中文学习者。）
- 复用既有模式/组件，不要新建平行抽象。
- 非边界代码不添加兼容层、fallback、双写、legacy 适配、临时 shim，除非明确要求。
- 优先移除被替换的旧路径，而非新旧并存（产品未上线）。

## 11. 测试与验证

- 测试跟着代码走：共享逻辑/组件测试放对应 `packages/*`；平台接线测试放对应 `app`。
- 不要在 app 测试里测共享组件行为。
- 验证时先跑最窄有用的检查（`pnpm typecheck`），风险高或被要求时再跑更广的（`pnpm test` / `pnpm build`）。
- **没跑过就不要声称「验证通过」**。因纯文档改动或用户要求跳过检查时，明说。

## 12. 开发命令

```bash
pnpm install            # 根目录安装（workspace 自动链接各包）
pnpm dev:web            # 起浏览器端
pnpm dev:desktop        # 起 Electron 桌面端（阶段 4 后可用）
pnpm build              # 全量构建
pnpm typecheck          # 全量类型检查
pnpm ui:add button      # 用 shadcn 把组件源码脚手架进 packages/ui（同 multica）
```

web 单独：`pnpm -C apps/web dev`。新增共享包后，消费方 `package.json` 加 `"@demo/xxx": "workspace:*"`。

## 13. Git 提交规范（本项目强制）

- **提交信息一律用简体中文**，Conventional Commits 结构化风格：

  ```
  <type>(<scope>): <主题，简体中文>

  <正文：分点说明改了什么、为什么>
  ```

- **type**：`feat` / `fix` / `docs` / `refactor` / `chore` / `build` / `style` / `test` / `perf`
- **scope**：受影响区域，如 `monorepo` / `web` / `desktop` / `ui` / `views` / `core` / `docs` / `design`
- 正文中文分点，说清「做了什么 + 为什么」。一个提交只做一件逻辑上的事。
- **禁止任何 AI / Claude 协作署名**：不得出现 `Co-Authored-By: Claude`、`Generated with Claude Code`、`🤖` 等。提交信息只体现人的意图。
- 默认直接提交到 `master`（个人学习项目，单人维护）。未要求时不建分支、不 push、不发 PR。

## 14. 文档导航

| 文档 | 作用 |
|---|---|
| `docs/README.md` | 文档索引（阶段文档 + 参考文档） |
| `docs/00-学习计划.md` | 总纲：八阶段路径、目标架构、约定 |
| `docs/01-架构与思维模型.md` | 阶段 0：理论基础（必读） |
| `docs/02-monorepo-化.md` 起 | 各阶段实操（随进度生成） |
| `docs/design.md` | UI 设计规范（参考文档，所有 UI 以此为准） |

## 15. 常见陷阱

- **两个 React 实例**：出现 hooks 报错（"invalid hook call"）多半是版本/实例不一致。靠 `workspace:*` + 关键库版本统一（必要时 `catalog:`）+ electron-vite 的 `dedupe: ["react","react-dom"]` 兜底。
- **Electron dev/prod 加载**：dev 连 Vite dev server（`loadURL`），prod 加载打包文件（`loadFile`）。主进程用 `is.dev` 分支（对照 multica `apps/desktop/src/main/index.ts:310`）。
- **不要在 `@demo/views` 里直调 `window.desktopAPI`**：走 `@demo/core` 能力接口，否则该页面在 web 端会崩。
- **UI 反模式**：硬编码颜色、`font-bold`、`text-lg`、`shadow-*`、hover `scale-105`、固定宽 dropdown、纯黑背景——详见 `docs/design.md` 第 10 节。
