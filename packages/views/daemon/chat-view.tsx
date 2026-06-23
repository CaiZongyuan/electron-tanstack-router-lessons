// ChatGPT 式对话页（液态玻璃风格，见 docs/frontend/08）。
// 共享 UI：只用 DaemonClient 抽象，desktop（IPC）/ web（fetch）两端同构。
// 流式：claude stream-json 是 message 级（整段 text），这里用打字机逐字 reveal 模拟流式。
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDaemonClient } from "@demo/core/daemon/client-context";
import type { TaskEvent } from "@demo/core/daemon/task";
import { Button } from "@demo/ui/components/ui/button";
import { Input } from "@demo/ui/components/ui/input";
import { cn } from "@demo/ui/lib/utils";
import { useDaemonStatus } from "./use-daemon-status";

interface ChatMessage {
  role: "user" | "assistant";
  text?: string; // user 文本
  fullText?: string; // assistant 已收到的完整文本（打字机目标）
  pending?: boolean; // assistant 还在接收
}

const STATUS_DOT: Record<string, string> = {
  running: "bg-success",
  starting: "bg-warning",
  stopping: "bg-warning",
  stopped: "bg-muted-foreground/40",
  error: "bg-destructive",
};
const STATUS_TEXT: Record<string, string> = {
  running: "运行中",
  starting: "启动中",
  stopping: "停止中",
  stopped: "未运行",
  error: "异常",
};

export function ChatView() {
  const client = useDaemonClient();
  const { status, health } = useDaemonStatus();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const agent = health?.agents[0];
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function send() {
    const prompt = input.trim();
    if (!prompt || streaming) return;
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", text: prompt },
      { role: "assistant", fullText: "", pending: true },
    ]);
    setStreaming(true);
    try {
      const { task_id } = await client.runTask({ prompt });
      await client.streamTaskEvents(task_id, applyEvent);
    } catch (err) {
      appendAssistantText(`\n\n**出错**：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setStreaming(false);
      setMessages((m) => finalize(m));
    }
  }

  function applyEvent(e: TaskEvent) {
    // 过滤 claude --verbose 的 system 子事件日志噪音（见 06 文档陷阱 8.3）。
    if (e.type === "log" && e.text?.startsWith("system:")) return;
    if (e.type === "text" && e.text) {
      appendAssistantText(e.text);
    } else if (e.type === "error" && e.text) {
      appendAssistantText(`\n\n> **错误**：${e.text}`);
    } else if (e.type === "tool_use" && e.tool) {
      appendAssistantText(`\n\n\`工具：${e.tool}\``);
    }
  }

  function appendAssistantText(text: string) {
    setMessages((m) =>
      updateLastAssistant(m, (last) => ({
        ...last,
        fullText: (last.fullText ?? "") + text,
      })),
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* 薄 header：app 名 + daemon 状态点 + agent */}
      <header className="flex shrink-0 items-center gap-2 px-5 py-3">
        <span className="text-sm font-medium">demo</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "size-2 rounded-full",
              STATUS_DOT[status] ?? "bg-muted-foreground/40",
            )}
          />
          <span>{STATUS_TEXT[status] ?? status}</span>
          {agent ? <span className="text-foreground/70">· {agent}</span> : null}
        </div>
      </header>

      {/* 消息流 */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((m, i) => <MessageBubble key={i} message={m} />)
          )}
        </div>
      </div>

      {/* 输入：胶囊形液态玻璃 */}
      <div className="shrink-0 px-4 pb-5">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-2xl border border-border bg-card/40 p-2 backdrop-blur-xl">
          <Input
            value={input}
            placeholder={streaming ? "生成中…" : "给 claude 发消息"}
            disabled={streaming}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button
            size="icon"
            disabled={streaming || !input.trim()}
            onClick={() => void send()}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="size-12 rounded-2xl border border-border bg-card/40 backdrop-blur-xl" />
      <h2 className="text-base font-medium">本地 agent 对话</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        直接在本机与 claude code 对话，消息经本地 daemon 流式返回。
      </p>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-prose whitespace-pre-wrap break-words rounded-2xl bg-primary/15 px-4 py-2.5 text-sm">
          {message.text}
        </div>
      </div>
    );
  }
  const done = !message.pending;
  const displayed = useTypewriter(message.fullText ?? "", done);
  return (
    <div className="flex justify-start">
      <div className="max-w-prose rounded-2xl border border-border bg-card/30 px-4 py-3 text-sm backdrop-blur-xl">
        {displayed ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {displayed}
          </ReactMarkdown>
        ) : message.pending ? (
          <span className="text-muted-foreground">思考中…</span>
        ) : null}
      </div>
    </div>
  );
}

// 打字机：把 fullText 逐字 reveal。fullText 增长时追赶；done 时直接显示完整。
// displayed 不进依赖，避免每个 tick 重跑 effect；起点用闭包 displayed（fullText 变化触发重跑时已是最新）。
function useTypewriter(fullText: string, done: boolean): string {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (done) {
      setDisplayed(fullText);
      return;
    }
    let i = displayed.length;
    if (i >= fullText.length) return;
    const id = setInterval(() => {
      i = Math.min(i + 2, fullText.length);
      setDisplayed(fullText.slice(0, i));
      if (i >= fullText.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullText, done]);
  return displayed;
}

const mdComponents: Components = {
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-muted/80 p-3 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ className, children }) =>
    /language-/.test(className ?? "") ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
    ),
  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-info underline">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h1 className="mb-1 mt-3 text-sm font-medium">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1 mt-3 text-sm font-medium">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-medium">{children}</h3>,
};

function updateLastAssistant(
  messages: ChatMessage[],
  fn: (last: ChatMessage) => ChatMessage,
): ChatMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.role !== "assistant") return messages;
  const copy = messages.slice();
  copy[copy.length - 1] = fn(last);
  return copy;
}

function finalize(messages: ChatMessage[]): ChatMessage[] {
  return updateLastAssistant(messages, (last) => ({ ...last, pending: false }));
}
