// web 版 DaemonClient：浏览器直接 fetch daemon HTTP（无 main 进程）。
// start/stop 是 no-op（manageProcess=false）；状态靠轮询 /health 推断。
import type { DaemonClient, DaemonHealth, DaemonStatus } from "@demo/core/daemon/client";
import type { TaskEvent, TaskRunResponse } from "@demo/core/daemon/task";

// daemon 默认端口（core DAEMON_HEALTH_PORT_DEFAULT）。web 直连同一台机的 daemon。
const BASE = "http://127.0.0.1:19514";

export const webDaemonClient: DaemonClient = {
  capabilities: { manageProcess: false },

  // web 不管进程：daemon 由 desktop 或外部启动。
  async start() {},
  async stop() {},

  async getStatus() {
    const h = await fetchHealth();
    return h?.status === "running" ? "running" : "stopped";
  },

  async getHealth() {
    return fetchHealth();
  },

  onStatusChange(cb) {
    // web 没有 main 主动推送，靠轮询 /health 推断状态变化。
    let current: DaemonStatus | undefined;
    const tick = async () => {
      const h = await fetchHealth();
      const next: DaemonStatus = h?.status === "running" ? "running" : "stopped";
      if (next !== current) {
        current = next;
        cb(next);
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 3000);
    return () => clearInterval(timer);
  },

  async runTask(req) {
    const res = await fetch(`${BASE}/task/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`POST /task/run 失败：${res.status}`);
    return (await res.json()) as TaskRunResponse;
  },

  async cancelTask(taskId) {
    await fetch(`${BASE}/task/${taskId}`, { method: "DELETE" });
  },

  async streamTaskEvents(taskId, onEvent) {
    const res = await fetch(`${BASE}/task/${taskId}/events`);
    if (!res.ok || !res.body) throw new Error(`GET /events 失败：${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    // 逐行解析 NDJSON（处理跨 chunk 的半行）。流自然结束（task 终止、daemon关连接）即 resolve。
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
          onEvent(JSON.parse(line) as TaskEvent);
        } catch {
          // 单行解析失败跳过。
        }
      }
    }
  },
};

async function fetchHealth(): Promise<DaemonHealth | null> {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) return null;
    const h = (await res.json()) as {
      status: string;
      agents: string[];
      activeTaskCount: number;
    };
    return {
      status: h.status === "running" ? "running" : "starting",
      agents: h.agents,
      activeTaskCount: h.activeTaskCount,
    };
  } catch {
    return null;
  }
}
