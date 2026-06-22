import type { PropsWithChildren } from 'react'
import { SidebarInset, SidebarProvider } from '@demo/ui/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'

export function DashboardLayout({ children }: PropsWithChildren) {
  return (
    <SidebarProvider className="min-h-screen">
      <AppSidebar />
      <SidebarInset className="overflow-hidden">{children}</SidebarInset>
    </SidebarProvider>
  )
}
