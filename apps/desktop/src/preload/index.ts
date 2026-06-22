import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  platform: 'desktop' as const,
  openExternal(url: string) {
    return ipcRenderer.invoke('platform:open-external', url)
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
