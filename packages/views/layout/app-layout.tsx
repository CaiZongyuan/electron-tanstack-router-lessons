import { Outlet } from '@tanstack/react-router'
import { DashboardLayout } from './dashboard-layout'

export function AppLayout() {
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  )
}
