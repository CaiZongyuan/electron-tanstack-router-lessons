import { Bot, FolderKanban, Inbox, ListTodo, Monitor, Settings, Sparkles } from 'lucide-react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Button } from '@demo/ui/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebarSafe,
} from '@demo/ui/components/ui/sidebar'
import { WorkspaceAvatar } from '../workspace/workspace-avatar'

type NavItem = {
  label: string
  to: '/' | '/daemon'
  icon: typeof Inbox
  badge?: string
}

const personalNav: NavItem[] = [
  { label: '收件箱', to: '/', icon: Inbox, badge: '3' },
  { label: '我的事项', to: '/', icon: ListTodo },
]

const workspaceNav: NavItem[] = [
  { label: '事项', to: '/', icon: ListTodo },
  { label: '项目', to: '/', icon: FolderKanban },
  { label: '智能体', to: '/', icon: Bot },
]

const configureNav: NavItem[] = [
  { label: '运行时', to: '/daemon', icon: Monitor },
  { label: '设置', to: '/', icon: Settings },
]

function SidebarNavItem({ item }: { item: NavItem }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const sidebar = useSidebarSafe()
  const collapsed = sidebar ? !sidebar.open && !sidebar.isMobile : false

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={pathname === item.to}
        badge={item.badge}
        render={
          <Link
            to={item.to}
            className={collapsed ? 'justify-center' : undefined}
          />
        }
      >
        <item.icon className="size-4 shrink-0" />
        {!collapsed ? <span>{item.label}</span> : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const sidebar = useSidebarSafe()
  const collapsed = sidebar ? !sidebar.open && !sidebar.isMobile : false

  return (
    <>
      <Sidebar>
        <SidebarHeader className="gap-3">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <WorkspaceAvatar name="Multica Lab" size="md" />
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sidebar-foreground">Multica Lab</p>
                <p className="truncate text-xs text-sidebar-foreground/60">学习工作区</p>
              </div>
            ) : null}
          </div>

          {!collapsed ? (
            <Button variant="outline" size="sm" className="justify-start border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <Sparkles className="size-3.5" />
              新建事项
              <span className="ml-auto text-xs text-sidebar-foreground/60">C</span>
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" className="self-center text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <Sparkles className="size-3.5" />
            </Button>
          )}
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            {!collapsed ? <SidebarGroupLabel>个人</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {personalNav.map((item) => (
                  <SidebarNavItem key={item.label} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            {!collapsed ? <SidebarGroupLabel>工作区</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {workspaceNav.map((item) => (
                  <SidebarNavItem key={item.label} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            {!collapsed ? <SidebarGroupLabel>配置</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {configureNav.map((item) => (
                  <SidebarNavItem key={item.label} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground/70">
            <WorkspaceAvatar name="CZ" size="sm" />
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">Cai Zongyuan</p>
                <p className="truncate text-xs text-sidebar-foreground/60">本地学习模式</p>
              </div>
            ) : null}
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarRail />
    </>
  )
}
