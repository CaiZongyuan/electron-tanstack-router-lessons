import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@demo/ui/components/ui/button'

type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const nextTheme = theme === 'light' ? 'dark' : 'light'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
      className="text-sidebar-foreground hover:bg-sidebar-accent"
      onClick={() => setTheme(nextTheme)}
    >
      {theme === 'light' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
