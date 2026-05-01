'use client'

import { Switch } from '@/app/components/switch'

export function AppSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: string
}) {
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
