'use client'

import { useCallback, useEffect, useState } from 'react'

export type ColorSchemeKey =
  | 'zinc-indigo'
  | 'slate-sky'
  | 'stone-amber'
  | 'neutral-emerald'
  | 'gray-rose'
  | 'zinc-violet'

export const COLOR_SCHEME_KEYS: readonly ColorSchemeKey[] = [
  'zinc-indigo',
  'slate-sky',
  'stone-amber',
  'neutral-emerald',
  'gray-rose',
  'zinc-violet',
] as const

const STORAGE_KEY = 'warren:scheme'
const DEFAULT_SCHEME: ColorSchemeKey = 'zinc-indigo'

function isValidScheme(v: unknown): v is ColorSchemeKey {
  return typeof v === 'string' && (COLOR_SCHEME_KEYS as readonly string[]).includes(v)
}

function readStored(): ColorSchemeKey {
  if (typeof window === 'undefined') return DEFAULT_SCHEME
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return isValidScheme(v) ? v : DEFAULT_SCHEME
  } catch {
    return DEFAULT_SCHEME
  }
}

export function useColorScheme() {
  const [colorScheme, setColorSchemeState] = useState<ColorSchemeKey>(DEFAULT_SCHEME)

  useEffect(() => {
    const stored = readStored()
    setColorSchemeState(stored)
    document.documentElement.dataset.scheme = stored
  }, [])

  const setColorScheme = useCallback((key: ColorSchemeKey) => {
    if (!isValidScheme(key)) return
    setColorSchemeState(key)
    document.documentElement.dataset.scheme = key
    try { window.localStorage.setItem(STORAGE_KEY, key) } catch {}
  }, [])

  const cycleColorScheme = useCallback(() => {
    setColorSchemeState(prev => {
      const idx = COLOR_SCHEME_KEYS.indexOf(prev)
      const next = COLOR_SCHEME_KEYS[(idx + 1) % COLOR_SCHEME_KEYS.length]!
      document.documentElement.dataset.scheme = next
      try { window.localStorage.setItem(STORAGE_KEY, next) } catch {}
      return next
    })
  }, [])

  return { colorScheme, setColorScheme, cycleColorScheme }
}
