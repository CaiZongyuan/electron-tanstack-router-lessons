import { spawn, type ChildProcess } from "node:child_process";
import { platform } from "node:os";
import type { Logger } from "pino";
import { killProcessTree } from "../platform/windows.ts";
import { parseStreamJson } from "./stream-json.ts";
import type { Backend, ExecOptions, Message } from "./backend.ts";

// 把一条 prompt 编码成 claude stream-json 的 user 消息帧。
// 对照 multica claude.go::buildClaudeInput：content 是块数组，文本塞 text 块。
function buildClaudeInput(prompt: string): string {
  return (
    JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text: prompt }],
      },
    }) + "\n"
  ); // 末尾换行：claude 按行读 stdin
}

// 组装命令行参数。阶段 4 最小集（见 docs/daemon/05 第 3 节裁剪表）。
function buildClaudeArgs(opts: ExecOptions): string[] {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--input-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "bypassPermissions",
    "--disallowedTools",
    "AskUserQuestion",
  ];
  if (opts.model) args.push("--model", opts.model);
  if (opts.maxTurns && opts.maxTurns > 0)
    args.push("--max-turns", String(opts.maxTurns));
  return args;
}

// stderr 环形缓冲：只留最后 2KB，子进程异常退出时拼进错误信息。
const STDERR_TAIL_BYTES = 2048;

export interface ClaudeBackendOpts {
  // claude 可执行路径；默认 "claude"（依赖 PATH 解析）。
  binary?: string;
  logger: Logger;
}

export class ClaudeBackend implements Backend {
  private readonly binary: string;
  private readonly logger: Logger;

  constructor(opts: ClaudeBackendOpts) {
    this.binary = opts.binary ?? "claude";
    this.logger = opts.logger;
  }

  async *execute(prompt: string, opts: ExecOptions = {}): AsyncGenerator<Message> {
    const args = buildClaudeArgs(opts);
    this.logger.info({ binary: this.binary, args }, "spawning claude");

    const child = spawn(this.binary, args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      // Windows 下尽量不弹黑窗；CREATE_NO_WINDOW 的「孙子弹窗」问题留阶段 7。
      windowsHide: true,
      // Windows 上 claude 是 npm 全局装的 claude.cmd：spawn 不带 shell 只认
      // .exe 会 ENOENT；开 shell 走 cmd.exe 才能用 PATHEXT 解析到 .cmd。
      // prompt 走 stdin 不进命令行，开 shell 不引入注入面。
      shell: platform() === "win32",
    });

    // spawn 失败（如 ENOENT）的 'error' 在 spawn 后异步触发。原来由
    // waitForExit 在很后面才挂监听，错误可能在 stdin 写入 / stdout 迭代期间
    // 先到，变成未捕获事件把整个 daemon 拖崩。这里立刻捕获，留待 waitForExit
    // 采纳，确保 spawn 失败只产出一条 error message 而不崩进程。
    let spawnError: Error | null = null;
    child.once("error", (err) => {
      spawnError = err;
    });

    let stderrTail = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail += chunk.toString();
      if (stderrTail.length > STDERR_TAIL_BYTES) {
        stderrTail = stderrTail.slice(-STDERR_TAIL_BYTES);
      }
    });

    // 取消传播：abort 时关 stdin 并杀进程树。
    const onAbort = () => {
      this.logger.info("aborting claude: 关闭 stdin + 杀进程树");
      try {
        child.stdin?.end();
      } catch {
        // 已关
      }
      killProcessTree(child);
    };
    opts.signal?.addEventListener("abort", onAbort);

    try {
      // 写 prompt 到 stdin 然后关——claude 据此知道输入结束。
      child.stdin?.write(buildClaudeInput(prompt));
      child.stdin?.end();

      // 转发流式消息，并跟踪是否收到终结的 result 帧。claude 因 API 过载
      // 等原因 exit 0 却没产出 result 时，靠这个判断「异常终止」并补一条 error，
      // 不让调用方干等无反馈。
      let sawResult = false;
      // spawn 已失败（spawnError）时直接跳过 stdout 迭代，交给 waitForExit 报错。
      if (!spawnError && child.stdout) {
        for await (const msg of mapClaudeFramesToMessages(
          parseStreamJson<ClaudeFrame>(child.stdout, this.logger),
        )) {
          if (msg.type === "result") sawResult = true;
          yield msg;
        }
      }

      // 等子进程退出。ENOENT（claude 没装）走 'error' 而非 'exit'。
      const { code, error } = await waitForExit(child, spawnError);
      if (error) {
        yield {
          type: "error",
          text: `无法启动 claude：${error.message}（确认 claude 在 PATH 且 probe 通过）`,
        };
      } else if (opts.signal?.aborted) {
        // 主动取消：不报错
      } else if (code !== 0) {
        yield {
          type: "error",
          text: `claude 异常退出 code=${code}${stderrTail ? `\n${stderrTail}` : ""}`,
        };
      } else if (!sawResult) {
        // exit 0 但没产出 result——通常是 API 错误重试耗尽后静默收场。
        // 上面的 system/log 帧已带有重试信息，这里补一条总结。
        yield {
          type: "error",
          text: `claude 退出但未产出结果（code=0，疑似 API 错误重试耗尽）${stderrTail ? `\n${stderrTail}` : ""}`,
        };
      }
    } finally {
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
}

// 等子进程退出，返回 exit code 与可能的 spawn error（ENOENT 等）。
function waitForExit(
  child: ChildProcess,
  // spawn 阶段已捕获的错误（spawnError）：直接采纳，避免重复监听一个
  // 已经触发过、once 消费掉的事件而永远等不到。
  capturedError: Error | null = null,
): Promise<{ code: number | null; error: Error | null }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (code: number | null, error: Error | null) => {
      if (done) return;
      done = true;
      resolve({ code, error });
    };
    if (capturedError) {
      finish(null, capturedError);
      return;
    }
    child.once("exit", (code) => finish(code ?? null, null));
    child.once("error", (err) => finish(null, err));
  });
}

// 把 claude 原生帧展平成统一 Message。一个 assistant 帧可能含多个 content 块，
// 展开成多条 Message——UI 流式渲染更顺。result 是最后一帧，结束流。
async function* mapClaudeFramesToMessages(
  frames: AsyncIterable<ClaudeFrame>,
): AsyncGenerator<Message> {
  for await (const frame of frames) {
    yield* toMessages(frame);
    if (frame.type === "result") return;
  }
}

function* toMessages(frame: ClaudeFrame): Generator<Message> {
  switch (frame.type) {
    case "system":
      // init 取 session_id；api_retry 等子事件透传成 log，
      // 否则 claude 在 API 过载重试时调用方完全看不到状态（看起来像卡死）。
      if (frame.subtype === "init") {
        if (frame.session_id) yield { type: "system", sessionId: frame.session_id };
      } else if (frame.subtype === "api_retry") {
        yield {
          type: "log",
          level: "warn",
          text: `api 重试 #${frame.attempt ?? "?"}（${frame.error_status ?? ""} ${frame.error ?? ""}）`,
        };
      } else if (frame.subtype) {
        yield { type: "log", text: `system: ${frame.subtype}` };
      }
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
      yield {
        type: "tool_use",
        tool: block.name,
        callId: block.id,
        input: block.input,
      };
      return;
    case "tool_result":
      yield {
        type: "tool_result",
        callId: block.tool_use_id,
        output: stringifyResult(block.content),
      };
      return;
    default:
      return;
  }
}

function stringifyResult(content: unknown): string {
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
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
  subtype?: string; // system 帧的子类型：init / api_retry / ...
  session_id?: string;
  result?: string;
  is_error?: boolean;
  attempt?: number; // api_retry 的重试次数
  error_status?: number; // api_retry 的 HTTP 状态码
  error?: string; // api_retry 的错误描述
  log?: { level?: string; message?: string };
  message?: ClaudeMessage;
}
