'use client'

import type { MasterState } from '@/lib/shared/types'

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
  const isOn = master.state === 'all-on' || master.state === 'mixed'
  const isMixed = master.state === 'mixed'
  const stateLabel = master.state === 'all-on' ? 'All on' : isMixed ? 'Mixed' : 'All off'

  function onClick() {
    if (pending) return
    onToggle(nextOn)
  }

  const toggleClasses = [
    'group relative isolate inline-flex h-5 w-8 shrink-0 cursor-pointer rounded-full p-[3px] align-middle',
    'ring-1 ring-inset transition-colors duration-200 ease-in-out',
    'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    isMixed
      ? 'bg-warning ring-warning'
      : isOn
        ? 'bg-accent ring-accent-strong/40 dark:bg-accent dark:ring-transparent'
        : 'bg-strong/40 ring-default dark:bg-white/5 dark:ring-white/15',
    pending ? 'cursor-not-allowed opacity-70' : '',
  ].join(' ')

  const knobClasses = [
    'pointer-events-none relative inline-block size-3.5 rounded-full bg-white shadow-sm',
    'ring-1 ring-black/5 transition-transform duration-200 ease-in-out',
    isMixed ? 'translate-x-1.5' : isOn ? 'translate-x-3' : 'translate-x-0',
  ].join(' ')

  if (variant === 'wide') {
    return (
      <div
        className={[
          'inline-flex w-full items-center gap-3 rounded-xl px-5 py-4 ring-1 transition shadow-sm',
          isOn && !isMixed
            ? 'bg-accent/10 ring-accent/30'
            : isMixed
              ? 'bg-warning/10 ring-warning/30'
              : 'bg-surface ring-default/70 dark:ring-white/10',
          pending ? 'opacity-70' : '',
        ].join(' ')}
      >
        <button
          type="button"
          disabled={pending}
          title={nextOn ? 'Turn all on' : 'Turn all off'}
          onClick={onClick}
          className={toggleClasses}
        >
          <span aria-hidden className={knobClasses} />
        </button>
        <div className="flex flex-col leading-tight min-w-0">
          {label && <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-subtle">{label}</span>}
          <span className={`text-sm font-semibold ${isOn ? 'text-text' : 'text-muted'}`}>{stateLabel}</span>
          <span className="text-[0.7rem] text-subtle">
            {master.memberCount} {master.memberCount === 1 ? 'light' : 'lights'}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {master.unreachableCount > 0 && (
            <span className="badge badge-error" title={`${master.unreachableCount} unreachable`}>
              {master.unreachableCount} offline
            </span>
          )}
          {partial && (
            <span className="badge badge-warning" title={`${partial.failed} failed`}>{partial.failed} failed</span>
          )}
          {error && <span className="badge badge-error" title={error}>!</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="inline-flex h-8 items-center gap-2">
      <button
        type="button"
        disabled={pending}
        title={`${stateLabel} — ${nextOn ? 'turn all on' : 'turn all off'}`}
        aria-label={nextOn ? 'Turn all lights on' : 'Turn all lights off'}
        onClick={onClick}
        className={toggleClasses}
      >
        <span aria-hidden className={knobClasses} />
      </button>
      <span className="text-sm/5 font-medium text-muted">{stateLabel}</span>
      <span className="text-xs/5 text-subtle tabular-nums">· {master.memberCount}</span>
      {master.unreachableCount > 0 && (
        <span className="badge badge-error" title={`${master.unreachableCount} unreachable`}>
          {master.unreachableCount}
        </span>
      )}
      {partial && <span className="badge badge-warning" title={`${partial.failed} failed`}>!</span>}
      {error && <span className="badge badge-error" title={error}>!</span>}
    </div>
  )
}
