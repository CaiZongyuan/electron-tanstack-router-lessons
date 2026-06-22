import { Button } from '@demo/ui/components/ui/button'

// 共享首页视图：组合 @demo/ui 的原子组件。
// 本组件由 apps/web 的薄路由文件 routes/index.tsx 直接渲染；
// 阶段 4 之后 apps/desktop 的渲染层也会挂载同一个组件——这就是「页面两端共用」。
export function HomeView() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <header className="space-y-1">
        <h1 className="text-base font-medium">desktop-web-demo</h1>
        <p className="text-sm text-muted-foreground">
          阶段 3：本页与上方布局外壳都来自共享包 <code>@demo/views</code>。
          两端同构，路由层无需导航适配器。
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

      <p className="text-xs text-muted-foreground">
        提示：编辑 packages/views 或 packages/ui 任意源码，这里即时热更新——
        这就是 workspace:* 符号链接 + @source 扫描的效果。
      </p>
    </div>
  )
}
