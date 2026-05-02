'use client'

import { Switch } from '@/app/components/switch'

/**
 * Single rendering path for switches in `app/components/warren/`. Defaults the
 * "on" track to the active color scheme's accent so a `gray-rose` user sees
 * rose toggles, a `stone-amber` user sees amber, etc. — instead of the fixed
 * dark/zinc Catalyst preset.
 *
 * Pass `color="dark/zinc"` to opt out (e.g. for a chrome-level toggle that
 * shouldn't compete visually with the active scheme).
 */
export function AppSwitch({
  checked,
  onChange,
  disabled,
  label,
  color = 'accent',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: string
  color?: 'accent' | 'dark/zinc'
}) {
  if (color === 'dark/zinc') {
    return (
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        color="dark/zinc"
        aria-label={label ?? 'Toggle'}
      />
    )
  }

  // Catalyst's Switch reads `--switch-bg`, `--switch-bg-ring`, `--switch-ring`,
  // `--switch-shadow`, and `--switch` from the `colors[color]` map. Override
  // those vars with the scheme's accent tokens so the on-track follows the
  // active scheme. We still pass `color="dark/zinc"` to keep Catalyst's base
  // utility classes attached; the arbitrary-property classes win on cascade.
  return (
    <Switch
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      color="dark/zinc"
      aria-label={label ?? 'Toggle'}
      className="[--switch-bg:var(--color-accent)] [--switch-bg-ring:var(--color-accent-strong)]/40 [--switch-ring:var(--color-accent-strong)]/40 [--switch-shadow:transparent] [--switch:white] dark:[--switch-bg:var(--color-accent)] dark:[--switch-bg-ring:transparent]"
    />
  )
}
