export {}

declare global {
  interface Window {
    electron: typeof import('@electron-toolkit/preload').electronAPI
    desktopAPI: {
      platform: 'desktop'
      openExternal(url: string): Promise<void>
      splashDone(): void
      // daemon（main 转成对 daemon 的 HTTP）
      daemonStart(): Promise<void>
      daemonStop(): Promise<void>
      daemonGetStatus(): Promise<import('@demo/core/daemon/client').DaemonStatus>
      daemonGetHealth(): Promise<import('@demo/core/daemon/client').DaemonHealth | null>
      daemonCheckClaude(): Promise<import('@demo/core/daemon/client').ClaudeStatus>
      daemonGetClaudeConfig(): Promise<import('@demo/core/daemon/client').ClaudeConfigInfo>
      daemonApplyZhipu(token: string): Promise<void>
      daemonRunTask(
        req: import('@demo/core/daemon/task').TaskRunRequest,
      ): Promise<{ task_id: string }>
      daemonCancelTask(taskId: string): Promise<void>
      daemonSubscribeEvents(taskId: string): Promise<void>
      daemonUnsubscribeEvents(taskId: string): Promise<void>
      onDaemonStatus(
        cb: (
          status: import('@demo/core/daemon/client').DaemonStatus,
        ) => void,
      ): () => void
      onDaemonTaskEvent(
        cb: (
          payload: {
            taskId: string
            event: import('@demo/core/daemon/task').TaskEvent
          },
        ) => void,
      ): () => void
    }
  }
}
