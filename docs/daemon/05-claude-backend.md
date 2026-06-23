# 05 · 阶段 4 — Claude backend

> 目标：设计 `Backend` 接口 + 实现 `ClaudeBackend`——spawn `claude` 子进程、把 prompt 写进 stdin、从 stdout 流式读 stream-json、解析成统一 `Message` 流、用 `AbortSignal` 传播取消。**约束：写一个临时 cli 脚本，`backend.execute("What is 2+2?")` 能拿到完整流式消息 + 最终 result。**

---

## 1. 为什么 backend 单独抽一层

阶段 5 的 task API 只关心「给我 prompt，还我一条事件流」，**不关心**底下是 `claude` 还是 `codex` 还是别的 CLI。把「具体某个 coding-agent CLI 怎么调」藏到 `Backend` 实现里，task API 就只依赖接口：

```
task runner ──> Backend（接口）
                 ├── ClaudeBackend   spawn `claude`
                 ├── CodexBackend    spawn `codex`    （将来）
                 └── ...
```

对照 multica：`server/pkg/agent/agent.go:16` 的 `Backend interface` 正是这层抽象，`claude.go` / `codex.go` 各是一个实现。我们照搬这个分层，只是把 Go interface 翻成 TS interface。

阶段 4 只实现 `ClaudeBackend`，但接口先设计成「能容纳多个实现」的形状。

---

## 2. 三个核心概念

### 2.1 `execute()` 返回 `AsyncIterable<Message>`（不是回调、不是双 channel）

multica 的 `Execute` 返回 `*Session{ Messages <-chan Message; Result <-chan Result }`——**两个 channel**：事件流 + 最终结果。这是 Go 的惯用法（一个 channel 一种类型）。

TS 的对应物不是两个 channel，而是一个 **async generator**。最终 `result` 不单独开流，而是作为事件流里**最后一条** `type: "result"` 的 `Message` 收尾。理由：

- JS 里「流式 + 终止信号」天然用 async iterable 表达（`for await...of` 自然结束）。
- 消费方只 await 一个 iterable，不用同时管两个 Promise。
- `result` 本来就是 claude stdout 的最后一帧，复用同一条流最自然。

```typescript
for await (const msg of backend.execute("hi")) {
  if (msg.type === "text") appendToUI(msg.text);
  if (msg.type === "result") finalize(msg); // 流到此结束
}
```

> 对照 multica：它把 result 单独抽出来是因为 Go channel 类型固定，且它要在 result 里塞 `Usage`、`DurationMs` 等聚合字段。我们把这些字段都放进 `Message(type:"result")`，等价但更简单。

### 2.2 stream-json 是**双向**协议

claude CLI 的 stream-json 既是**输入**格式也是**输出**格式：

```
stdin  ──写入一条 user message JSON──>  claude
claude ──逐行吐 stream-json 帧──>       stdout
```

- **输入**（`--input-format stream-json`）：prompt 不走命令行参数（长 prompt 有转义/长度问题），而是经 stdin 写**一条** JSON 消息然后关闭 stdin：

  ```json
  {"type":"user","message":{"role":"user","content":[{"type":"text","text":"<prompt>"}]}}
  ```

  对照 multica `claude.go::buildClaudeInput`。末尾必须 `\n`。

- **输出**（`--output-format stream-json`）：stdout 每行一个 JSON 帧，帧的 `type` 决定结构（见 2.3）。

**关键**：stdout 是**字节流**，TCP/管道不保证一次读到正好一行。必须做**行缓冲**——把读到的 chunk 按 `\n` 切，最后一段不完整的留到下次。这是流式解析的经典坑（见第 6 节陷阱）。

### 2.3 `AbortSignal` 取消 + 进程树 kill

取消要一路传到子进程，且**杀干净**（包括 claude 自己 spawn 的孙子进程，比如它跑 `bash`、`node`）：

```
controller.abort()
  └─> ClaudeBackend 监听到 abort
        ├─> child.stdin.end()      告诉 claude 没有更多输入
        └─> kill 进程树             Windows: taskkill /PID <pid> /T /F
```

**Windows 坑**：Node 的 `child.kill()` 在 Windows 只杀父进程（claude），**不杀**它派生的孙子进程（claude 跑的工具子进程会变孤儿继续跑）。必须用 `taskkill /PID <pid> /T /F` 杀整棵树。这是 multica `proc_windows.go` 同样要解决的问题，我们封装到 `platform/windows.ts`。

对照 Go：`context.CancelFunc` → `runCtx.Done()` → `closeStdin/closeStdout` → `cmd.Process.Kill`。`AbortSignal` 是等价物（阶段 1 已建好这个开关）。

---

## 3. 命令行与协议：从 multica 裁剪

multica `buildClaudeArgs`（`claude.go:562`）的完整参数很多（model / effort / max-turns / mcp / strict-mcp-config……）。**阶段 4 只取能跑通的最小集**，其余留作 `ExecOptions` 的可选字段，将来需要再加（YAGNI）：

| 参数 | 作用 | 阶段 4 是否用 |
|---|---|---|
| `-p` | 非交互（print）模式 | ✅ 必须 |
| `--output-format stream-json` | stdout 流式 JSON | ✅ 必须 |
| `--input-format stream-json` | stdin 吃流式 JSON | ✅ 必须 |
| `--verbose` | 输出包含 usage / 完整 content | ✅ 必须（否则 result 帧不全） |
| `--permission-mode bypassPermissions` | 自主跑，不卡权限确认 | ✅ 必须（daemon 无人值守） |
| `--disallowedTools AskUserQuestion` | 禁止交互式提问工具 | ✅ 必须（同上） |
| `--model <m>` | 选模型 | ⚪ 可选（`opts.model`） |
| `--max-turns <n>` | 限制回合 | ⚪ 可选（`opts.maxTurns`） |

> 裁掉 `--strict-mcp-config` / `--effort` / `--append-system-prompt` / `--resume`：阶段 4 不接 MCP、不做 reasoning 等级、不续会话。接口留扩展位即可。

---

## 4. stream-json 帧格式（claude SDK 实测）

stdout 每行一个 JSON。按 `type` 分（对照 multica `claude.go:423` 的 `claudeSDKMessage`）：

```jsonc
// 1. 会话开始
{"type":"system","subtype":"init","session_id":"sess_xxx", ...}

// 2. assistant 输出（content 数组里混合多种块）
{"type":"assistant","message":{"role":"assistant","content":[
  {"type":"text","text":"答案"},
  {"type":"thinking","text":"我先想..."},
  {"type":"tool_use","id":"call_1","name":"Bash","input":{"command":"ls"}}
]}}

// 3. user 回合（工具结果）—— claude 自己执行工具后回填
{"type":"user","message":{"role":"user","content":[
  {"type":"tool_result","tool_use_id":"call_1","content":"file.txt"}
]}}

// 4. 最终结果（流最后一帧）
{"type":"result","result":"2+2=4","is_error":false,"session_id":"sess_xxx","usage":{...}}

// 5. 日志
{"type":"log","log":{"level":"info","message":"..."}}
```

我们的 `Message` 是**统一抽象**，把上面多种 claude 原生帧**展平**成单一类型——task API / UI 不该知道 claude 内部的 `assistant.content[]` 结构：

| claude 原生帧 | → 我们的 `Message.type` |
|---|---|
| `system` | `"system"`（取 `session_id`） |
| `assistant` 的 `content[].type==="text"` | `"text"`（取 `text`） |
| `assistant` 的 `content[].type==="thinking"` | `"thinking"`（取 `text`） |
| `assistant` 的 `content[].type==="tool_use"` | `"tool_use"`（取 `name`/`id`/`input`） |
| `user` 的 `content[].type==="tool_result"` | `"tool_result"`（取 `tool_use_id`/`content`） |
| `result` | `"result"`（取 `result`/`is_error`/`session_id`/`usage`） |
| `log` | `"log"`（取 `level`/`message`） |
| 任何解析失败 / 子进程异常 | `"error"`（取 `text`） |

---

## 5. 操作清单

1. `apps/daemon/src/agent/backend.ts`：`Backend` 接口 + `Message` / `ExecOptions` 类型。
2. `apps/daemon/src/agent/stream-json.ts`：行缓冲解析器（字节流 → 一行行 JSON）。
3. `apps/daemon/src/agent/claude.ts`：`ClaudeBackend`（spawn + stdin 写 prompt + stdout 解析 + abort + stderr tail）。
4. `apps/daemon/src/agent/probe.ts`：探测 `claude` 是否在 PATH + 版本。
5. `apps/daemon/src/platform/windows.ts`：`killProcessTree()`（Windows `taskkill /T`，其他平台 `child.kill`）。
6. 改 `apps/daemon/src/main.ts`：preflight 调 `probeClaude()`，结果填进 `runtime.agents`（health 的 `agents` 字段不再恒空）。
7. 写临时 cli 脚本 `apps/daemon/src/agent/cli.ts` 手动验证。
8. `pnpm typecheck` + 跑 cli。

---

## 6. 关键文件内容

### 6.1 `apps/daemon/src/agent/backend.ts`

```typescript
// Backend 接口与统一事件类型。
// task runner（阶段 5）只依赖这里的抽象，不依赖具体 CLI。

// 统一事件类型。把 claude / codex 各自的原生流式帧「展平」成这一种。
// 新增 agent 时只需写「原生帧 → Message」的转换，下游不变。
export type MessageType =
  | "system" // 会话开始（带 session_id）
  | "text" // assistant 文本
  | "thinking" // assistant 思考过程
  | "tool_use" // 工具调用请求
  | "tool_result" // 工具执行结果
  | "log" // 日志
  | "result" // 最终结果（流的最后一帧）
  | "error"; // 解析失败 / 子进程异常

export interface Message {
  type: MessageType;
  text?: string; // text / thinking / result / error 的文本
  tool?: string; // tool_use 的工具名
  callId?: string; // tool_use / tool_result 配对的调用 id
  input?: unknown; // tool_use 的入参（原样透传，结构因工具而异）
  output?: string; // tool_result 的输出
  sessionId?: string; // system / result 的会话 id
  isError?: boolean; // result 是否出错
  level?: string; // log 级别
}

// 单次执行选项。阶段 4 只用 signal + cwd；model/maxTurns 留扩展位。
export interface ExecOptions {
  cwd?: string;
  model?: string;
  maxTurns?: number;
  signal?: AbortSignal;
}

// agent 后端抽象。execute 返回事件流；result 作为流末尾的 Message。
// 对照 multica server/pkg/agent/agent.go 的 Backend interface。
export interface Backend {
  execute(prompt: string, opts?: ExecOptions): AsyncIterable<Message>;
}
```

### 6.2 `apps/daemon/src/agent/stream-json.ts`

```typescript
import { createInterface } from "node:readline";
import type { Logger } from "pino";

// 把一个可读字节流按行解析成 JSON 对象。
// 用 node:readline 逐行读——它内部就是「按 \n 切 + 处理半行」的行缓冲，
// 不用自己写。每行 JSON.parse，解析失败的行记日志后跳过（不中断流）。
export async function* parseStreamJson<T = unknown>(
  iterable: AsyncIterable<Buffer | string>,
  logger?: Logger,
): AsyncGenerator<T> {
  // 把字节/字符串片段汇成一个 readline 能吃的 async iterable。
  const lines = createInterface({
    input: toReadable(iterable),
    crlfDelay: Infinity, // 容忍 \r\n / \n 混合
  });

  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue; // 跳过空行
    try {
      yield JSON.parse(trimmed) as T;
    } catch (err) {
      // 单行解析失败不该让整条流崩——记下继续，便于排查脏数据。
      logger?.warn({ line: trimmed.slice(0, 200), err }, "stream-json: skip unparseable line");
    }
  }
}

// 把「Buffer 片段流」包成 Node Readable，供 createInterface 消费。
import { Readable } from "node:stream";
function toReadable(iterable: AsyncIterable<Buffer | string>): Readable {
  return Readable.from(iterable);
}
```

> 为什么用 `node:readline` 而不是手写行缓冲：它正是为「逐行读流」设计的，正确处理了「一次 chunk 含多行」「一行跨多个 chunk」「\r\n vs \n」三种情况。手写容易在边界出错（见陷阱 6.3）。`Readable.from(asyncIterable)` 把 child.stdout 的异步迭代桥接成 Readable。

### 6.3 `apps/daemon/src/agent/claude.ts`

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import { platform } from "node:os";
import type { Logger } from "pino";
import { killProcessTree } from "../platform/windows.ts";
import { parseStreamJson } from "./stream-json.ts";
import type { Backend, ExecOptions, Message } from "./backend.ts";

// 把一条 prompt 编码成 claude stream-json 的 user 消息帧。
// 对照 multica claude.go::buildClaudeInput：content 是块数组，文本塞 text 块。
function buildClaudeInput(prompt: string): string {
  const payload = {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text: prompt }],
    },
  };
  return JSON.stringify(payload) + "\n"; // 末尾换行：claude 按行读 stdin
}

// 组装命令行参数。阶段 4 最小集（见文档第 3 节裁剪表）。
function buildClaudeArgs(opts: ExecOptions): string[] {
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--verbose",
    "--permission-mode", "bypassPermissions",
    "--disallowedTools", "AskUserQuestion",
  ];
  if (opts.model) args.push("--model", opts.model);
  if (opts.maxTurns && opts.maxTurns > 0) args.push("--max-turns", String(opts.maxTurns));
  return args;
}

export interface ClaudeBackendOpts {
  // claude 可执行路径；默认 "claude"（依赖 PATH 解析）。
  binary?: string;
  logger: Logger;
}

// stderr 环形缓冲：只留最后 N 字节，子进程异常退出时取出来拼进错误信息。
const STDERR_TAIL_BYTES = 2048;

export class ClaudeBackend implements Backend {
  private readonly binary: string;
  private readonly logger: Logger;

  constructor(opts: ClaudeBackendOpts) {
    this.binary = opts.binary ?? "claude";
    this.logger = opts.logger;
  }

  async *execute(prompt: string, opts: ExecOptions = {}): AsyncGenerator<Message> {
    const args = buildClaudeArgs(opts);
    const child = spawn(this.binary, args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      // Windows 下尽量不弹黑窗；CREATE_NO_WINDOW 的「孙子弹窗」问题留阶段 7。
      windowsHide: true,
    });

    // stderr 收尾缓冲
    let stderrTail = "";
    let stderrBuf = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      if (stderrBuf.length > STDERR_TAIL_BYTES) {
        stderrBuf = stderrBuf.slice(-STDERR_TAIL_BYTES);
      }
    });

    // 取消传播：abort 时关 stdin 并杀进程树。
    const onAbort = () => {
      this.logger.info("aborting claude: closing stdin + killing process tree");
      try { child.stdin?.end(); } catch { /* 已关 */ }
      killProcessTree(child);
    };
    opts.signal?.addEventListener("abort", onAbort);
    const removeAbort = () => opts.signal?.removeEventListener("abort", onAbort);

    try {
      // 写 prompt 到 stdin 然后关——claude 据此知道输入结束。
      child.stdin?.write(buildClaudeInput(prompt));
      child.stdin?.end();

      // stdout 逐行解析 → Message
      yield* mapClaudeFramesToMessages(
        parseStreamJson<ClaudeFrame>(child.stdout, this.logger),
        this.logger,
      );

      // 等子进程退出，拿 exit code。
      const code = await waitForExit(child);
      if (code !== 0 && !opts.signal?.aborted) {
        stderrTail = stderrBuf;
        yield {
          type: "error",
          text: `claude exited with code ${code}` + (stderrTail ? `\n${stderrTail}` : ""),
        };
      }
    } finally {
      removeAbort();
    }
  }
}

// 等子进程退出，返回 exit code（被信号杀返回 null）。
function waitForExit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    child.once("exit", (code) => resolve(code));
  });
}

// 把 claude 原生帧展平成统一 Message。一个 assistant 帧可能含多个 content 块，
// 展开成多条 Message——UI 流式渲染更顺。
async function* mapClaudeFramesToMessages(
  frames: AsyncIterable<ClaudeFrame>,
  logger: Logger,
): AsyncGenerator<Message> {
  for await (const frame of frames) {
    yield* toMessages(frame);
    if (frame.type === "result") return; // result 是最后一帧，结束流
  }
}

function* toMessages(frame: ClaudeFrame): Generator<Message> {
  switch (frame.type) {
    case "system":
      if (frame.session_id) yield { type: "system", sessionId: frame.session_id };
      return;
    case "result":
      yield {
        type: "result",
        text: frame.result,
        isError: frame.is_error,
        sessionId: frame.session_id,
      };
      return;
    case "log":
      yield { type: "log", level: frame.log?.level, text: frame.log?.message };
      return;
    case "assistant":
    case "user":
      // assistant / user 的 message.content 是块数组，逐块展平
      for (const block of frame.message?.content ?? []) {
        yield* contentBlockToMessage(block);
      }
      return;
    default:
      return;
  }
}

function* contentBlockToMessage(block: ClaudeContentBlock): Generator<Message> {
  switch (block.type) {
    case "text":
      if (block.text) yield { type: "text", text: block.text };
      return;
    case "thinking":
      if (block.text) yield { type: "thinking", text: block.text };
      return;
    case "tool_use":
      yield { type: "tool_use", tool: block.name, callId: block.id, input: block.input };
      return;
    case "tool_result":
      yield { type: "tool_result", callId: block.tool_use_id, output: stringifyResult(block.content) };
      return;
    default:
      return;
  }
}

function stringifyResult(content: unknown): string {
  if (typeof content === "string") return content;
  try { return JSON.stringify(content); } catch { return String(content); }
}

// ---- claude 原生帧的最小类型（只声明我们要读的字段，其余忽略）----

interface ClaudeContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
}

interface ClaudeMessage {
  role?: string;
  content?: ClaudeContentBlock[];
}

interface ClaudeFrame {
  type: string;
  session_id?: string;
  result?: string;
  is_error?: boolean;
  log?: { level?: string; message?: string };
  message?: ClaudeMessage;
}

// 引用 platform 让树摇保留 import（windowsHide 仅 Windows 生效路径用不到）
void platform;
```

### 6.4 `apps/daemon/src/platform/windows.ts`

```typescript
import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import type { ChildProcess } from "node:child_process";

// 杀掉一棵进程树。Windows 下 child.kill() 只杀父进程，孙子进程会变孤儿继续跑
// （claude 会 spawn bash/node 等工具子进程）。必须用 taskkill /T 递归杀。
// 其他平台 child.kill() 默认发 SIGTERM 给进程组即可（spawn 已设 detached 时）。
export function killProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    if (platform() === "win32") {
      // /T 连子进程一起杀；/F 强制（claude 可能不响应温和信号）。
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    // 已经死了就忽略；调用方不关心。
  }
}
```

> 文件名叫 `windows.ts` 是因为「Windows 特有的进程终止」逻辑住这里，对齐 `00-学习计划` 第 9 条「Windows 特有事项集中在 `apps/daemon/src/platform/windows.ts`」。非 Windows 分支也放这（同函数两个分支）。

### 6.5 `apps/daemon/src/agent/probe.ts`

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// claude 最小版本要求，对齐 multica version.go::MinVersions["claude"]。
const MIN_CLAUDE_VERSION = "2.0.0";

export interface ProbeResult {
  available: boolean;
  binary: string;
  version: string | null;
  // 不满足最小版本时填；UI 用来提示升级。
  error: string | null;
}

// 探测 claude 是否在 PATH + 版本是否达标。daemon 启动 preflight 调一次，
// 结果填进 health 的 agents 字段，并决定是否在 UI 里提示安装/升级。
export async function probeClaude(binary = "claude"): Promise<ProbeResult> {
  try {
    const { stdout } = await execFileP(binary, ["--version"], {
      windowsHide: true,
      timeout: 5000,
    });
    const version = extractVersion(stdout);
    if (!version) {
      return { available: false, binary, version: null, error: "无法解析 claude 版本号" };
    }
    if (!meetsMin(version, MIN_CLAUDE_VERSION)) {
      return { available: false, binary, version, error: `claude ≥ ${MIN_CLAUDE_VERSION} 才支持 stream-json，当前 ${version}` };
    }
    return { available: true, binary, version, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // ENOENT = 没装；其余（超时等）也归为不可用。
    return { available: false, binary, version: null, error: msg };
  }
}

// `claude --version` 输出形如 "2.1.0 (claude code)" 或 "1.0.30 ..."。取第一段数字。
function extractVersion(stdout: string): string | null {
  const m = stdout.trim().match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

// 简易语义版本比较：逐段比数字。够用，不引 semver 依赖。
function meetsMin(version: string, min: string): boolean {
  const v = version.split(".").map(Number);
  const m = min.split(".").map(Number);
  for (let i = 0; i < Math.max(v.length, m.length); i++) {
    const a = v[i] ?? 0;
    const b = m[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true; // 相等也算达标
}
```

### 6.6 `apps/daemon/src/main.ts` diff

preflight 处加探测，结果填 `runtime.agents`：

```diff
 import type { Server } from "node:http";
 import { loadConfig } from "./config.ts";
 import { createLogger } from "./logger.ts";
+import { probeClaude } from "./agent/probe.ts";
 import {
   startHealthServer,
   type DaemonRuntimeState,
 } from "./health/server.ts";
```

```diff
 const runtime: DaemonRuntimeState = {
   startedAt: Date.now(),
   ready: false,
   logDir: config.logDir,
+  agents: [], // probeClaude 后填充
 };
```

```diff
-// preflight 完成（本阶段很轻，阶段 4 之后这里会加 probeClaude）。
-runtime.ready = true;
+// preflight：探测 claude。这一步有延迟（spawn 一次 CLI），所以放在
+// health server 起来之后、ready 之前——liveness 已就绪，readiness 等探测完。
+const claude = await probeClaude();
+if (claude.available) {
+  runtime.agents = ["claude"];
+  logger.info({ version: claude.version }, "claude detected");
+} else {
+  logger.warn({ err: claude.error }, "claude not available; agent tasks will fail");
+}
+runtime.ready = true;
 logger.info("daemon ready");
```

`DaemonRuntimeState` 加 `agents: string[]`；`health/server.ts` 的 `healthHandler` 把 `agents: []` 改成 `agents: state.agents`。

### 6.7 临时验证脚本 `apps/daemon/src/agent/cli.ts`

```typescript
// 手动验证 ClaudeBackend：跑通就说明 spawn + stdin + stream-json + abort 全链路 OK。
// 阶段 5 用 task API 取代后可删，或保留作 dev 排查工具。
import { createLogger } from "../logger.ts";
import { loadConfig } from "../config.ts";
import { ClaudeBackend } from "./claude.ts";

const prompt = process.argv[2] ?? "用一句话回答：2+2 等于几？";
const logger = createLogger({ level: loadConfig().logLevel, logDir: loadConfig().logDir });
const backend = new ClaudeBackend({ logger });

for await (const msg of backend.execute(prompt)) {
  // 只把人类关心的几类打到 stdout（text/tool/result），其余静默避免刷屏。
  if (msg.type === "text") process.stdout.write(`[text] ${msg.text}\n`);
  else if (msg.type === "tool_use") process.stdout.write(`[tool_use] ${msg.tool}\n`);
  else if (msg.type === "result") process.stdout.write(`[result] ${msg.text} (error=${msg.isError})\n`);
}
```

`apps/daemon/package.json` 加脚本：

```json
"agent:cli": "tsx src/agent/cli.ts"
```

---

## 7. 验证

```bash
# 0. 前置：机器上装了 claude code，且版本 ≥ 2.0.0
claude --version
```

```bash
# 1. 类型检查
pnpm typecheck
```

```bash
# 2. 跑 backend cli（手动全链路）
pnpm -C apps/daemon agent:cli "用一句话回答：2+2 等于几？"
```

预期 stdout 逐行出现：

```
[text] 2 加 2 等于 4。
[result] 2 加 2 等于 4。 (error=false)
```

（若 claude 用了工具，会先看到 `[tool_use] ...`。）

```bash
# 3. daemon 起来后 health 带 agents
pnpm dev:daemon   # 另一个终端
curl http://127.0.0.1:19514/health
```

预期 `agents: ["claude"]`（装了）/ `agents: []` + 日志 warn（没装）。

```bash
# 4. abort 取消（让 claude 跑个长任务，中途 Ctrl-C 或 kill）
#    预期：进程树被 taskkill /T 清掉，无孤儿 claude/node 残留。
```

---

## 8. 常见陷阱

### 8.1 stdout 一次读到半行 / 多行

**症状**：解析出错的行很多，或一条 assistant 消息被截断。

**根因**：管道是字节流，一次 `data` 事件可能是 `{"type":"ass` 或两条完整 JSON 拼一起。直接 `JSON.parse(chunk)` 必崩。

**解法**：用 `node:readline`（本阶段 `stream-json.ts`）做行缓冲。**不要**手写 `split("\n")`——它处理不好「最后一个 chunk 没换行符」的残留。

### 8.2 不关 stdin 导致 claude 挂住

**症状**：prompt 写进去后 claude 不退出，cli 永远不结束。

**根因**：claude 的 `--input-format stream-json` 会一直等 stdin 的下一条消息。不 `stdin.end()`，它不知道输入结束。

**解法**：写完 prompt 立刻 `child.stdin.end()`（本阶段 `claude.ts` 已这么做）。

### 8.3 取消后留孤儿进程

**症状**：abort 后 claude 进程没了，但它 spawn 的 `bash`/`node` 还在任务管理器里跑。

**根因**：Windows 下 `child.kill()` 只杀 claude 本身。

**解法**：用 `killProcessTree`（`taskkill /T`）。本阶段已封装。验证：长任务取消后查 `tasklist | grep -E "claude|node"` 应无残留。

### 8.4 `--verbose` 漏掉导致 result 帧不全

**症状**：拿到的 `result` 消息 `text` 为空，或没有 `usage`。

**根因**：不加 `--verbose`，claude 的 stream-json 输出会精简，result 帧不带完整字段。

**解法**：参数里保留 `--verbose`（本阶段已加）。

### 8.5 权限弹窗 / 卡在提问

**症状**：claude 跑到一半停住，stdout 不再有新帧。

**根因**：claude 想用某工具但需要权限确认，或调用了 `AskUserQuestion`。daemon 无人值守，没人应答。

**解法**：`--permission-mode bypassPermissions` + `--disallowedTools AskUserQuestion`（本阶段已加）。

### 8.6 spawn 找不到 claude（ENOENT）

**症状**：`Error: spawn claude ENOENT`。

**根因**：`claude` 不在 daemon 进程的 PATH 里。Electron 打包后尤其常见（GUI 应用继承的 PATH 与终端不同）。

**解法**：阶段 4 dev 下确保 `claude --version` 在终端能跑。阶段 7 打包时在 `claude-installer.ts` 探测 npm global 路径注入 PATH。本阶段 probe 会先报清楚。

---

## 9. 本阶段产出清单

- [ ] `apps/daemon/src/agent/backend.ts`（`Backend` 接口 + `Message` / `ExecOptions`）
- [ ] `apps/daemon/src/agent/stream-json.ts`（行缓冲解析）
- [ ] `apps/daemon/src/agent/claude.ts`（`ClaudeBackend`）
- [ ] `apps/daemon/src/agent/probe.ts`（探测 + 版本检查）
- [ ] `apps/daemon/src/platform/windows.ts`（`killProcessTree`）
- [ ] `apps/daemon/src/agent/cli.ts`（临时验证脚本）
- [ ] `apps/daemon/src/main.ts` 接入 probe，`runtime.agents` 填充
- [ ] `apps/daemon/src/health/server.ts` 暴露 `state.agents`
- [ ] `pnpm typecheck` 通过
- [ ] `agent:cli "..."` 能拿到 text + result 流
- [ ] health 返回 `agents: ["claude"]`

---

**下一步**：跑通验证后告诉我，进阶段 5（Task HTTP API + NDJSON 流式输出：`POST /task/run`、`GET /task/:id/events`、`DELETE /task/:id`）。
