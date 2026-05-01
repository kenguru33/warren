'use client'

import { Listbox, ListboxLabel, ListboxOption } from '@/app/components/listbox'
import { LIGHT_THEMES, type LightThemeKey } from '@/lib/shared/light-themes'

const themes = Object.values(LIGHT_THEMES)

export function LightThemePicker({
  value,
  onChange,
}: {
  value: LightThemeKey
  onChange: (key: LightThemeKey) => void
}) {
  const selectedTheme = LIGHT_THEMES[value]

  return (
    <Listbox value={value} onChange={onChange} aria-label={selectedTheme.label}>
      {themes.map(t => (
        <ListboxOption key={t.key} value={t.key}>
          <span
            className="size-4 shrink-0 rounded-full shadow-sm ring-1 ring-white/10"
            style={{ background: t.swatch }}
            aria-hidden
          />
          <ListboxLabel>{t.label}</ListboxLabel>
          <span className="ml-auto flex gap-1" aria-hidden>
            {t.bulbPalette.map(c => (
              <span key={c} className="size-2.5 rounded-full ring-1 ring-white/10" style={{ background: c }} />
            ))}
          </span>
        </ListboxOption>
      ))}
    </Listbox>
  )
}
