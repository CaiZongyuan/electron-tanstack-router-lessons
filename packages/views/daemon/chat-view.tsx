// 共享对话页：顶部 daemon 状态条 + 消息流 + prompt 输入。
// 只用 DaemonClient 抽象接口，desktop（IPC）/ web（fetch）两端同构。
import { useState } from "react";
import { Send } from "lucide-react";
import { useDaemonClient } from "@demo/core/daemon/client-context";
import { isTerminalTaskStatus, type TaskEvent } from "@demo/core/daemon/task";
import { Button } from "@demo/ui/components/ui/button";
import { Input } from "@demo/ui/components/ui/input";
import { ScrollArea } from "@demo/ui/components/ui/scroll-area";
import { PageHeader } from "../layout/page-header";
import { DaemonPanel } from "./daemon-panel";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
}

const STATUS_HINT: Record<string, string> = {
  running: "生成中…",
  done: "完成",
  failed: "失败",
  cancelled: "已取消",
};

export function ChatView() {
  const client = useDaemonClient();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [hint, setHint] = useState("");

  async function send() {
    const prompt = input.trim();
    if (!prompt || streaming) return;
    setInput("");
    // 追加 user 消息 + 一条空的 assistant 占位，流式 text 累积进去。
    setMessages((m) => [
      ...m,
      { role: "user", text: prompt },
      { role: "assistant", text: "", pending: true },
    ]);
    setStreaming(true);
    setHint(STATUS_HINT.running);
    try {
      const { task_id } = await client.runTask({ prompt });
      await client.streamTaskEvents(task_id, applyEvent);
    } catch (err) {
      appendAssistantText(`\n[出错] ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setStreaming(false);
      finalizeLast();
    }
  }

  function applyEvent(e: TaskEvent) {
    // 过滤 claude --verbose 的 system 子事件日志噪音（见 06 文档陷阱 8.3）。
    if (e.type === "log" && e.text?.startsWith("system:")) return;
    if (e.type === "text" && e.text) {
      appendAssistantText(e.text);
    } else if (e.type === "error" && e.text) {
      appendAssistantText(`\n[错误] ${e.text}`);
    } else if (e.type === "tool_use" && e.tool) {
      appendAssistantText(`\n[工具] ${e.tool}`);
    } else if (e.type === "status" && e.status) {
      if (isTerminalTaskStatus(e.status)) setHint(STATUS_HINT[e.status] ?? e.status);
    }
  }

  // 把文本累积到最后一条 assistant 消息（不可变更新）。
  function appendAssistantText(text: string) {
    setMessages((m) => updateLastAssistant(m, (last) => ({ ...last, text: last.text + text, pending: false })));
  }

  function finalizeLast() {
    setMessages((m) => updateLastAssistant(m, (last) => ({ ...last, pending: false })));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <PageHeader className="gap-2">
        <Send className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">运行时 · 对话</h1>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 md:p-6">
        <DaemonPanel />

        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
          <ScrollArea className="h-full">
            <div className="flex min-h-full flex-col gap-3 p-4">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  向本地 daemon 发送 prompt，查看流式回复。
                </p>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={m.role === "user" ? "self-end" : "self-start"}
                  >
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-prose rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                          : "max-w-prose rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
                      }
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {m.text || (m.pending ? "…" : "")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="flex items-center gap-2 border-t border-border p-3">
            <Input
              value={input}
              placeholder={streaming ? "生成中…" : "输入 prompt，回车发送"}
              disabled={streaming}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button
              size="sm"
              disabled={streaming || !input.trim()}
              onClick={() => void send()}
            >
              <Send className="size-3.5" />
              发送
            </Button>
          </div>
        </div>

        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
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
