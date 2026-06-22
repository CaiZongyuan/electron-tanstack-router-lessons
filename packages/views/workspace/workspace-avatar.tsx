import { cn } from '@demo/ui/lib/utils'

const sizeMap = {
  sm: 'h-5 w-5 rounded text-xs',
  md: 'h-7 w-7 rounded-md text-xs',
  lg: 'h-9 w-9 rounded-md text-sm',
} as const

type WorkspaceAvatarProps = {
  name: string
  size?: keyof typeof sizeMap
  className?: string
}

export function WorkspaceAvatar({
  name,
  size = 'sm',
  className,
}: WorkspaceAvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-border bg-muted font-medium text-muted-foreground',
        sizeMap[size],
        className
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
