'use client'

import { MoonIcon, SunIcon } from '@heroicons/react/20/solid'
import { useTheme } from '@/lib/hooks/use-theme'
import { Button } from '@/app/components/button'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const Icon = theme === 'dark' ? MoonIcon : SunIcon
  return (
    <Button
      plain
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <Icon data-slot="icon" />
    </Button>
  )
}
