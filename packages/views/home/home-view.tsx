import { usePlatformCapabilities } from '@demo/core/platform/context'
import { Button } from '@demo/ui/components/ui/button'

// 共享首页视图继续只组合共享包能力。
// 路由仍可直接使用 TanStack Router，平台差异则经由 @demo/core 注入。
export function HomeView() {
  const { openExternal } = usePlatformCapabilities()

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <header className="space-y-1">
        <h1 className="text-base font-medium">desktop-web-demo</h1>
        <p className="text-sm text-muted-foreground">
          阶段 5：本页继续来自共享包 <code>@demo/views</code>，但“打开外链”这类平台能力已经改为
          经由 <code>@demo/core</code> 注入，而不是直接调用浏览器或 Electron API。
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm text-muted-foreground">Button 变体（来自 @demo/ui）</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm text-muted-foreground">平台能力（来自 @demo/core）</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => openExternal('https://github.com/multica-ai/multica')}
          >
            打开 multica 仓库
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          web 端会走 <code>window.open</code>，desktop 端会经由 preload + IPC 调主进程的
          <code>shell.openExternal</code>。
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        提示：共享页面可以直接用 TanStack Router，但平台能力必须继续经由接口注入。
      </p>
    </div>
  )
}
