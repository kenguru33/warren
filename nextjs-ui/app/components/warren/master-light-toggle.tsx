'use client'

import type { MasterState } from '@/lib/shared/types'
import { Badge } from '@/app/components/badge'
import { Switch } from '@/app/components/switch'

export function MasterLightToggle({
  master,
  pending,
  error,
  partial,
  label,
  variant = 'compact',
  onToggle,
}: {
  master: MasterState
  pending?: boolean
  error?: string | null
  partial?: { ok: number; failed: number } | null
  label?: string
  variant?: 'compact' | 'wide'
  onToggle: (nextOn: boolean) => void
}) {
  const nextOn = master.state !== 'all-on'
  const isOn = master.state === 'all-on'
  const isMixed = master.state === 'mixed'
  const stateLabel = master.state === 'all-on' ? 'All on' : isMixed ? 'Mixed' : 'All off'

  // Catalyst Switch is binary (on/off). Mixed state is rendered as "checked" with
  // an adjacent <Badge color="amber">Mixed</Badge> indicator; the toggle's intent
  // is always to flip-to-all-on, matching the legacy behavior.
  const checked = master.state === 'all-on' || isMixed
  const ariaLabel = nextOn ? 'Turn all lights on' : 'Turn all lights off'

  if (variant === 'wide') {
    return (
      <div
        className={[
          'inline-flex w-full items-center gap-3 rounded-xl px-5 py-4 shadow-sm ring-1 transition',
          isOn
            ? 'bg-accent/10 ring-accent/30'
            : isMixed
              ? 'bg-warning/10 ring-warning/30'
              : 'bg-surface ring-default/70 dark:ring-white/10',
          pending ? 'opacity-70' : '',
        ].join(' ')}
      >
        <Switch
          color="dark/zinc"
          checked={checked}
          disabled={pending}
          onChange={() => onToggle(nextOn)}
          aria-label={ariaLabel}
        />
        <div className="flex min-w-0 flex-col leading-tight">
          {label && <span className="text-[0.7rem] font-semibold tracking-wide text-subtle uppercase">{label}</span>}
          <span className={`text-sm font-semibold ${isOn ? 'text-text' : 'text-muted'}`}>{stateLabel}</span>
          <span className="text-[0.7rem] text-subtle">
            {master.memberCount} {master.memberCount === 1 ? 'light' : 'lights'}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {isMixed && <Badge color="amber">Mixed</Badge>}
          {master.unreachableCount > 0 && (
            <Badge color="red" title={`${master.unreachableCount} unreachable`}>
              {master.unreachableCount} offline
            </Badge>
          )}
          {partial && (
            <Badge color="amber" title={`${partial.failed} failed`}>{partial.failed} failed</Badge>
          )}
          {error && <Badge color="red" title={error}>!</Badge>}
        </div>
      </div>
    )
  }

  return (
    <div className="inline-flex h-8 items-center gap-2">
      <Switch
        color="dark/zinc"
        checked={checked}
        disabled={pending}
        onChange={() => onToggle(nextOn)}
        aria-label={ariaLabel}
      />
      <span className="text-sm/5 font-medium text-muted">{stateLabel}</span>
      <span className="text-xs/5 tabular-nums text-subtle">· {master.memberCount}</span>
      {isMixed && <Badge color="amber">Mixed</Badge>}
      {master.unreachableCount > 0 && (
        <Badge color="red" title={`${master.unreachableCount} unreachable`}>
          {master.unreachableCount}
        </Badge>
      )}
      {partial && <Badge color="amber" title={`${partial.failed} failed`}>!</Badge>}
      {error && <Badge color="red" title={error}>!</Badge>}
    </div>
  )
}
