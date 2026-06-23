import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ClaudeStatus, DaemonHealth, DaemonStatus } from '@demo/core/daemon/client'
import type { TaskEvent, TaskRunRequest } from '@demo/core/daemon/task'

const api = {
  platform: 'desktop' as const,
  openExternal(url: string) {
    return ipcRenderer.invoke('platform:open-external', url)
  },
  // daemon：invoke 走请求-响应；on 走事件订阅。main 把它们转成对 daemon 的 HTTP。
  daemonStart(): Promise<void> {
    return ipcRenderer.invoke('daemon:start')
  },
  daemonStop(): Promise<void> {
    return ipcRenderer.invoke('daemon:stop')
  },
  daemonGetStatus(): Promise<DaemonStatus> {
    return ipcRenderer.invoke('daemon:get-status')
  },
  daemonGetHealth(): Promise<DaemonHealth | null> {
    return ipcRenderer.invoke('daemon:get-health')
  },
  daemonCheckClaude(): Promise<ClaudeStatus> {
    return ipcRenderer.invoke('daemon:check-claude')
  },
  daemonSaveApiKey(key: string): Promise<void> {
    return ipcRenderer.invoke('daemon:save-api-key', key)
  },
  daemonGetApiKey(): Promise<string | null> {
    return ipcRenderer.invoke('daemon:get-api-key')
  },
  daemonRunTask(req: TaskRunRequest): Promise<{ task_id: string }> {
    return ipcRenderer.invoke('daemon:run-task', req)
  },
  daemonCancelTask(taskId: string): Promise<void> {
    return ipcRenderer.invoke('daemon:cancel-task', taskId)
  },
  daemonSubscribeEvents(taskId: string): Promise<void> {
    return ipcRenderer.invoke('daemon:subscribe-events', taskId)
  },
  daemonUnsubscribeEvents(taskId: string): Promise<void> {
    return ipcRenderer.invoke('daemon:unsubscribe-events', taskId)
  },
  onDaemonStatus(cb: (status: DaemonStatus) => void): () => void {
    const handler = (_e: unknown, status: DaemonStatus) => cb(status)
    ipcRenderer.on('daemon:status', handler)
    return () => ipcRenderer.off('daemon:status', handler)
  },
  onDaemonTaskEvent(
    cb: (payload: { taskId: string; event: TaskEvent }) => void,
  ): () => void {
    const handler = (
      _e: unknown,
      payload: { taskId: string; event: TaskEvent },
    ) => cb(payload)
    ipcRenderer.on('daemon:task-event', handler)
    return () => ipcRenderer.off('daemon:task-event', handler)
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('desktopAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore 兼容关闭 contextIsolation 的场景；当前项目默认不会走到这里。
  window.electron = electronAPI
  // @ts-ignore 同上。
  window.desktopAPI = api
}
