// claude onboarding banner：未装→安装指引；装了未认证→API key 输入。
// 仅 desktop（web 无 checkClaude 能力）。
import { useEffect, useState } from "react";
import { AlertTriangle, KeyRound, RefreshCw } from "lucide-react";
import type { ClaudeStatus } from "@demo/core/daemon/client";
import { useDaemonClient } from "@demo/core/daemon/client-context";
import { Button } from "@demo/ui/components/ui/button";
import { Input } from "@demo/ui/components/ui/input";

export function ClaudeMissingBanner() {
  const client = useDaemonClient();
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const detect = () => {
    void client.checkClaude?.().then((s) => setStatus(s));
  };

  useEffect(() => {
    detect();
    // 回显已保存的 key（方便用户确认/修改）。
    void client.getApiKey?.().then((k) => {
      if (k) setKey(k);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // web 无 checkClaude、已装且已认证、或还没检测完 → 不显示。
  if (
    !client.checkClaude ||
    status === null ||
    (status.installed && status.authenticated)
  ) {
    return null;
  }

  async function save() {
    if (!client.saveApiKey) return;
    setBusy(true);
    try {
      await client.saveApiKey(key.trim());
      // 重启 daemon 让新 ANTHROPIC_API_KEY 注入生效（daemon spawn 时读 key）。
      await client.stop();
      await client.start();
      detect();
    } finally {
      setBusy(false);
    }
  }

  const uninstalled = !status.installed;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-foreground">
      <div className="flex items-center gap-2">
        {uninstalled ? (
          <AlertTriangle className="size-3.5 shrink-0 text-warning" />
        ) : (
          <KeyRound className="size-3.5 shrink-0 text-warning" />
        )}
        <span>
          {uninstalled ? (
            <>
              未检测到 claude code，请运行{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                npm i -g @anthropic-ai/claude-code
              </code>
            </>
          ) : (
            <>
              claude 已装但未认证。填入 Anthropic API key，或终端运行{" "}
              <code className="font-mono">claude</code> 登录：
            </>
          )}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={detect}
          title="重新检测"
          className="ml-auto"
        >
          <RefreshCw className="size-3" />
        </Button>
      </div>
      {!uninstalled && (
        <div className="flex items-center gap-2">
          <Input
            type="password"
            value={key}
            placeholder="sk-ant-..."
            onChange={(e) => setKey(e.target.value)}
            className="h-7 font-mono text-xs"
          />
          <Button
            size="sm"
            disabled={busy || !key.trim()}
            onClick={() => void save()}
          >
            {busy ? "重启中…" : "保存并重启 daemon"}
          </Button>
        </div>
      )}
    </div>
  );
}
