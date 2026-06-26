import { useEffect, useRef, useState } from "react";
import { ArrowUp, Plus, Square, ToyBrick } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDaemonClient } from "@demo/core/daemon/client-context";
import type { TaskEvent } from "@demo/core/daemon/task";
import { Button } from "@demo/ui/components/ui/button";
import { Input } from "@demo/ui/components/ui/input";
import { cn } from "@demo/ui/lib/utils";
import { useDaemonStatus } from "./use-daemon-status";
import { ClaudeMissingBanner } from "./claude-missing-banner";

interface ChatMessage {
  role: "user" | "assistant";
  text?: string;
  fullText?: string;
  pending?: boolean;
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
    } else if (e.type === "tool_use" && e.tool) {
      appendAssistantText(`\n\n工具调用：\`${e.tool}\``);
    } else if (e.type === "tool_result" && e.output) {
      appendAssistantText(`\n\n\`\`\`\n${truncate(e.output, 2000)}\n\`\`\``);
    } else if (e.type === "result" && e.text) {
      appendAssistantTextIfNew(e.text);
    } else if (e.type === "error" && e.text) {
      appendAssistantText(`\n\n> 错误：${e.text}`);
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

  // 追加文本但去重：result 与 text 重复时跳过。
  function appendAssistantTextIfNew(text: string) {
    setMessages((m) =>
      updateLastAssistant(m, (last) =>
        (last.fullText ?? "").trim() === text.trim()
          ? last
          : { ...last, fullText: (last.fullText ?? "") + "\n\n" + text },
      ),
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 px-6">
        <ClaudeMissingBanner />
      </div>

      <div ref={scrollRef} className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 py-12">
          <h1 className="text-center text-base font-medium">与 local-agent-team 的对话</h1>
          {messages.length === 0 ? (
            <WelcomeThread status={status} agent={agent} />
          ) : (
            messages.map((message, index) => (
              <MessageRow
                key={index}
                message={message}
                status={status}
                agent={agent}
                turnIndex={index}
              />
            ))
          )}
        </div>
      </div>

      <div className="shrink-0 px-6 pb-6">
        <div className="mx-auto w-full max-w-4xl rounded-2xl border border-border bg-card p-4 shadow-sm">
          <Input
            value={input}
            placeholder={streaming ? "生成中…" : "请输入任务，交给我来帮你完成"}
            disabled={streaming}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            className="h-12 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
          />
          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" className="rounded-full">
              <Plus className="size-4" />
              选择文件
            </Button>
            <Button
              aria-label={streaming ? "任务进行中" : "发送"}
              size="icon-lg"
              disabled={streaming || !input.trim()}
              onClick={() => void send()}
              className={cn(
                "ml-auto rounded-full",
                streaming && "bg-muted text-muted-foreground",
              )}
            >
              {streaming ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" />}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">以上内容由本地 AI 运行时生成</p>
      </div>
    </div>
  );
}

function WelcomeThread({ status, agent }: { status: string; agent?: string }) {
  return (
    <div className="flex flex-col gap-7 pt-12">
      <div className="flex justify-end">
        <div className="rounded-2xl bg-muted px-5 py-4 text-sm text-foreground">
          我目前电脑有哪些 apps
        </div>
      </div>
      <AgentMessageFrame status={status} agent={agent} pending={false}>
        <p className="text-sm leading-relaxed">
          我会通过本地 daemon 查询和整理信息。当前页面保留原有运行时能力，你可以在底部输入任务并发送给本地 agent。
        </p>
      </AgentMessageFrame>
      <AgentMessageFrame status={status} agent={agent} label="Task Agent" pending={false}>
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>工具执行结果会在这里持续追加，长输出会折叠为代码块，便于检查本机任务执行过程。</p>
          <div className="rounded-xl border border-border bg-card p-4 text-foreground">
            <p className="font-medium">本地运行时已保留</p>
            <p className="mt-1 text-sm text-muted-foreground">daemon 状态、Claude 配置提示、真实发送和流式返回都继续使用原有实现。</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost">取消</Button>
              <Button>确认</Button>
            </div>
          </div>
        </div>
      </AgentMessageFrame>
    </div>
  );
}

function MessageRow({
  message,
  status,
  agent,
  turnIndex,
}: {
  message: ChatMessage;
  status: string;
  agent?: string;
  turnIndex: number;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-5 py-4 text-sm">
          {message.text}
        </div>
      </div>
    );
  }

  const done = !message.pending;
  const displayed = useTypewriter(message.fullText ?? "", done);

  return (
    <AgentMessageFrame
      status={status}
      agent={agent}
        label={turnIndex > 2 ? "Task Agent" : "LAT"}
      pending={message.pending}
    >
      <div className="rounded-2xl bg-card px-5 py-4 text-sm shadow-sm">
        {displayed ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {displayed}
          </ReactMarkdown>
        ) : message.pending ? (
          <span className="text-muted-foreground">思考中…</span>
        ) : null}
      </div>
    </AgentMessageFrame>
  );
}

function AgentMessageFrame({
  children,
  status,
  agent,
  label = "LAT",
  pending,
}: {
  children: React.ReactNode;
  status: string;
  agent?: string;
  label?: string;
  pending?: boolean;
}) {
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
      <div className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-xs font-medium">
        {label === "Task Agent" ? <ToyBrick className="size-4" /> : "LAT"}
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="text-sm text-foreground/60">{label}</span>
          <span>|</span>
          <span>{pending ? "输入中" : "已响应"}</span>
          <span className={cn("size-2 rounded-full", STATUS_DOT[status] ?? "bg-muted-foreground/40")} />
          <span>{STATUS_TEXT[status] ?? status}</span>
          {agent ? <span>{agent}</span> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

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

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n…（已截断）` : s;
}

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
