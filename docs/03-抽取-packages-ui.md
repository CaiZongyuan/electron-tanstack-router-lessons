# 03 · 阶段 2 — 抽取 `packages/ui`

> 目标：建立第一个共享包 `@demo/ui`，让 `apps/web` 从它引入组件与样式 token。借此掌握三件事：**共享包如何导出原始源码**、**`workspace:*` 如何引用**、**`catalog:` 如何统一关键库版本**。验证：web 页面用上来自 `@demo/ui` 的 `<Button>`，且改 Button 源码 web 即时热更新。

---

## 1. 三个核心概念

### 1.1 共享包导出「原始源码」，不是编译产物

multica 和我们一样：`packages/ui/package.json` 的 `exports` 直接指向 `.ts/.tsx` 文件，消费方（apps/web 的 Vite）负责编译。好处：

- 不用给共享包配 build 步骤，改完即生效。
- 类型、Tree-shaking、HMR 都天然正常。

对比：传统 npm 包发布的是 `dist/` 编译产物，消费方拿不到源码和完整类型。我们不走那条路。

### 1.2 `workspace:*` 引用

`apps/web/package.json` 写 `"@demo/ui": "workspace:*"`，pnpm 会在 `node_modules/@demo/ui` 建一个**符号链接**指向 `packages/ui`。于是 `import { Button } from "@demo/ui/components/ui/button"` 实际读的是 `packages/ui/components/ui/button.tsx`。改源码 → 符号链接 → web 立刻看到。这就是「改一处两端生效」的底层机制。

### 1.3 `catalog:` 统一关键库版本（防「两个 React 实例」）

这是阶段 2 引入、并贯穿全程的机制。问题：如果 `apps/web` 用 React 19.2，`packages/ui` 声明 peerDep `react: ^19`，而将来某个包不小心装了另一个 React 副本，React 的 hooks 会因为「两个实例」报 `Invalid hook call`。根因不是 bug，是**版本/实例漂移**。

解法：在 `pnpm-workspace.yaml` 写一个 `catalog:` 段，集中声明所有包共享的关键库版本；各包 `package.json` 写 `"react": "catalog:"`，pnpm 自动替换成 catalog 里的版本。这样**全仓库永远只有一个 React 版本**。electron-vite 的 `dedupe: ["react","react-dom"]`（阶段 4）是双保险。

本阶段对 `react` / `react-dom` / `@types/react` / `@types/react-dom` / `typescript` 启用 catalog（保留各自现有版本，绝不改版本号）。

---

## 2. Tailwind v4 如何「看见」共享包里的类

`@demo/ui` 里的 Button 写了 `bg-primary`、`text-primary-foreground` 这类类名。这些类要生效，需要两个条件：

1. **扫描**：Tailwind v4 默认扫描当前项目源码，但 `packages/ui` 在 apps/web 之外，要显式声明。在 `apps/web/src/styles.css` 加 `@source "../../../packages/ui";`（相对 styles.css 向上 3 层到根，再进 packages/ui）。
2. **token**：`bg-primary` 里的 `primary` 颜色来自 CSS 变量。这些变量定义在 `packages/ui/styles/tokens.css`（OKLCh 色值 + `@theme inline` 映射）。web 用 `@import "@demo/ui/styles/tokens.css";` 把它引进来——这也是 `docs/design.md` 里「禁止硬编码颜色、用语义 token」的物理实现。

> `@source` 的路径是相对**当前 CSS 文件**算的。`apps/web/src/styles.css` 向上 3 层（`src`→`web`→`apps`→根），再到 `packages/ui`。

---

## 3. 操作清单

1. 在 `pnpm-workspace.yaml` 增加 `catalog:` 段（react 等 5 个关键库）。
2. 创建 `packages/ui/`：`package.json`、`tsconfig.json`、`lib/utils.ts`（`cn`）、`styles/tokens.css`、`components/ui/button.tsx`。
3. `apps/web/package.json`：加 `"@demo/ui": "workspace:*"`；把 react/react-dom/@types/\* /typescript 改成 `catalog:`。
4. `apps/web/src/styles.css`：引入 tokens.css + `@source` 声明。
5. `apps/web/src/routes/index.tsx`：用 `@demo/ui` 的 Button 做个演示。
6. 用户手动：`pnpm install` → `pnpm typecheck` → `pnpm build`（可选 `pnpm dev:web` 看按钮）。

---

## 4. 关键文件内容

### 4.1 `pnpm-workspace.yaml`（新增 catalog 段）

```yaml
packages:
  - "apps/*"
  - "packages/*"

catalog:
  react: "^19.2.0"
  react-dom: "^19.2.0"
  "@types/react": "^19.2.0"
  "@types/react-dom": "^19.2.0"
  typescript: "^6.0.2"
```

### 4.2 `packages/ui/package.json`

```json
{
  "name": "@demo/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./lib/utils": "./lib/utils.ts",
    "./components/ui/*": "./components/ui/*.tsx",
    "./styles/tokens.css": "./styles/tokens.css"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.4.0"
  },
  "peerDependencies": {
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "typescript": "catalog:"
  }
}
```

要点：`exports` 指向原始源码；`react/react-dom` 是 **peerDependencies**（由消费方提供，避免装第二份）；`catalog:` 统一版本；新增 `clsx`/`cva`/`tailwind-merge` 三个 UI 工具库（`cn` 与 Button 变体要用）。

### 4.3 `packages/ui/lib/utils.ts`

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// cn：合并 className，同时解决 Tailwind 类冲突（后者覆盖前者）
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### 4.4 `packages/ui/styles/tokens.css`

参照 multica `packages/ui/styles/tokens.css` 适配。结构是：`@theme inline` 把 token 暴露成 Tailwind 工具类（如 `--color-primary` → `bg-primary`），`:root` 给亮色赋值，`.dark` 给暗色赋值。完整文件随代码一起生成（含 background/foreground/primary/secondary/muted/accent/destructive/border/input/ring + brand/success/warning/info + radius）。

### 4.5 `packages/ui/components/ui/button.tsx`

shadcn 风格 Button，用 `cva` 定义变体（default/destructive/outline/secondary/ghost/link）与尺寸（default/sm/lg/icon），遵循 `docs/design.md` 的状态纪律（hover 比 active 淡、focus-visible ring、disabled 透明度等）。完整文件随代码生成。

### 4.6 `apps/web/src/styles.css`（接线）

```css
@import "tailwindcss";
@import "@demo/ui/styles/tokens.css";

@source "../../../packages/ui";

* { box-sizing: border-box; }
html, body, #app { min-height: 100%; }
body { margin: 0; }
```

### 4.7 `apps/web/src/routes/index.tsx`（演示）

把占位首页换成用 `@demo/ui` Button 的最小演示，证明端到端通路。

---

## 5. 验证（用户手动执行）

```bash
pnpm install     # 链接 @demo/ui、装 clsx/cva/tailwind-merge、应用 catalog
pnpm typecheck   # 现在覆盖 @demo/ui + @demo/web
pnpm build       # 构建产物里应包含 Button
pnpm dev:web     # 可选：看按钮，改 packages/ui 源码应即时热更新
```

判据：

- `pnpm install` 无 `ERR_PNPM`；`@demo/ui` 被识别为工作区成员。
- `pnpm typecheck` 两个包都过。
- `pnpm build` 成功；`pnpm dev:web` 打开 `http://localhost:3000` 能看到几个不同变体的按钮；改 `packages/ui/components/ui/button.tsx` 后页面热更新。

---

## 6. shadcn：组件从哪来（重要补充）

你可能会问：multica 用 shadcn，我们这个 `button.tsx` 是哪来的？——这一节讲清楚。

### 6.1 shadcn 的本质

shadcn **不是**一个你 `import` 的 npm 组件库。它是一个 **CLI 脚手架**：

```bash
npx shadcn add button
```

这条命令会把 `button` 组件的**完整源码**复制进你的项目（写到 `packages/ui/components/ui/button.tsx`），并按需把依赖（如 `@base-ui/react`、`@radix-ui/react-slot`）加进 `package.json`。**复制进来的源码归你所有**，你可以随便改。它读 `packages/ui/components.json` 来知道：写到哪、用哪个 style、CSS 变量在哪、图标库是谁。

对比传统组件库（MUI/AntD）：你 `import` 一个黑盒，升级靠发版、定制靠 props/API。shadcn 反过来：组件是你仓库里的普通 `.tsx`，定制直接改源码，没有黑盒。

### 6.2 multica 怎么用

- 配置在 `packages/ui/components.json`：`style: "base-nova"`（底层用 **Base UI** 无障碍原语）、图标用 lucide、CSS 变量指向 `styles/tokens.css`、别名指向 `@multica/ui/...`。
- 根 `package.json` 有 `"ui:add": "cd packages/ui && npx shadcn@latest add"`，于是 `pnpm ui:add <组件>` 就能在共享包里脚手架新组件。
- 组件源码进 `packages/ui/components/ui/`，被 web 和 desktop 共享。

### 6.3 我们的配置（与 multica 同构）

- 已加 `packages/ui/components.json`（同 multica，别名换成 `@demo/ui/...`）。
- 已加根脚本 `pnpm ui:add <组件>`。
- **当前 `button.tsx` 是我手写的 shadcn 风格简化版**（不带 Slot/asChild），目的是让阶段 2 聚焦在「共享机制」上、不被脚手架工具分散注意力。

**动手验证 shadcn（强烈建议跑一次，建立直觉）：**

```bash
pnpm ui:add button          # 会提示覆盖现有 button.tsx，选 yes
```

它会：拉取 shadcn 的 button 源码（base-nova / Base UI 版，带 `asChild` 支持）覆盖手写版，并把所需依赖（如 `@base-ui/react`）写进 `packages/ui/package.json`。然后你 `pnpm install` 装上即可。之后任何组件都这么加：

```bash
pnpm ui:add card
pnpm ui:add dialog
pnpm ui:add dropdown-menu
```

> **关于 style**：multica 用 `base-nova`（Base UI 原语）。如果你的 shadcn 版本报「style 不可用」，把 `components.json` 的 `"style"` 改成 `"new-york"`（Radix 原语）即可——底层原语库不同，但「CLI 拷源码、你拥有源码」的机制完全一样。

### 6.4 何时手写、何时 shadcn add

- 通用原子组件（button、input、dialog、dropdown、card…）→ `pnpm ui:add`。
- 项目专属、shadcn 没有的组件（如我们的 sidebar 业务外壳）→ 手写，但遵守 `docs/design.md` 的 token 与状态纪律。

### 6.5 踩坑：`pnpm ui:add` 报「Could not resolve aliases」

首次跑 `pnpm ui:add button` 很可能报：

```
Could not resolve the following aliases in .../packages/ui: components, lib, hooks.
Configure path aliases in tsconfig.json or imports in package.json ...
```

shadcn 读 `components.json` 里的别名根（`@demo/ui/components`、`@demo/ui/lib`、`@demo/ui/hooks`），要把每个根解析成「包内命名空间」才知道源码往哪写。判定规则是：剥掉自身包名 `@demo/ui` 后，剩下 `X` 必须在 `package.json` 的 `exports` 里有**直接的** `./X/*` 通配条目。

我们最初踩了两轮：

1. 第一轮三个全报错——因为 `hooks/` 目录不存在、exports 也没有 `./hooks/*`。修：建 `hooks/`（先放 `.gitkeep`）、exports 补 `"./hooks/*": "./hooks/*.ts"`。再跑，`hooks` 通过，只剩 `components, lib`。
2. 第二轮 `components`、`lib` 仍报错——因为 exports 里 `components` 只有**嵌套**的 `./components/ui/*`、`lib` 只有**精确**的 `./lib/utils`，都不是直接通配，shadcn 不认。修：把它们放宽成 `"./components/*": "./components/*.tsx"` 和 `"./lib/*": "./lib/*.ts"`。

> 注意：`tsconfig.json` 的 `paths` 对这步**没用**——三个别名都加了 paths，只有补了 exports 直接通配的 `hooks` 通过，差异只在 exports。paths 的作用是让**生成出来的源码**（`import { cn } from "@demo/ui/lib/utils"`）在包内 typecheck 时能解析，是另一回事。

最终 `exports` 形态（每个命名空间都是直接通配）：

```json
"exports": {
  "./lib/*": "./lib/*.ts",
  "./components/*": "./components/*.tsx",
  "./hooks/*": "./hooks/*.ts",
  "./styles/tokens.css": "./styles/tokens.css"
}
```

对照 multica：它的 `packages/ui` 同样 `hooks/` 有真实文件、`exports` 含 `./hooks/*`，所以从未踩这个坑。修好后 `pnpm ui:add button` 即可正常拉取源码。

### 6.6 踩坑续：`pnpm build` 报 `Failed to resolve import "@base-ui/react/button"`

别名解析通过、`ui:add button` 成功后，`pnpm build` 又报：

```
Error: Rolldown failed to resolve import "@base-ui/react/button" from ".../packages/ui/components/ui/button.tsx".
```

原因：shadcn 用 `base-nova` 样式生成的 button 源码里写了 `import { Button as ButtonPrimitive } from "@base-ui/react/button"`，但 **shadcn 没有把 `@base-ui/react` 写进 `packages/ui/package.json`**（base-nova 是较新的样式，当前 shadcn 版本这步漏了自动补依赖）。于是该包既没声明也没安装，构建时解析不到。

修：手动在 `packages/ui/package.json` 的 `dependencies` 加 `"@base-ui/react": "^1.3.0"`（与 multica 同版本），再 `pnpm install`。

> 教训：`pnpm ui:add <组件>` 之后，**看一眼它往 `package.json` 写了哪些依赖**，缺的手动补、再 `pnpm install`。shadcn 拷源码是可靠的，但「顺带装依赖」这一步在非默认样式下不一定靠谱。判断方式：构建报 `Failed to resolve import "X"`，基本就是 X 没装。

---

## 7. 小结

这一步把「共享包」从概念变成可触摸的东西：web 里渲染的按钮，源码在 `packages/ui`。`workspace:*` 是链接、`catalog:` 是版本护栏、`@source` + tokens.css 是样式通路。理解了这三层，阶段 3 抽 `packages/views`（共享页面）就是同一套机制的更大规模应用。
