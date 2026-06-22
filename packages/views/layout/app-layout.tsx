import { Outlet } from '@tanstack/react-router'
import { DashboardLayout } from './dashboard-layout'

// 共享应用外壳对齐 multica 的基本分层：
// sidebar provider + app sidebar + inset 内容区。
export function AppLayout() {
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  )
}
