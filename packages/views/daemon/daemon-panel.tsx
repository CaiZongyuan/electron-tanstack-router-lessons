// daemon 状态条：状态徽标 + agents + 活跃 task 数 + 启动/停止按钮。
// 按 client.capabilities.manageProcess 决定按钮是否可用（web 端只读）。
import { Activity, Play, Square } from "lucide-react";
import { useDaemonClient } from "@demo/core/daemon/client-context";
import { Badge } from "@demo/ui/components/ui/badge";
import { Button } from "@demo/ui/components/ui/button";
import { useDaemonStatus } from "./use-daemon-status";

const STATUS_LABEL: Record<string, string> = {
  stopped: "已停止",
  starting: "启动中",
  running: "运行中",
  stopping: "停止中",
  error: "异常",
};

export function DaemonPanel() {
  const client = useDaemonClient();
  const { status, health } = useDaemonStatus();
  const canManage = client.capabilities.manageProcess;
  const isBusy = status === "starting" || status === "stopping";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <Activity className="size-4 text-muted-foreground" />
      <Badge variant={status === "running" ? "default" : "outline"}>
        {STATUS_LABEL[status] ?? status}
      </Badge>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>agents: {health?.agents.join(", ") || "—"}</span>
        <span>活跃 task: {health?.activeTaskCount ?? 0}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {canManage ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={isBusy || status === "running"}
              onClick={() => void client.start()}
            >
              <Play className="size-3.5" />
              启动
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isBusy || status !== "running"}
              onClick={() => void client.stop()}
            >
              <Square className="size-3.5" />
              停止
            </Button>
          </>
        ) : (
          <span
            className="text-xs text-muted-foreground"
            title="web 端无法管理 daemon 进程，请在 desktop 启动"
          >
            web 端只读
          </span>
        )}
      </div>
    </div>
  );
}
