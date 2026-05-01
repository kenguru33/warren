'use client'

import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'warren:theme'

function readStored(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>('dark')

  useEffect(() => {
    const stored = readStored()
    setThemeState(stored)
    if (stored === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [])

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode)
    if (mode === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    try { window.localStorage.setItem(STORAGE_KEY, mode) } catch {}
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark'
      if (next === 'dark') document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
      try { window.localStorage.setItem(STORAGE_KEY, next) } catch {}
      return next
    })
  }, [])

  return { theme, setTheme, toggleTheme }
}
