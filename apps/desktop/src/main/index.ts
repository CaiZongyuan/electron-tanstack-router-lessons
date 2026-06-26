import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DaemonManager } from './daemon-manager'
import { registerDaemonIpc } from './ipc/daemon'
// 主进程资源用 ?asset 触发 electron-vite 资源插件、emit 进产物（dev/prod 都可用）。
// 放 src/main/assets 而非 resources/：后者被 electron-vite 当主进程 publicDir，?asset 会解析回源文件、打包后失效。
import iconPath from './assets/icon.png?asset'

// splash 的开机音效需要「无手势有声自动播放」，须在 app ready 前设置。
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// 单窗口：IPC 推送 daemon 状态与 task 事件都用它的 webContents。
let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
// 主窗口 ready 与 splash（音效）结束都满足，才显示主窗口并销毁 splash。
let mainReady = false
let splashDone = false
const daemonManager = new DaemonManager()

// 幂等收尾：ready-to-show 与 splash:done（或安全兜底）都会调它。
function maybeReveal(): void {
  if (mainReady && splashDone && mainWindow) {
    mainWindow.show()
    splashWindow?.destroy()
    splashWindow = null
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    center: true,
    icon: iconPath,
    autoHideMenuBar: true,
    backgroundColor: '#101314',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 不直接 show：交给 maybeReveal，等 splash 收尾再显示，避免主窗口空帧抢在动画前。
  mainWindow.on('ready-to-show', () => {
    mainReady = true
    maybeReveal()
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

// 开机启动动画窗口：纯 canvas 静态页（splash.html/js/audio 都在渲染层 public）。
// 实色深底 + frameless（不用 transparent，Windows 上易黑闪/丢 alpha）；音画同步见 splash.js。
function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    backgroundColor: '#101314',
    center: true,
    show: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // dev 走 vite dev server、prod 走打包后的 file：与主窗口同一套 dev/prod 加载分支。
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void splashWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/splash.html`)
  } else {
    void splashWindow.loadFile(join(__dirname, '../renderer/splash.html'))
  }

  splashWindow.on('closed', () => {
    splashWindow = null
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.demo.desktop-web-demo')

  ipcMain.handle('platform:open-external', (_, url: string) => {
    return shell.openExternal(url)
  })
  // splash 音效播完的回调（renderer 经 preload 触发）。
  ipcMain.on('splash:done', () => {
    splashDone = true
    maybeReveal()
  })
  ipcMain.on('splash:skip', () => {
    splashDone = true
    maybeReveal()
  })

  // daemon：注册 IPC（renderer invoke → main 转成 daemon HTTP）+ 状态推送。
  registerDaemonIpc({ manager: daemonManager, getWindow: () => mainWindow })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 先出 splash 再建主窗口：splash 立即可见，主窗口在后台加载到 ready-to-show。
  createSplash()
  createWindow()

  // 自动拉起 daemon（先探 /health 复用已有实例，否则 spawn）。renderer 经 IPC 看 status。
  void daemonManager.start()

  // 安全兜底：音效加载失败 / ended 未触发时，22s（约 15s 音效 + 余量）后强制收尾。
  setTimeout(() => {
    if (!splashDone) {
      splashDone = true
      maybeReveal()
    }
  }, 22000)

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
