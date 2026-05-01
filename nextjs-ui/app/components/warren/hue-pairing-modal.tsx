'use client'

import { useEffect, useRef, useState } from 'react'
import { AppDialog } from './app-dialog'

interface Candidate { id: string; ip: string; name: string | null; model: string | null }
type Step = 'discovering' | 'choose' | 'manual' | 'waiting' | 'success' | 'error'

export function HuePairingModal({
  open,
  onPaired,
  onCancel,
}: {
  open: boolean
  onPaired: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState<Step>('discovering')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [manualIp, setManualIp] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(30)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopCountdown() {
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current)
      countdownTimer.current = null
    }
  }

  function startCountdown() {
    setCountdown(30)
    stopCountdown()
    countdownTimer.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { stopCountdown(); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  async function discover() {
    setStep('discovering')
    setErrorMsg(null)
    try {
      const res = await fetch('/api/integrations/hue/discover', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('discovery failed')
      const list = await res.json() as Candidate[]
      setCandidates(list)
      setStep(list.length > 0 ? 'choose' : 'manual')
    } catch (err: unknown) {
      const e = err as { message?: string }
      setErrorMsg(e.message ?? 'discovery failed')
      setStep('manual')
    }
  }

  async function pair(ip: string) {
    if (!ip) return
    setErrorMsg(null)
    setStep('waiting')
    startCountdown()
    try {
      const res = await fetch('/api/integrations/hue/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ip }),
      })
      if (!res.ok) {
        let payload: { data?: { error?: string; message?: string }; message?: string } = {}
        try { payload = await res.json() } catch {}
        throw payload
      }
      stopCountdown()
      setStep('success')
      setTimeout(() => onPaired(), 600)
    } catch (err: unknown) {
      stopCountdown()
      const e = err as { data?: { error?: string; message?: string }; message?: string }
      const code = e.data?.error
      if (code === 'link_button_timeout') {
        setErrorMsg('We did not see the link button being pressed in time.')
      } else if (code === 'bridge_unreachable') {
        setErrorMsg('Could not reach the bridge at that address.')
      } else {
        setErrorMsg(e.data?.message ?? e.message ?? 'pairing failed')
      }
      setStep('error')
    }
  }

  useEffect(() => {
    if (open) discover()
    return () => stopCountdown()
  }, [open])

  return (
    <AppDialog
      open={open}
      onClose={() => { if (step !== 'waiting') onCancel() }}
      maxWidthClass="max-w-md"
    >
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-default">
        <h3 className="text-base/6 font-semibold text-text">Connect Hue Bridge</h3>
        {step !== 'waiting' && (
          <button type="button" className="btn-icon size-8" aria-label="Close" onClick={onCancel}>
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      <div className="px-6 py-6 min-h-[260px] flex">
        {step === 'discovering' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="size-10 border-[3px] border-default border-t-accent rounded-full animate-spin" />
            <p className="text-sm/6 text-muted">Looking for Hue bridges on your network…</p>
          </div>
        )}

        {step === 'choose' && (
          <div className="flex-1 flex flex-col gap-4">
            <p className="text-sm/6 text-muted">
              Found {candidates.length} bridge{candidates.length === 1 ? '' : 's'} on your network.
            </p>
            <ul role="list" className="space-y-2">
              {candidates.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pair(c.ip)}
                    className="w-full flex items-center justify-between gap-3 rounded-xl bg-surface-2/60 ring-1 ring-default px-4 py-3 cursor-pointer transition hover:bg-surface-2 hover:ring-accent dark:ring-white/5 dark:hover:ring-accent"
                  >
                    <span className="text-sm font-semibold text-text">{c.name || 'Hue Bridge'}</span>
                    <span className="text-xs text-subtle font-mono">{c.ip}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setStep('manual')}
              className="text-sm/6 font-medium text-accent-strong hover:underline self-start"
            >
              Enter IP manually instead
            </button>
          </div>
        )}

        {step === 'manual' && (
          <div className="flex-1 flex flex-col gap-4">
            <div>
              <label className="label">Bridge IP address</label>
              <input
                value={manualIp}
                onChange={e => setManualIp(e.target.value)}
                onKeyUp={e => { if (e.key === 'Enter') pair(manualIp.trim()) }}
                className="input mt-1.5 font-mono"
                placeholder="192.168.1.42"
              />
            </div>
            <div className="mt-auto flex gap-2 justify-end items-center">
              <button type="button" className="mr-auto text-sm/6 font-medium text-accent-strong hover:underline" onClick={discover}>
                Re-run discovery
              </button>
              <button type="button" className="btn-primary" disabled={!manualIp.trim()} onClick={() => pair(manualIp.trim())}>
                Pair
              </button>
            </div>
          </div>
        )}

        {step === 'waiting' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            <div className="text-5xl animate-warren-pulse">🔘</div>
            <h3 className="text-base/6 font-semibold text-text">Press the link button on your bridge</h3>
            <p className="text-sm/6 text-muted max-w-xs">The round button on top of the bridge. We&apos;re waiting for it…</p>
            <div className="text-2xl font-bold text-accent tabular-nums">{countdown}s</div>
          </div>
        )}

        {step === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="size-12 rounded-full bg-success/15 ring-1 ring-success/30 text-success text-2xl font-bold flex items-center justify-center">✓</div>
            <p className="text-sm/6 text-muted">Bridge paired successfully.</p>
          </div>
        )}

        {step === 'error' && (
          <div className="flex-1 flex flex-col items-center gap-4">
            <div className="size-12 rounded-full bg-error/15 ring-1 ring-error/30 text-error text-xl font-bold flex items-center justify-center mt-2">!</div>
            <p className="text-sm/6 text-error text-center">{errorMsg}</p>
            <div className="mt-auto flex gap-2 items-center w-full">
              <button type="button" className="mr-auto text-sm/6 font-medium text-muted hover:text-text" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={discover}>
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </AppDialog>
  )
}
