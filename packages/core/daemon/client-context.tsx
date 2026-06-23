// DaemonClient 的 React Provider + hook。两端在 __root 各自注入实现。
// 照搬 @demo/core/platform/context 的写法：缺失 Provider 时抛错，早暴露接线问题。
import { createContext, useContext } from "react";
import type { PropsWithChildren } from "react";
import type { DaemonClient } from "./client";

const DaemonClientContext = createContext<DaemonClient | null>(null);

export function DaemonClientProvider({
  client,
  children,
}: PropsWithChildren<{ client: DaemonClient }>) {
  return (
    <DaemonClientContext.Provider value={client}>
      {children}
    </DaemonClientContext.Provider>
  );
}

export function useDaemonClient(): DaemonClient {
  const client = useContext(DaemonClientContext);
  if (!client) {
    throw new Error("DaemonClientProvider 缺失，无法调用 daemon 能力。");
  }
  return client;
}
