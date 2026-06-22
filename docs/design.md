# UI 设计规范（design.md）

> 本规范参照 multica 的 `docs/design.md` 提炼，适配到本项目（学习项目、shadcn 风格、Tailwind v4）。
> 所有 UI 开发以此为准。token 在阶段 2 落地到 `packages/ui/styles/tokens.css`；在那之前，先用语义类名约定。

---

## 1. 设计哲学

三条核心原则：

1. **克制即高级。** 默认做减法。每个元素必须有存在的理由——多余的分割线、装饰性图标、「以防万一」的提示，都是噪音。留白本身就是设计。
2. **层次靠灰度，颜色是信号。** 界面主体是中性色。颜色只在传递语义时出现（状态、品牌、错误）。两个区域争抢注意力时，让一个退后，而不是都加色。
3. **一致性大于个性。** 同类交互必须有相同视觉反馈。sidebar、dropdown、table row 里的 hover 应该「感觉一样」，靠 token 而非硬编码实现。

---

## 2. 颜色体系

基于 CSS 变量（OKLCh 色彩空间）。**禁止硬编码 Tailwind 色值**（如 `text-gray-500`、`bg-blue-600`），一律用语义 token。

### 2.1 中性色阶梯（界面约 90% 面积）

| 角色 | Token | 用途 |
|---|---|---|
| 页面底色 | `background` | 页面背景 |
| 卡片/浮层 | `card` / `popover` | 容器表面 |
| 次级表面 | `muted` / `secondary` | hover 背景、标签底色 |
| 边框 | `border` | 分隔线、输入框边框 |
| 输入框边框 | `input` | 比 border 略重 |
| 主要文字 | `foreground` | 标题、正文 |
| 次要文字 | `muted-foreground` | 描述、元数据、placeholder |
| 最强调 | `primary` | 按钮文字（反色）、关键标签 |

**规则：** 同屏文字颜色最多 3 个层级（`foreground` / `muted-foreground` / 某语义色）。超过 3 级说明层次设计有问题。

### 2.2 语义色（只传递含义，不做装饰）

| Token | 含义 | 场景 |
|---|---|---|
| `brand` | 品牌 | Logo、品牌按钮、少量强调 |
| `destructive` | 危险/错误 | 删除按钮、校验错误、危险操作 |
| `success` | 成功 | 状态标签（完成、已解决） |
| `warning` | 警告 | 注意状态、到期提醒 |
| `info` | 信息 | 提示、链接、次要标记 |

**规则：** 语义色主要用于小面积元素（badge、icon、border）。大面积着色用该色 10%–20% 透明度变体（如 `bg-destructive/10`）。同屏语义色不超过 2–3 种。

### 2.3 暗色模式

暗色模式是**独立设计的一套配色**，不是简单反转：

- 背景用深灰（如 `oklch(0.18 ...)`），不是纯黑——纯黑在 LCD 上刺眼。
- 边框用白色低透明度（如 `oklch(1 0 0 / 10%)`），比 light 更微妙。
- 语义色在 dark 下适当提亮以保证对比度。
- **所有 UI 变更必须双模验证。**

---

## 3. 字体规范

### 3.1 字体家族

| 角色 | 变量 | 用途 |
|---|---|---|
| 正文/UI | `--font-sans`（Inter） | 默认字体；CJK 自动 fallback 到系统字体（PingFang SC / Microsoft YaHei / Noto Sans CJK SC） |
| 代码/数据 | `--font-mono`（Geist Mono） | 代码块、ID、时间戳、等宽数据 |
| 标题 | `--font-heading`（= sans） | 页面标题、区块标题 |

### 3.2 字号纪律（整个项目只用 3 个核心 + 1 个特殊）

| Class | 大小 | 角色 |
|---|---|---|
| `text-base` (16px) | 正文 | 页面标题、主要内容 |
| `text-sm` (14px) | 默认 | 菜单项、按钮、表单、列表项 |
| `text-xs` (12px) | 辅助 | badge、时间戳、次要信息 |
| `text-[0.8rem]` | 过渡 | 仅限 shadcn `size="sm"` 按钮 |

**禁止：** `text-lg`/`xl`/`2xl`（信息密度型工具不需要大字）；任意像素值如 `text-[11px]`；同一区块混用超过 2 个字号。

### 3.3 字重（只用两个）

| 字重 | 用途 |
|---|---|
| `font-normal` (400) | 正文、描述 |
| `font-medium` (500) | 标签、按钮、导航项、标题、选中态 |

**禁止** `font-bold` / `font-semibold`——加粗破坏轻感。需要更强强调，用更大字号或 `foreground` 色值。

---

## 4. 间距体系（4px 基础网格）

间距传递信息——它告诉用户「什么属于什么」。

| 间距 | Tailwind | 含义 |
|---|---|---|
| 4px | `gap-1` / `p-1` | 紧密关联——icon 与文字、label 与值 |
| 6px | `gap-1.5` / `p-1.5` | 组件内部——按钮内 padding、列表项间距 |
| 8px | `gap-2` / `p-2` | 同组不同项——表单字段间、列表项间 |
| 12px | `gap-3` / `p-3` | 小节内——卡片内 padding |
| 16px | `gap-4` / `p-4` | 组间分隔——不同区块之间 |
| 24px | `gap-6` / `p-6` | 大节分隔——页面主要区域间 |

**分隔两个区域的手段（按优先级，用最轻的）：**

1. **仅间距**——增大间距（首选）
2. **单条分割线**——`border-border`
3. **背景色变化**——一个区域用 `bg-muted` / `bg-card`
4. **完整卡片**——border + radius + padding（最重）

> 如果需要分割线，往往说明间距不够。分割线是最后手段。

---

## 5. 交互状态（一致性的核心）

状态链：`默认 → hover → active/pressed → selected/active → focused → disabled`

### 5.1 Hover（「我注意到你了」，轻微即时）

| 元素 | Hover | Token |
|---|---|---|
| 列表项/菜单项 | 背景变浅灰 | `hover:bg-muted` |
| Ghost 按钮 | 浅灰背景 + 文字变前景 | `hover:bg-muted hover:text-foreground` |
| 主按钮 | 背景加深 20% | `hover:bg-primary/80` |
| 文字链接 | 下划线出现 | `hover:underline` |
| 图标按钮 | 浅灰背景 | `hover:bg-muted` |
| 危险按钮 | 透明度加深 | `hover:bg-destructive/20` |

**规则：** hover 不改尺寸（无 `scale`）、不加阴影（无 `shadow`）；hover 背景永远比 selected/active 更淡；统一 `transition-colors`，时长用 Tailwind 默认（150ms）。

### 5.2 Active / Selected（「我被选中了」，比 hover 更重）

| 元素 | Active | Token |
|---|---|---|
| Sidebar 菜单项 | 背景 + 字重 + 文字加重 | `data-active:bg-sidebar-accent data-active:font-medium` |
| Tab | 下方指示条 + 文字变前景 + 字重 | `data-[state=active]:text-foreground` |
| 列表选中行 | 背景加深 | `bg-muted` / `bg-accent` |
| Toggle（开） | 背景反色 | `data-[state=on]:bg-primary data-[state=on]:text-primary-foreground` |

**关键区分：** Hover = `bg-muted`；Active = `bg-muted` + `font-medium` + `text-foreground`。Active 始终比 hover 多一个维度（字重或颜色）。

### 5.3 Active 不被 Hover 覆盖（最易出 bug 处）

用户 hover 到一个已选中项上时，hover 样式可能盖掉 active，导致选中态「闪回」普通 hover——视觉上像取消了选中。

**原则：Active 状态任何时候都必须保持可辨识——包括被 hover 时。** 三种实现：

- **方式一**：active 用 hover 不涉及的维度（字重 + 颜色），即使 hover 背景叠上也仍可辨识。
- **方式二**：显式定义 `active + hover` 复合态，确保 hover 不把 active 背景拉回低层级。
- **方式三**：用 `:not()` 让 hover 只作用于非 active 元素。

**检查方法：** 写完任何带 hover + active 的组件后，手动验证——先点选中，再把鼠标移上去再移开，确认不闪烁、不降级。

### 5.4 Pressed / Focus / Disabled / Error

| 状态 | 实现 |
|---|---|
| Pressed | `active:not-aria-[haspopup]:translate-y-px`（shadcn button 已全局配置；触发弹层的按钮不加） |
| Focus | `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`（用 `focus-visible` 非 `focus`，ring 用 `ring` token 中灰） |
| Disabled | `disabled:pointer-events-none disabled:opacity-50` |
| Error/Invalid | `aria-invalid:border-destructive aria-invalid:ring-destructive/20`（只改边框 ring，不改背景） |

---

## 6. 图标规范

- 统一用 **Lucide React**（`lucide-react`）。禁止混用其他库或自制 SVG（除非 Lucide 确实没有）。
- 图标尺寸与组件尺寸绑定：

| 组件尺寸 | 图标 | 示例 |
|---|---|---|
| xs（h-6） | `size-3` | 紧凑按钮、badge |
| sm（h-7） | `size-3.5` | 小按钮、紧凑列表 |
| default（h-8） | `size-4` | 标准按钮、菜单项、表格操作 |
| lg（h-9） | `size-4` | 大按钮（图标不必更大） |

- 独立装饰图标最大 `size-8`。默认继承父元素文字色，弱化用 `text-muted-foreground`。
- 导航/操作图标 `text-muted-foreground`，hover 跟随文字变 `text-foreground`；状态图标用语义色；active 图标 `text-foreground`。

---

## 7. 圆角规范

基于 `--radius: 0.625rem`（10px）派生：

| Token | 值 | 用途 |
|---|---|---|
| `rounded-sm` | 6px | Checkbox、小标签 |
| `rounded-md` | 8px | 输入框、小按钮、dropdown item |
| `rounded-lg` | 10px | 标准按钮、卡片、dialog |
| `rounded-xl` | 14px | 大卡片、sheet |
| `rounded-full` | 999px | 头像、pill badge |

**禁止**硬编码像素值如 `rounded-[6px]`（除非组件内部响应式计算）。

---

## 8. 动效规范

- **快速、克制。** 动效帮助理解变化，不展示技术。淡入淡出优先于滑动。无弹跳（禁 spring/bounce），缓动统一 `ease-out`。
- 页面切换（路由）**无动效**。

| 场景 | 时长 |
|---|---|
| 颜色/透明度变化 | 150ms |
| 展开/收起（accordion、collapsible） | 200ms |
| 弹层出入（dialog、dropdown、popover） | 150–200ms |

用 `transition-colors`（首选）/ `transition-opacity` / `transition-transform`，避免滥用 `transition-all`。

---

## 9. 组件使用规范

### 9.1 shadcn 优先

新增 UI 需求时：先查 shadcn 是否有 → 有就用（`npx shadcn add <component>`）→ 需要变体用 CVA 扩展 → 确实没有再自建，但必须遵循本规范的 token 与交互状态。

### 9.2 按钮层级（从最强调到最弱）

| 变体 | 重量 | 场景 |
|---|---|---|
| `default`（primary） | 最重 | 页面主操作（**每屏最多 1 个**） |
| `outline` | 较重 | 次要操作 |
| `secondary` | 中 | 辅助操作、工具栏 |
| `ghost` | 轻 | 图标按钮、内联操作 |
| `destructive` | 较重 | 删除、危险操作 |
| `link` | 最轻 | 内联文字链接 |

**规则：** 一个视图 primary 按钮最多 1 个；多个同等重要操作全用 `outline` / `secondary`。

### 9.3 Dropdown / Popover

- 内容宽度 `w-auto`，**禁止**固定宽（`w-52` 会导致换行）。
- 菜单项 `text-sm`，图标 `size-4`。选中项用 checkmark 或左侧指示条标记，不改背景色。
- 危险项 `text-destructive`，放最底部，上方分割线隔开。

### 9.4 表单输入

- 输入框 `border-input`，focus 时 `border-ring` + ring。
- Label `text-sm font-medium`；描述 `text-xs text-muted-foreground`；错误 `text-xs text-destructive`，放输入框正下方。

---

## 10. 反模式清单（禁止出现）

| 禁止 | 原因 | 替代 |
|---|---|---|
| 硬编码颜色 `text-red-500`、`bg-gray-100` | 破坏主题一致性 | token：`text-destructive`、`bg-muted` |
| 任意像素 `text-[11px]`、`w-[137px]` | 脱离设计系统 | Tailwind 内置 scale |
| `font-bold` / `font-semibold` | 过重 | `font-medium` + `text-foreground` |
| `text-lg` / `xl` / `2xl` | 信息密度工具不需要大字 | `text-base` 已是最大 |
| `shadow-sm/md/lg` | 拟物风格，与扁平冲突 | `border` 分隔层级 |
| hover 时 `scale-105` | 突兀 | `hover:bg-muted` |
| 多色 gradient 背景 | 装饰性，分散注意力 | 纯色 token |
| Skeleton loading | 与简洁风格不符 | Spinner（`Loader2` + `animate-spin`）或内联 loading 文字 |
| Toast 做操作确认 | 转瞬即逝易错过 | 内联状态文字（Sonner 仅用于错误/重要提示） |
| 固定宽 dropdown `w-52` | 换行不可控 | `w-auto` |
| 纯黑背景 `#000` | LCD 上刺眼 | dark 模式用深灰 `background` token |

---

## 11. 提交前检查清单

- [ ] 颜色是否都用 token？有无硬编码？
- [ ] 字号是否只在 `text-xs` / `text-sm` / `text-base`？
- [ ] 字重是否只用 `font-normal` / `font-medium`？
- [ ] Hover 是否比 active 更淡？
- [ ] Active 项被 hover 时是否仍可辨识（不被覆盖）？
- [ ] 图标尺寸是否匹配组件尺寸？
- [ ] 间距是否用 Tailwind 内置 scale（无任意值）？
- [ ] Dark 模式下是否正常？
- [ ] 有没有可用间距替代的不必要分割线？
- [ ] Dropdown/Popover 是否 `w-auto`？
- [ ] 一个视图里 primary 按钮是否不超过 1 个？
