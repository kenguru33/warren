'use client'

import type { ChangeEvent } from 'react'

// Intentional escape hatches: these hexes are RGB values written to Hue
// hardware, not chrome. They must NOT be replaced with semantic tokens.
const PRESETS: { name: string; hex: string }[] = [
  { name: 'Warm white', hex: '#fff6dd' },
  { name: 'Cool white', hex: '#e0eaff' },
  { name: 'Amber',      hex: '#ffaa33' },
  { name: 'Red',        hex: '#ff2d2d' },
  { name: 'Orange',     hex: '#ff7a00' },
  { name: 'Yellow',     hex: '#ffd400' },
  { name: 'Green',      hex: '#3fcf3f' },
  { name: 'Teal',       hex: '#00d1b2' },
  { name: 'Blue',       hex: '#1e90ff' },
  { name: 'Indigo',     hex: '#6366f1' },
  { name: 'Purple',     hex: '#a855f7' },
  { name: 'Pink',       hex: '#ec4899' },
]

export function LightColorPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (hex: string) => void
}) {
  function onCustomInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.value) onChange(e.target.value)
  }

  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-7">
      {PRESETS.map(c => (
        <button
          key={c.hex}
          type="button"
          onClick={() => onChange(c.hex)}
          title={c.name}
          aria-label={c.name}
          style={{ background: c.hex }}
          className={[
            'size-9 rounded-full ring-1 transition hover:scale-110 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            value?.toLowerCase() === c.hex.toLowerCase()
              ? 'ring-2 ring-accent ring-offset-2 ring-offset-modal'
              : 'ring-default dark:ring-white/15',
          ].join(' ')}
        />
      ))}
      <label className="relative size-9 rounded-full overflow-hidden ring-1 ring-default cursor-pointer dark:ring-white/15" title="Custom color">
        <input
          type="color"
          value={value ?? '#ffffff'}
          onChange={onCustomInput}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        {/* Intentional rainbow — visually says "any color". Not a token. */}
        <span className="absolute inset-0 bg-[conic-gradient(from_0deg,_#ef4444,_#f59e0b,_#eab308,_#22c55e,_#06b6d4,_#3b82f6,_#a855f7,_#ec4899,_#ef4444)]" />
      </label>
    </div>
  )
}
