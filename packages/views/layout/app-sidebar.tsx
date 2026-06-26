import {
  Bell,
  Bot,
  FileText,
  GalleryHorizontalEnd,
  Grid2X2,
  MessageSquarePlus,
  Search,
  Wrench,
} from 'lucide-react'
import { Link, useRouterState } from '@tanstack/react-router'
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
import { Button } from '@demo/ui/components/ui/button'
import { Input } from '@demo/ui/components/ui/input'
import { WorkspaceAvatar } from '../workspace/workspace-avatar'
import { ThemeToggle } from '../theme/theme-toggle'

type NavItem = {
  label: string
  to: '/' | '/daemon'
  icon: typeof Bot
}

type PlainItem = {
  label: string
  icon: typeof Bot
}

const primaryNav: NavItem[] = [
  { label: '新建对话', to: '/daemon', icon: MessageSquarePlus },
  { label: '技能广场', to: '/', icon: Wrench },
]

const knowledgeNav: PlainItem[] = [
  { label: '应用', icon: Grid2X2 },
  { label: '文档', icon: FileText },
  { label: '图库', icon: GalleryHorizontalEnd },
]

const conversationHistory = [
  '我目前电脑有哪些 apps',
  '整理本周待办',
  '分析论文要点',
  '生成报销表格',
] as const

function SidebarNavItem({ item }: { item: NavItem }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const sidebar = useSidebarSafe()
  const collapsed = sidebar ? !sidebar.open && !sidebar.isMobile : false

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={pathname === item.to}
        render={<Link to={item.to} className={collapsed ? 'justify-center' : undefined} />}
      >
        <item.icon className="size-4 shrink-0" />
        {!collapsed ? <span>{item.label}</span> : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function SidebarPlainItem({ item }: { item: PlainItem }) {
  const sidebar = useSidebarSafe()
  const collapsed = sidebar ? !sidebar.open && !sidebar.isMobile : false

  return (
    <SidebarMenuItem>
      <SidebarMenuButton>
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
        <SidebarHeader>
          <Link to="/" className="flex h-14 items-center rounded-lg px-1">
            {!collapsed ? (
              <span className="text-base font-medium text-sidebar-foreground">local-agent-team</span>
            ) : (
              <WorkspaceAvatar name="LAT" size="md" />
            )}
          </Link>

          {!collapsed ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                aria-label="搜索"
                placeholder="搜索"
                className="h-10 rounded-lg bg-background pl-9 text-sm"
              />
            </div>
          ) : null}
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {primaryNav.map((item) => (
                  <SidebarNavItem key={item.label} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            {!collapsed ? <SidebarGroupLabel>本地知识库</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {knowledgeNav.map((item) => (
                  <SidebarPlainItem key={item.label} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="mt-4">
            {!collapsed ? <SidebarGroupLabel>对话历史</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              {!collapsed ? (
                <div className="flex flex-col gap-1">
                  {conversationHistory.map((title) => (
                    <Link
                      key={title}
                      to="/daemon"
                      className="block truncate rounded-lg px-2 py-2 text-sm text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      {title}
                    </Link>
                  ))}
                </div>
              ) : null}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="flex items-center gap-2 rounded-lg text-sidebar-foreground">
            <WorkspaceAvatar name="LAT" size="md" className="rounded-full" />
            {!collapsed ? (
              <>
                <span className="min-w-0 flex-1 truncate text-sm">Local User</span>
                <ThemeToggle />
                <Button
                  aria-label="通知"
                  variant="ghost"
                  size="icon-sm"
                  className="text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <Bell className="size-4" />
                </Button>
              </>
            ) : null}
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarRail />
    </>
  )
}
