export {}

declare global {
  interface Window {
    electron: typeof import('@electron-toolkit/preload').electronAPI
    desktopAPI: {
      platform: 'desktop'
      openExternal(url: string): Promise<void>
    }
  }
}
