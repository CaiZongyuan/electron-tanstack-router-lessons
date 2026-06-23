// claude onboarding/配置面板：未装→安装指引；未认证→智谱 token 一键配置；可查看 settings.json 路径与内容。
// 仅 desktop（web 无 checkClaude/getClaudeConfig 能力）。
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import type { ClaudeConfigInfo, ClaudeStatus } from "@demo/core/daemon/client";
import { useDaemonClient } from "@demo/core/daemon/client-context";
import { Button } from "@demo/ui/components/ui/button";
import { Input } from "@demo/ui/components/ui/input";

export function ClaudeMissingBanner() {
  const client = useDaemonClient();
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [config, setConfig] = useState<ClaudeConfigInfo | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const detect = () => {
    void client.checkClaude?.().then(setStatus);
    void client.getClaudeConfig?.().then((c) => {
      setConfig(c);
      // 回显已存的 token（若用智谱模板写过）。
      const env = parseEnv(c?.content);
      if (env.ANTHROPIC_AUTH_TOKEN) setToken(env.ANTHROPIC_AUTH_TOKEN);
    });
  };

  useEffect(() => {
    detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // web 无能力、还没检测完、或已装且已认证 → 不显示。
  if (!client.checkClaude || status === null) return null;
  const needInstall = !status.installed;
  const needAuth = status.installed && !status.authenticated;
  if (!needInstall && !needAuth) return null;

  async function applyZhipu() {
    if (!client.applyZhipuConfig) return;
    setBusy(true);
    try {
      // 写智谱默认 env + token 到 ~/.claude/settings.json（claude 自己读，无需重启 daemon）。
      await client.applyZhipuConfig(token.trim());
      detect();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-foreground">
      <div className="flex items-center gap-2">
        {needInstall ? (
          <AlertTriangle className="size-3.5 shrink-0 text-warning" />
        ) : (
          <KeyRound className="size-3.5 shrink-0 text-warning" />
        )}
        <span>
          {needInstall ? (
            <>
              未检测到 claude code，请运行{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                npm i -g @anthropic-ai/claude-code
              </code>
            </>
          ) : (
            <>
              claude 已装但未认证。填入智谱 token 一键配置（或终端运行{" "}
              <code className="font-mono">claude</code> 自行配置）：
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
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setExpanded((v) => !v)}
          title="查看配置文件"
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </Button>
      </div>

      {needAuth && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="password"
            value={token}
            placeholder="智谱 ANTHROPIC_AUTH_TOKEN"
            onChange={(e) => setToken(e.target.value)}
            className="h-7 font-mono text-xs"
          />
          <Button
            size="sm"
            disabled={busy || !token.trim()}
            onClick={() => void applyZhipu()}
          >
            {busy ? "写入中…" : "使用智谱默认"}
          </Button>
        </div>
      )}

      {expanded && config && (
        <div className="mt-2 space-y-1">
          <p className="text-muted-foreground">
            配置文件：<code className="font-mono">{config.path}</code>
            {config.exists ? "" : "（不存在）"}
          </p>
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted/60 p-2 font-mono text-xs leading-relaxed">
            {config.content || "(空)"}
          </pre>
        </div>
      )}
    </div>
  );
}

// 从 settings.json 原文提取 env 块（回显 token 用）。
function parseEnv(content?: string): Record<string, string> {
  if (!content) return {};
  try {
    const obj = JSON.parse(content) as { env?: Record<string, string> };
    return obj.env ?? {};
  } catch {
    return {};
  }
}
