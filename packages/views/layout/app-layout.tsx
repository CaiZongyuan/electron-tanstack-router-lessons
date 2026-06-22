import { Link, Outlet } from '@tanstack/react-router'

// 应用布局外壳，web 与 desktop 渲染层共用。
// 关键点（见 CLAUDE.md 第 8 节）：两端都用 TanStack Router，
// 所以这里直接用 <Link>/<Outlet>，不需要 multica 那种 NavigationAdapter。
// 平台专属外壳（Electron 窗口控件、浏览器专属工具栏等）不放在这里，留到 app 层。
export function AppLayout() {
  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="flex h-12 items-center gap-4 border-b border-border px-4">
        <Link
          to="/"
          className="text-sm font-medium text-foreground"
          aria-label="desktop-web-demo 首页"
        >
          desktop-web-demo
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            to="/"
            className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: 'bg-muted text-foreground' }}
          >
            首页
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
