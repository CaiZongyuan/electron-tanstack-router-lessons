// desktop 版 DaemonClient：所有调用走 preload IPC，main 转成对 daemon 的 HTTP。
// 这是 CLAUDE.md 第 8 节「renderer 经 IPC 调主进程」的 renderer 侧落点。
import type { DaemonClient } from "@demo/core/daemon/client";

export const desktopDaemonClient: DaemonClient = {
  capabilities: { manageProcess: true },

  start: () => window.desktopAPI.daemonStart(),
  stop: () => window.desktopAPI.daemonStop(),
  getStatus: () => window.desktopAPI.daemonGetStatus(),
  getHealth: () => window.desktopAPI.daemonGetHealth(),

  onStatusChange(cb) {
    return window.desktopAPI.onDaemonStatus(cb);
  },

  runTask(req) {
    return window.desktopAPI.daemonRunTask(req);
  },
  cancelTask(taskId) {
    return window.desktopAPI.daemonCancelTask(taskId);
  },

  async streamTaskEvents(taskId, onEvent) {
    // 先订阅（按 taskId 过滤），再 invoke——避免漏首包（daemon store 同步回放，
    // main 在 invoke 后才开始 fetch+转发，listener 已就位）。
    const off = window.desktopAPI.onDaemonTaskEvent(({ taskId: tid, event }) => {
      if (tid === taskId) onEvent(event);
    });
    try {
      // daemonSubscribeEvents 在 main 的 fetch 流结束（task 终止、daemon 关连接）时 resolve。
      await window.desktopAPI.daemonSubscribeEvents(taskId);
    } finally {
      off();
      // 主动通知 main 释放（幂等：流已结束则 no-op）。
      await window.desktopAPI.daemonUnsubscribeEvents(taskId).catch(() => {});
    }
  },
};
