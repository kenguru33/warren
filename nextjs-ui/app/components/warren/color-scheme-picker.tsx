'use client'

import { COLOR_SCHEME_KEYS, useColorScheme, type ColorSchemeKey } from '@/lib/hooks/use-color-scheme'

const LABELS: Record<ColorSchemeKey, string> = {
  'zinc-indigo': 'Zinc + Indigo',
  'slate-sky': 'Slate + Sky',
  'stone-amber': 'Stone + Amber',
  'neutral-emerald': 'Neutral + Emerald',
  'gray-rose': 'Gray + Rose',
  'zinc-violet': 'Zinc + Violet',
}

const SWATCH_BG: Record<ColorSchemeKey, string> = {
  'zinc-indigo': 'bg-indigo-500',
  'slate-sky': 'bg-sky-500',
  'stone-amber': 'bg-amber-500',
  'neutral-emerald': 'bg-emerald-500',
  'gray-rose': 'bg-rose-500',
  'zinc-violet': 'bg-violet-500',
}

export function ColorSchemePicker() {
  const { colorScheme, setColorScheme } = useColorScheme()
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {COLOR_SCHEME_KEYS.map(key => {
        const active = key === colorScheme
        return (
          <button
            key={key}
            type="button"
            onClick={() => setColorScheme(key)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs ring-1 ring-inset transition-colors ${
              active
                ? 'bg-accent-soft text-accent-strong ring-accent/30'
                : 'bg-surface text-muted ring-default hover:bg-default'
            }`}
            title={LABELS[key]}
            aria-pressed={active}
          >
            <span className={`inline-block size-3 rounded-full ${SWATCH_BG[key]}`} aria-hidden />
            <span className="truncate">{LABELS[key].split(' + ')[1]}</span>
          </button>
        )
      })}
    </div>
  )
}
