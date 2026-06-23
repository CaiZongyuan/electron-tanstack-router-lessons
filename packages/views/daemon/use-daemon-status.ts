// 订阅 daemon 状态与 health，返回给 UI 渲染。
// 用 DaemonClient 的抽象接口，不感知是 IPC（desktop）还是 fetch 轮询（web）。
import { useEffect, useState } from "react";
import type { DaemonHealth, DaemonStatus } from "@demo/core/daemon/client";
import { useDaemonClient } from "@demo/core/daemon/client-context";

export interface DaemonStatusState {
  status: DaemonStatus;
  health: DaemonHealth | null;
}

export function useDaemonStatus(): DaemonStatusState {
  const client = useDaemonClient();
  const [state, setState] = useState<DaemonStatusState>({
    status: "stopped",
    health: null,
  });

  useEffect(() => {
    let active = true;
    // 初始拉一次状态与 health，再订阅后续变化。
    void client.getStatus().then((status) => {
      if (active) setState((s) => ({ ...s, status }));
    });
    void client.getHealth().then((health) => {
      if (active) setState((s) => ({ ...s, health }));
    });
    const off = client.onStatusChange((status) => {
      if (!active) return;
      setState((s) => ({ ...s, status }));
      // 状态变了，顺手刷新 health（agents / activeTaskCount 可能变）。
      void client.getHealth().then((health) => {
        if (active) setState((s) => ({ ...s, health }));
      });
    });
    return () => {
      active = false;
      off();
    };
  }, [client]);

  return state;
}
