# UI 设计规范

> 本规范以 `resource/ref.png` 的 desktop 版本为主参考，目标是复刻 Marvis / multica 风格的本地 agent 工作台。所有 web 与 Electron renderer 的 UI 都以本文为准。

---

## 1. 产品气质

这是一个面向桌面端的本地 agent 应用，不是营销页、内容站或传统后台。界面应当像一个安静的工作台：左侧管理资源与会话，中间承载“把任务交给助手”的核心流程。

三条核心原则：

1. **低对比、强秩序**：主界面接近白色，层次主要靠轻微灰度、留白和圆角建立。不要用大面积色块制造层级。
2. **中心任务优先**：首屏视觉重心是助手身份、任务输入框和推荐任务。侧边栏永远服务于导航，不抢主区注意力。
3. **桌面应用感**：窗口边界、标题栏空间、侧边栏固定、内容居中，都要符合 desktop 壳子的使用预期。不要做移动优先的落地页布局。

---

## 2. 整体布局

### 2.1 Desktop 框架

参考图结构：

```text
┌───────────────────────────────────────────────┐
│  sidebar     │              main              │
│  240px       │      centered workspace         │
│              │                                │
└───────────────────────────────────────────────┘
```

规则：

- Electron 窗口主体使用 `bg-background`，外层可保留窗口圆角与系统标题栏空间。
- 左侧 sidebar 固定在窗口左边，宽度约 `w-60` 到 `w-64`，背景使用比主区略深的浅灰 token。
- 主内容区不贴边，使用居中容器，推荐宽度 `max-w-5xl`；输入面板推荐 `max-w-4xl`。
- 主区顶部留足呼吸感，desktop 首屏建议 `pt-28` 左右；web 可按浏览器高度收敛。
- 不使用全屏卡片套卡片。页面区块是开放式布局，只有输入框、推荐项、弹层等具体对象可以是卡片。

### 2.2 首屏信息层级

首屏从上到下固定为：

1. 助手身份区：头像 / 产品名 / 在线说明。
2. 大任务输入面板：多行任务描述、附件入口、发送按钮。
3. 推荐分类标签：推荐、办公学习、电脑设置等。
4. 推荐任务网格：2 到 3 列卡片。

不要在首屏加入宣传文案、功能介绍卡、统计图或无关 banner。

---

## 3. 颜色系统

### 3.1 总体观感

参考图是极浅色桌面 UI：

- 主区：近白色 `bg-background`。
- sidebar：轻微灰底，使用 `bg-muted` / sidebar token。
- 输入面板和推荐卡：白色或接近白色 `bg-card`，配非常浅的 `border-border`。
- 文字：黑灰层级，不使用彩色文字做装饰。
- 彩色只用于小图标、状态点、文件类型或明确语义。

### 3.2 必须使用语义 token

禁止硬编码 Tailwind 色值，例如 `text-gray-500`、`bg-blue-600`、`border-zinc-200`。统一使用：

| 场景 | Token / class |
|---|---|
| 页面背景 | `bg-background` |
| 主文字 | `text-foreground` |
| 次级文字 | `text-muted-foreground` |
| 卡片 / 输入面板 | `bg-card text-card-foreground` |
| 浅灰区域 / hover | `bg-muted` / `hover:bg-muted` |
| 边框 | `border-border` |
| 输入边框 | `border-input` |
| 主操作 | `bg-primary text-primary-foreground` |
| 危险操作 | `text-destructive` / `bg-destructive` |
| 成功 / 运行中 | `text-success` / `bg-success` |
| 警告 | `text-warning` / `bg-warning` |
| 信息 | `text-info` / `bg-info` |

### 3.3 色彩比例

- 中性色占 90% 以上。
- 语义色只用于小面积元素：状态点、文件类型图标、badge、错误文字。
- 一个视图内同时出现的强语义色不超过 2 种。
- 不使用渐变背景、彩色阴影、品牌色大面积铺底。

### 3.4 Dark 模式

dark 模式是独立适配，不是简单反色：

- 背景用深灰 token，不用纯黑。
- 卡片、sidebar、popover 之间保持轻微层级差。
- 边框使用低透明度浅色，不要形成高亮网格。
- 所有 UI 变更必须同时检查 light 和 dark；参考图主要定义 light 观感，dark 仍遵守同样的信息层级。

---

## 4. 字体与文本

### 4.1 字号

本项目只使用三档字号：

| Class | 用途 |
|---|---|
| `text-base` | 产品名、页面主标题、输入框占位主文本 |
| `text-sm` | 默认 UI 文本、导航项、按钮、卡片标题、正文 |
| `text-xs` | 分组标题、时间、状态、辅助说明、卡片摘要 |

禁止 `text-lg` / `text-xl` / `text-2xl` 和任意像素字号。参考图里“Marvis”看起来更大，本项目通过头像尺寸、留白、`font-medium` 和位置建立主视觉，不通过放大字号实现。

### 4.2 字重

只使用：

- `font-normal`：正文、说明、未选中导航。
- `font-medium`：产品名、卡片标题、按钮、选中导航、重要标签。

禁止 `font-semibold` / `font-bold`。需要强调时优先使用 `text-foreground`、位置、留白或图标，而不是加粗。

### 4.3 文案风格

- 导航与按钮用短词：`新建对话`、`自动任务`、`技能广场`。
- 空状态和占位文字直接说明下一步：`请输入任务，交给我来帮你完成`。
- 不在界面里解释功能实现、技术栈、快捷键或设计意图。
- 中文标点使用全角；英文产品名保持原拼写。

---

## 5. 间距与尺寸

使用 Tailwind 内置 4px scale。禁止任意像素值，除非为了 Electron 标题栏拖拽区域或平台窗口控制必须精确处理。

| 间距 | Class | 典型场景 |
|---|---|---|
| 4px | `gap-1` | 图标与极短标签 |
| 6px | `gap-1.5` | 紧凑按钮内部 |
| 8px | `gap-2` | 导航项、按钮、卡片标题行 |
| 12px | `gap-3` / `p-3` | 卡片内部、sidebar 分组 |
| 16px | `gap-4` / `p-4` | 推荐网格、表单组 |
| 24px | `gap-6` / `p-6` | 首屏大区块 |
| 32px | `gap-8` | 助手区与输入面板 |

具体建议：

- sidebar 内边距：`p-3` 到 `p-4`。
- sidebar 导航项高度：`h-10` 左右，图标 `size-4`。
- 搜索框高度：`h-10`，圆角 `rounded-lg`。
- 主输入面板最小高度：约 `min-h-56`，底部工具区单独成行。
- 推荐卡片高度保持稳定，使用固定 `min-h` 或统一内容行数，避免网格跳动。

---

## 6. 圆角、边框与阴影

参考图的形态是柔和圆角 + 轻边框 + 极弱阴影。

| 元素 | 圆角建议 |
|---|---|
| 小按钮、导航项、输入框 | `rounded-md` / `rounded-lg` |
| 推荐卡片 | `rounded-xl` |
| 主任务输入面板 | `rounded-2xl` |
| 头像、状态图标容器 | `rounded-full` 或 `rounded-xl` |
| Electron 外层窗口 | 由壳子处理，不在内容层重复模拟 |

规则：

- 优先使用 `border border-border` 建立边界。
- 阴影只允许用于主输入面板或浮层，且必须非常轻：`shadow-sm` 级别。普通卡片、导航项不加阴影。
- 不使用厚重投影、内发光、玻璃拟态大背景。
- 不在卡片里再放完整卡片。需要分组时用间距或轻边框。

---

## 7. Sidebar 规范

### 7.1 结构

sidebar 从上到下：

1. 产品名：`Marvis` 或当前学习项目名。
2. 搜索框。
3. 主操作与一级导航：新建对话、自动任务、技能广场。
4. 本地知识库分组：应用、文档、图库、此电脑。
5. 对话分组。
6. 底部用户区与通知入口。

分组标题使用 `text-xs text-muted-foreground font-normal`，不要加粗。

### 7.2 导航项

导航项规则：

- 默认：透明背景，`text-foreground` 或 `text-muted-foreground`。
- hover：`hover:bg-muted`，不要改变尺寸。
- active：`bg-muted text-foreground font-medium`。
- active + hover 时仍保持 active 可识别，不能被 hover 降级。
- 图标统一 Lucide，`size-4`，颜色继承文本。

新建对话可作为当前高亮项，但视觉重量不能超过主区输入面板。

### 7.3 底部用户区

- 用户头像 `size-6` 或 `size-7`。
- 用户名 `text-sm`。
- 通知图标为 ghost icon button。
- 底部区域不使用独立卡片，只用 sidebar 自身留白承载。

---

## 8. 主工作区规范

### 8.1 助手身份区

助手身份区是主区的视觉锚点：

- 头像推荐 `size-20` 到 `size-24`。
- 产品名使用 `text-base font-medium text-foreground`。
- 状态说明使用 `text-sm text-muted-foreground`，可带一个小图标。
- 整体水平排列，放在输入面板上方，和输入面板左边缘对齐。

### 8.2 任务输入面板

输入面板是首屏最重要对象：

- 容器：`rounded-2xl border border-border bg-card`。
- 内部：上方为多行输入区，下方为工具栏。
- 占位文字：`text-base text-muted-foreground`。
- 附件按钮：`outline` 或 `ghost`，图标加文字。
- 发送按钮：圆形 icon button，未输入时 disabled，使用 muted 状态；可发送时使用 primary。
- 输入区不要出现复杂工具栏、模型选择、温度参数等学习项目当前不需要的控件。

### 8.3 推荐任务

推荐任务用于帮助用户开始，不是信息卡片墙。

- 分类标签：横向文本 tab，`text-sm`；active 用 `font-medium text-foreground`，inactive 用 `text-muted-foreground`。
- 推荐卡：2 到 3 列，`rounded-xl border border-border bg-card p-4`。
- 卡片标题：`text-sm font-medium`。
- 摘要：`text-sm` 或 `text-xs text-muted-foreground`，最多 2 行截断。
- 右下角可放轻量发送箭头，`text-muted-foreground`。
- 小图标可用语义色或文件类型色，但面积必须小。

---

## 9. 组件规则

### 9.1 shadcn 优先

新增 UI 组件时：

1. 先用 `pnpm ui:add <组件>` 从 shadcn 脚手架到 `packages/ui/components/ui/`。
2. 根据本规范调整 token、尺寸、状态。
3. shadcn 没有的组件再手写，但必须放在合适包内并复用 token。

### 9.2 Button

| 变体 | 场景 |
|---|---|
| `default` | 主发送、确认。一个视图最多一个高权重主按钮。 |
| `outline` | 选择文件、次级确认。 |
| `secondary` | 工具栏内辅助操作。 |
| `ghost` | sidebar、图标按钮、卡片内轻操作。 |
| `destructive` | 删除、停止危险任务。 |

按钮不使用 `scale` hover，不使用彩色阴影。icon button 必须有可访问名称。

### 9.3 Input / Search

- 搜索框使用 `h-10 rounded-lg border-input bg-background`。
- placeholder 使用 `text-muted-foreground`。
- focus 使用 `border-ring` 与 `ring-ring/50`。
- sidebar 搜索框保持低对比，不要做成主操作。

### 9.4 Card

只用于推荐任务、弹层内对象、可点击资源项。

- 默认 `border border-border bg-card`。
- hover 可使用 `hover:bg-muted/50` 或轻微边框变化。
- 不默认加阴影。
- 卡片点击区要完整，不要只让标题可点。

### 9.5 Dropdown / Popover

- 宽度优先 `w-auto` 或内容驱动，不固定 `w-52`。
- 菜单项 `text-sm`，图标 `size-4`。
- 危险项放底部，并用 `text-destructive`。
- 不使用多级复杂菜单，除非确实是桌面文件/设置类场景。

---

## 10. 交互状态

状态强度从轻到重：

```text
default < hover < active/selected < focus < disabled/error
```

规则：

- hover 只改变颜色或背景，不改变尺寸、位置、字重。
- active 必须比 hover 多一个识别维度，例如 `font-medium` 或 `text-foreground`。
- active 被 hover 时不能看起来像取消选中。
- pressed 可以有极轻微位移，但触发 dropdown/popover 的按钮不做位移。
- disabled 使用 `opacity-50 pointer-events-none`。
- error 只改变边框、ring 或错误文字，不整块染红。

---

## 11. 图标规范

- 图标统一使用 `lucide-react`。
- 常规 UI 图标 `size-4`。
- 紧凑按钮图标 `size-3.5`。
- 大头像或品牌形象可以使用 bitmap / png 资源，不用 Lucide 代替。
- 图标默认继承文字颜色；辅助图标用 `text-muted-foreground`。
- 不手写 SVG 图标，除非 Lucide 没有且该图标是产品关键资产。

---

## 12. 动效规范

动效只用于反馈，不用于装饰。

- 颜色变化：`transition-colors`，150ms。
- 弹层：150ms 到 200ms。
- 页面路由切换：默认无动效。
- loading：优先用 `Loader2 animate-spin` 或按钮 disabled 状态。

禁止：

- hover `scale-105`。
- spring / bounce。
- 大面积背景动画。
- 卡片浮起式阴影动画。

---

## 13. Web 与 Desktop 差异

共享页面必须同构，但外壳可以不同：

- Desktop 可保留窗口圆角、标题栏按钮区域和固定 sidebar。
- Web 可以用同一套布局，但不模拟 Windows / macOS 窗口控制按钮。
- 共享视图不能直接调用 Electron、DOM 平台能力或 localhost daemon 地址，必须走 `@demo/core` 的能力接口。
- 与平台有关的标题栏、窗口拖拽、通知、文件选择等放 app 层实现，再通过 props 或能力接口注入。

---

## 14. 反模式清单

禁止出现：

| 反模式 | 替代 |
|---|---|
| 硬编码颜色 `text-gray-500` / `bg-blue-600` | 语义 token |
| `text-lg` / `text-xl` / 任意字号 | `text-xs` / `text-sm` / `text-base` |
| `font-bold` / `font-semibold` | `font-medium` |
| 大面积品牌色背景 | 中性背景 + 小面积语义色 |
| 渐变、彩色光斑、装饰背景 | 留白和灰度层级 |
| 普通卡片阴影 | `border-border` |
| hover 缩放或漂浮 | `hover:bg-muted` |
| 卡片套卡片 | 间距、分组标题或轻边框 |
| 首屏营销介绍 | 助手身份 + 任务输入 + 推荐任务 |
| 在 `@demo/views` 直调平台 API | `@demo/core` 能力接口 |

---

## 15. 提交前检查

- [ ] 首屏是否符合 sidebar + centered workspace 的 Marvis desktop 结构？
- [ ] 主视觉是否是助手身份、任务输入面板和推荐任务？
- [ ] 颜色是否全部使用语义 token？
- [ ] 字号是否只使用 `text-xs` / `text-sm` / `text-base`？
- [ ] 字重是否只使用 `font-normal` / `font-medium`？
- [ ] hover 是否比 active 更轻？
- [ ] active 项 hover 后是否仍可识别？
- [ ] sidebar 是否低对比且不抢主区注意力？
- [ ] 推荐卡片是否稳定等高、内容不溢出？
- [ ] light 与 dark 是否都检查过？
- [ ] 共享视图是否没有直接调用 Electron、浏览器原生能力或 daemon URL？
