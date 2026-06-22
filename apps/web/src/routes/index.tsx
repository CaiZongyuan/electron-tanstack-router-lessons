import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@demo/ui/components/ui/button'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="min-h-full bg-background p-8 text-foreground">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-base font-medium">desktop-web-demo</h1>
          <p className="text-sm text-muted-foreground">
            阶段 2：下面的按钮来自共享包 <code>@demo/ui</code>。
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm text-muted-foreground">Button 变体</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>

          <h2 className="pt-2 text-sm text-muted-foreground">Button 尺寸</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
          </div>
        </section>

        <p className="text-xs text-muted-foreground">
          提示：编辑 packages/ui/components/ui/button.tsx 后，这里会即时热更新——
          这就是 workspace:* 符号链接的效果。
        </p>
      </div>
    </main>
  )
}
