import { Outlet } from '@tanstack/react-router'

// 极简全屏外壳：深灰背景 + 顶部柔和彩色光晕（液态玻璃氛围）。
// 去掉了 multica 风格的 sidebar（见 docs/frontend/08）。
// 颜色用语义 token（--brand / --info）经 color-mix 降透明，不硬编码色值。
export function AppLayout() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(55% 45% at 12% -5%, color-mix(in oklab, var(--brand) 18%, transparent), transparent 60%)',
            'radial-gradient(50% 40% at 92% -5%, color-mix(in oklab, var(--info) 15%, transparent), transparent 55%)',
          ].join(', '),
        }}
      />
      <Outlet />
    </div>
  )
}
