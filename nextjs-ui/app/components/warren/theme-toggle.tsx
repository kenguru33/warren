'use client'

import { MoonIcon, SunIcon } from '@heroicons/react/20/solid'
import { useTheme } from '@/lib/hooks/use-theme'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const Icon = theme === 'dark' ? MoonIcon : SunIcon
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="btn-icon"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <Icon className="size-5" />
    </button>
  )
}
