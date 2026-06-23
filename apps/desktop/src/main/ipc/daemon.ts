// daemon 的 IPC 桥接：renderer 经 preload invoke 这些通道，main 转成对 daemon 的 HTTP。
// 这是 desktop「renderer 不直连 daemon」的落点（CLAUDE.md 第 8 节）。
import { ipcMain, type BrowserWindow } from "electron";
import type { DaemonHealth } from "@demo/core/daemon/client";
import type { TaskRunRequest } from "@demo/core/daemon/task";
import { checkClaude } from "../claude-installer";
import { DAEMON_HEALTH_PORT, type DaemonManager } from "../daemon-manager";

interface RegisterOpts {
  manager: DaemonManager;
  getWindow: () => BrowserWindow | null;
}

const base = `http://127.0.0.1:${DAEMON_HEALTH_PORT}`;

// 活跃的流式订阅：unsubscribe 时用 AbortController 中断 fetch，防泄漏
// （否则 renderer 卸载后 main 的 fetch 还在跑）。
const streams = new Map<string, AbortController>();

export function registerDaemonIpc(opts: RegisterOpts): void {
  const { manager, getWindow } = opts;

  ipcMain.handle("daemon:start", async () => {
    await manager.start();
  });
  ipcMain.handle("daemon:stop", async () => {
    await manager.stop();
  });
  ipcMain.handle("daemon:get-status", () => manager.getStatus());

  ipcMain.handle("daemon:get-health", async () => {
    try {
      const res = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      const h = (await res.json()) as {
        status: string;
        agents: string[];
        activeTaskCount: number;
      };
      return {
        status: h.status === "running" ? ("running" as const) : ("starting" as const),
        agents: h.agents,
        activeTaskCount: h.activeTaskCount,
      } satisfies DaemonHealth;
    } catch {
      return null;
    }
  });

  ipcMain.handle("daemon:run-task", async (_e, req: TaskRunRequest) => {
    const res = await fetch(`${base}/task/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`POST /task/run 失败：${res.status}`);
    return (await res.json()) as { task_id: string };
  });

  ipcMain.handle("daemon:cancel-task", async (_e, taskId: string) => {
    await fetch(`${base}/task/${taskId}`, { method: "DELETE" });
  });

  // 长流：fetch daemon 的 NDJSON，逐行解析转发给 renderer，直到流结束或被 unsubscribe。
  // 注意：handle 不在 fetch 结束前 resolve；renderer 卸载要靠 unsubscribe-events 中断。
  ipcMain.handle("daemon:subscribe-events", async (_e, taskId: string) => {
    const controller = new AbortController();
    streams.set(taskId, controller);
    try {
      const res = await fetch(`${base}/task/${taskId}/events`, {
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return;
      await pumpNdjson(res.body, (event) => {
        getWindow()?.webContents.send("daemon:task-event", { taskId, event });
      });
    } catch {
      // abort（unsubscribe）或网络错——静默；renderer 可能已卸载，不能 reject。
    } finally {
      streams.delete(taskId);
    }
  });

  ipcMain.handle("daemon:unsubscribe-events", (_e, taskId: string) => {
    streams.get(taskId)?.abort();
  });

  // 检测本机 claude（带 npm global PATH 探测），缺失时 renderer 引导安装。
  ipcMain.handle("daemon:check-claude", async () => checkClaude());

  // manager 状态变化主动推给 renderer（renderer 订阅而非轮询）。
  manager.onStatusChange((status) => {
    getWindow()?.webContents.send("daemon:status", status);
  });
}

// 读 ReadableStream 的 NDJSON：按 \n 切（处理跨 chunk 的半行），每行 JSON.parse 后 onData。
async function pumpNdjson(
  body: ReadableStream<Uint8Array>,
  onData: (event: unknown) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
      if (!line) continue;
      try {
        onData(JSON.parse(line));
      } catch {
        // 单行解析失败跳过，不中断流。
      }
    }
  }
}
