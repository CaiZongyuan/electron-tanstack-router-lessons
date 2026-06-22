import type { PropsWithChildren } from 'react'
import { SidebarTrigger, useSidebarSafe } from '@demo/ui/components/ui/sidebar'
import { cn } from '@demo/ui/lib/utils'

function MobileSidebarTrigger() {
  const sidebar = useSidebarSafe()

  if (!sidebar?.isMobile) {
    return null
  }

  return <SidebarTrigger className="mr-2" />
}

export function PageHeader({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn('flex h-12 shrink-0 items-center border-b border-border px-4', className)}>
      <MobileSidebarTrigger />
      {children}
    </div>
  )
}
