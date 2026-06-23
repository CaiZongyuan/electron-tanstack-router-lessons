# 08 · Chat UI 重构（ChatGPT 式 + 液态玻璃）

> 阶段 0–7 的前端是「参照 multica 复刻」：sidebar + home 业务卡片。现在转向**独立产品形态**：一个 ChatGPT 式的简洁对话界面，液态玻璃（liquid glass）风格（macOS Apple Music 那种硅谷高级简约桌面感）。配套：自动识别本机 agent、流式逐字、markdown 渲染。
>
> 这份文档先行——讲清「改成什么样、为什么」，代码再跟上。

---

## 1. 为什么要改

- **产品定位已明确是独立本地工具**（不是 multica 复刻，见 memory `feedback_product_form`）。multica 那套 sidebar（收件箱/事项/项目/智能体）是它的业务，与我们无关，继续留着是噪音。
- 用户实际只用到「对话」这一件事。打开应用就该是对话页，不该先看到一堆占位卡片。
- 视觉上要脱离 multica 的「信息密度型工具」气质，走「留白 + 玻璃质感」的高级简约路线。

---

## 2. 设计目标

| 目标 | 含义 |
|---|---|
| 简洁 | 去掉 sidebar 与 home 卡片；`/` 直接是对话页；只剩「消息流 + 输入框 + 极简状态」 |
| 液态玻璃 | backdrop-blur + 半透明 + 大圆角；克制版（对齐 design.md，不花哨） |
| 自动 agent | desktop 启动即拉起 daemon、识别 claude，UI 显示「claude 已就绪」，无需手动点启动 |
| 流式逐字 | ChatGPT 式打字机效果（claude 是 message 级输出，前端逐字 reveal 模拟） |
| markdown | assistant 回复按 markdown 渲染（代码块、列表、标题） |

---

## 3. 布局

去掉 `AppLayout` 里的 `AppSidebar` + `DashboardLayout`，改为极简全屏外壳：

```
┌──────────────────────────────────────────────┐
│  demo                          ● 运行中 · claude   ← 薄 header（状态 + agent）
├──────────────────────────────────────────────┤
│                                              │
│              （居中 max-w 消息流）              │
│   user 气泡（右，primary 半透明）               │
│   assistant（左，markdown，无背景或淡玻璃）       │
│                                              │
├──────────────────────────────────────────────┤
│        ┌──────────────────────────┐          │
│        │  输入 prompt…        ↑   │  ← 胶囊输入（液态玻璃）
│        └──────────────────────────┘          │
└──────────────────────────────────────────────┘
         背景：深灰 + 顶部柔和彩色光晕
```

- 空状态：居中欢迎语 + 几个示例 prompt。
- 不再有 `/daemon` 路由（并入 `/`）；home-view、app-sidebar 不再使用。

---

## 4. 液态玻璃风格（克制版，关键）

液态玻璃容易做过头（花哨、廉价）。在 design.md「克制即高级」框架内，只用三件事：

1. **backdrop-blur**：`backdrop-blur-xl`，让卡片透出背景光晕。
2. **半透明 + token**：`bg-card/40`（dark）或 `bg-white/60`（light），边框用 `border border-border`（dark 下已是白色 10% 透明）。
3. **大圆角**：`rounded-2xl` / `rounded-3xl`。

**不做**：彩色渐变填充、发光描边、重阴影（design.md 禁 `shadow-*`）、hover `scale`。

**背景光晕**：深灰底色（dark `--background`）上，用两层低透明度的 `radial-gradient`（brand 蓝 + info 紫，~10% 透明）放在顶部两侧，营造 Apple Music 那种柔和氛围。这是唯一的「装饰」，且克制（大面积低饱和）。

**默认 dark mode**：液态玻璃在深色下效果最佳（Apple Music 即深色）。在根节点加 `.dark`，tokens.css 已有 dark 配色（深灰非纯黑，符合 design.md 2.3）。

---

## 5. 自动识别 agent + 自动启动

**daemon-manager 加固**（修「启动即停」根因 + 自动）：

- `start()` 先 `GET /health`：若已有 daemon 返回 `running` → 直接 `setStatus("running")`，**不 spawn**（复用已运行的 daemon，解决端口冲突 / 孤儿进程场景）。
- 否则正常 spawn；spawn 后 poll。
- `stop()` 维持现状（POST /shutdown + kill 兜底）。

**desktop 自动启动**：`app.whenReady` 创建窗口后 `void daemonManager.start()`（不阻塞，后台拉起）。renderer 通过 `onStatusChange` 看到 `stopped → starting → running`。

**UI 显示 agent**：`useDaemonStatus` 已返回 `health.agents`；header 显示 `claude`（若 `agents` 含 claude）+ 状态点（running=绿、starting=黄、其他=灰）。

---

## 6. 流式打字机

**根因**：claude code 的 `--output-format stream-json` 是 **message 级**——一条 assistant 消息 = 一个完整 `text` content 块（不是 token 级增量）。所以 daemon→main→renderer 拿到的是整段文本，一次性渲染（这就是「不是流式」的原因）。链路本身是通的（阶段 5 验证过逐事件流）。

**解法**（前端打字机，不依赖 claude 改协议）：

```
收到 text event
   → 累积到 currentAssistant.fullText     （真实完整文本）
   → effect 监听 fullText 变化
        用 setInterval 每 ~15ms 把 displayedText 增长 1–3 字
        直到 displayedText === fullText
   → 渲染时用 displayedText（markdown 解析它）
```

收到下一段 text 时 `fullText` 继续增长，打字机追赶。终止 status 时停止 interval，确保 displayedText 追到完整。

---

## 7. markdown

- `react-markdown` + `remark-gfm`（表格、删除线、任务列表）。
- assistant 消息渲染 `displayedText`；user 消息纯文本。
- 代码块：`<pre>` 用 `bg-muted` + `font-mono` + 圆角；不引额外高亮库（保持克制，阶段后续可加）。
- 依赖加到 `packages/views`。

---

## 8. 文件改动

| 文件 | 改动 |
|---|---|
| `packages/views/layout/app-layout.tsx` | 去掉 sidebar，改为极简全屏 chat 外壳（header + 内容 Outlet） |
| `packages/views/home/home-view.tsx` | 不再使用（保留文件，不挂载；或删） |
| `packages/views/layout/app-sidebar.tsx` | 不再使用 |
| `apps/{desktop,web}/.../routes/index.tsx` | `/` 挂 `ChatView`（原 HomeView） |
| `apps/{desktop,web}/.../routes/daemon.tsx` | 删（并入 `/`） |
| `packages/views/daemon/chat-view.tsx` | 重写：液态玻璃 + 打字机 + markdown + header 状态 |
| `packages/views/daemon/daemon-panel.tsx` | 精简为 header 内的状态点 + agent 标签（不再独立卡片） |
| `apps/desktop/src/main/daemon-manager.ts` | `start()` 先探 /health 复用 |
| `apps/desktop/src/main/index.ts` | `whenReady` 自动 `start()` |
| `packages/views/package.json` | 加 `react-markdown`、`remark-gfm` |
| 全局 css（tokens 或入口） | dark mode + 背景光晕 |

---

## 9. 验证

- `pnpm typecheck`（6 包）+ 两端 `build`。
- desktop：`pnpm dev:desktop` → 自动起 daemon（无需点启动）→ header 显示「运行中 · claude」→ 输入 prompt → 看到逐字流式 + markdown 渲染。
- 端口冲突场景：先手动起一个 daemon，再开 desktop → 应复用而非报错退出。

---

## 10. 已知限制（留后续）

- 打字机是前端模拟（claude 真实 token 级流式需 claude 协议层支持，超出范围）。
- 代码块暂无语法高亮（后续可加 shiki / starry-night）。
- home/sidebar 文件保留未删（避免破坏 git 历史；确认不再需要可后续清理）。
