// claude 缺失时顶部引导安装。仅 desktop（web 无 checkClaude 能力）。
// 检测带 npm global PATH 探测，解决 GUI 应用 PATH 不含 %APPDATA%\npm 的问题。
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ClaudeStatus } from "@demo/core/daemon/client";
import { useDaemonClient } from "@demo/core/daemon/client-context";
import { Button } from "@demo/ui/components/ui/button";

export function ClaudeMissingBanner() {
  const client = useDaemonClient();
  const [status, setStatus] = useState<ClaudeStatus | null>(null);

  const detect = () => {
    void client.checkClaude?.().then((s) => setStatus(s));
  };

  useEffect(() => {
    detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // web 无 checkClaude、或已装、或还没检测完 → 不显示。
  if (!client.checkClaude || status === null || status.installed) return null;

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground">
      <AlertTriangle className="size-3.5 shrink-0 text-warning" />
      <span>未检测到 claude code，请运行</span>
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
        npm i -g @anthropic-ai/claude-code
      </code>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={detect}
        title="装好后重新检测"
      >
        <RefreshCw className="size-3" />
      </Button>
    </div>
  );
}
