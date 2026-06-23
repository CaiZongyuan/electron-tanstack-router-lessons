import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DaemonManager } from './daemon-manager'
import { registerDaemonIpc } from './ipc/daemon'

// 单窗口：IPC 推送 daemon 状态与 task 事件都用它的 webContents。
let mainWindow: BrowserWindow | null = null
const daemonManager = new DaemonManager()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#101314',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.demo.desktop-web-demo')

  ipcMain.handle('platform:open-external', (_, url: string) => {
    return shell.openExternal(url)
  })

  // daemon：注册 IPC（renderer invoke → main 转成 daemon HTTP）+ 状态推送。
  registerDaemonIpc({ manager: daemonManager, getWindow: () => mainWindow })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // 自动拉起 daemon（先探 /health 复用已有实例，否则 spawn）。renderer 经 IPC 看 status。
  void daemonManager.start()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 退出前停 daemon，避免孤儿进程。preventDefault 一次，stop 完成后再 exit。
let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  quitting = true
  event.preventDefault()
  void daemonManager.stop().finally(() => {
    app.exit(0)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
