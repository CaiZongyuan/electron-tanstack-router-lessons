import { cloneElement, createContext, useContext, useMemo, useState } from 'react'
import type { ComponentProps, PropsWithChildren, ReactElement, ReactNode } from 'react'
import { PanelLeft } from 'lucide-react'
import { Button } from '@demo/ui/components/ui/button'
import { useIsMobile } from '@demo/ui/hooks/use-mobile'
import { cn } from '@demo/ui/lib/utils'

type SidebarContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const context = useContext(SidebarContext)

  if (!context) {
    throw new Error('useSidebar 必须在 SidebarProvider 内使用。')
  }

  return context
}

function useSidebarSafe() {
  return useContext(SidebarContext)
}

function SidebarProvider({
  defaultOpen = true,
  children,
  className,
}: PropsWithChildren<{ defaultOpen?: boolean; className?: string }>) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(defaultOpen)

  const value = useMemo(
    () => ({
      open,
      setOpen,
      isMobile,
      toggleSidebar: () => setOpen((value) => !value),
    }),
    [isMobile, open]
  )

  return (
    <SidebarContext.Provider value={value}>
      <div
        data-slot="sidebar-wrapper"
        className={cn('flex min-h-screen w-full bg-sidebar', className)}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  const { open, isMobile } = useSidebar()

  return (
    <aside
      data-slot="sidebar"
      data-state={open ? 'expanded' : 'collapsed'}
      className={cn(
        'border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ease-out',
        isMobile
          ? cn(
              'fixed inset-y-0 left-0 z-30 w-64 shadow-none',
              open ? 'translate-x-0' : '-translate-x-full'
            )
          : cn('hidden md:flex md:flex-col', open ? 'md:w-64' : 'md:w-18'),
        className
      )}
    >
      {children}
    </aside>
  )
}

function SidebarInset({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn('relative flex min-h-screen min-w-0 flex-1 flex-col bg-background', className)}
    >
      {children}
    </main>
  )
}

function SidebarHeader({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn('flex flex-col gap-2 border-b border-sidebar-border p-2', className)}
      {...props}
    />
  )
}

function SidebarContent({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto p-2', className)}
      {...props}
    />
  )
}

function SidebarFooter({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn('border-t border-sidebar-border p-2', className)}
      {...props}
    />
  )
}

function SidebarGroup({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn('flex flex-col gap-1 py-1', className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn('px-2 py-1 text-xs font-medium text-sidebar-foreground/70', className)}
      {...props}
    />
  )
}

function SidebarGroupContent({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-content"
      className={cn('flex flex-col gap-0.5', className)}
      {...props}
    />
  )
}

function SidebarMenu({
  className,
  ...props
}: ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn('flex flex-col gap-0.5', className)}
      {...props}
    />
  )
}

function SidebarMenuItem({
  className,
  ...props
}: ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn('list-none', className)}
      {...props}
    />
  )
}

type SidebarButtonRenderElement = ReactElement<{
  className?: string
  children?: ReactNode
  'data-slot'?: string
  'data-active'?: string
}>

function SidebarMenuButton({
  className,
  isActive = false,
  children,
  badge,
  render,
  ...props
}: ComponentProps<'button'> & {
  isActive?: boolean
  badge?: ReactNode
  render?: SidebarButtonRenderElement
}) {
  const sidebar = useSidebarSafe()
  const collapsed = sidebar ? !sidebar.open && !sidebar.isMobile : false
  const buttonClassName = cn(
    'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium',
    collapsed && 'justify-center px-0',
    className
  )
  const content = (
    <>
      {children}
      {!collapsed && badge ? (
        <span className="ml-auto text-xs text-sidebar-foreground/60">{badge}</span>
      ) : null}
    </>
  )

  if (render) {
    return cloneElement(render, {
      'data-slot': 'sidebar-menu-button',
      'data-active': isActive ? 'true' : 'false',
      className: cn(buttonClassName, render.props.className),
      children: content,
    })
  }

  return (
    <button
      data-slot="sidebar-menu-button"
      data-active={isActive ? 'true' : 'false'}
      className={buttonClassName}
      {...props}
    >
      {content}
    </button>
  )
}

function SidebarTrigger({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={toggleSidebar}
      {...props}
    >
      <PanelLeft />
    </Button>
  )
}

function SidebarRail({ className }: { className?: string }) {
  return (
    <div
      data-slot="sidebar-rail"
      className={cn('hidden w-px bg-sidebar-border md:block', className)}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
  useSidebarSafe,
}
