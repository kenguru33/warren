'use client'

import { Listbox, ListboxLabel, ListboxOption } from '@/app/components/listbox'
import {
  LIGHT_THEMES,
  WHITE_PRESET_KEYS,
  kelvinFromMirek,
  type LightTheme,
  type LightThemeKey,
} from '@/lib/shared/light-themes'

const colorKeys = (Object.keys(LIGHT_THEMES) as LightThemeKey[]).filter(
  k => !WHITE_PRESET_KEYS.includes(k),
)

function ThemeOption({ theme }: { theme: LightTheme }) {
  const white = theme.bulbOutput?.kind === 'white' ? theme.bulbOutput : null
  return (
    <ListboxOption value={theme.key}>
      <span
        className="size-4 shrink-0 rounded-full shadow-sm ring-1 ring-white/10"
        style={{ background: theme.swatch }}
        aria-hidden
      />
      <ListboxLabel>{theme.label}</ListboxLabel>
      {white ? (
        <span className="ml-auto text-[0.7rem] text-zinc-500 group-data-focus/option:text-white dark:text-zinc-400 tabular-nums">
          {kelvinFromMirek(white.mirek)}K · {white.brightness}%
        </span>
      ) : (
        <span className="ml-auto flex gap-1" aria-hidden>
          {theme.bulbPalette.map(c => (
            <span key={c} className="size-2.5 rounded-full ring-1 ring-white/10" style={{ background: c }} />
          ))}
        </span>
      )}
    </ListboxOption>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="presentation"
      className="px-2 pt-2 pb-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-zinc-500 select-none dark:text-zinc-400"
    >
      {children}
    </div>
  )
}

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
      <SectionHeading>Whites</SectionHeading>
      {WHITE_PRESET_KEYS.map(k => <ThemeOption key={k} theme={LIGHT_THEMES[k]} />)}
      <SectionHeading>Colors</SectionHeading>
      {colorKeys.map(k => <ThemeOption key={k} theme={LIGHT_THEMES[k]} />)}
    </Listbox>
  )
}
