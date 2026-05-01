'use client'

import { useEffect, useRef, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/app/components/dialog'
import { Field, Label } from '@/app/components/fieldset'
import { Input } from '@/app/components/input'

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

  // Catalyst Dialog closes on backdrop click; gate it while pairing is in flight
  // so an accidental click can't drop the open request.
  const handleClose = step === 'waiting' ? () => {} : onCancel

  return (
    <Dialog open={open} onClose={handleClose} size="md">
      <div className="flex items-center justify-between">
        <DialogTitle>Connect Hue Bridge</DialogTitle>
        {step !== 'waiting' && (
          <Button plain aria-label="Close" onClick={onCancel}>
            <XMarkIcon data-slot="icon" />
          </Button>
        )}
      </div>

      <DialogBody className="flex min-h-[260px]">
        {step === 'discovering' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="size-10 animate-spin rounded-full border-[3px] border-default border-t-accent" />
            <p className="text-sm/6 text-muted">Looking for Hue bridges on your network…</p>
          </div>
        )}

        {step === 'choose' && (
          <div className="flex flex-1 flex-col gap-4">
            <p className="text-sm/6 text-muted">
              Found {candidates.length} bridge{candidates.length === 1 ? '' : 's'} on your network.
            </p>
            <ul role="list" className="space-y-2">
              {candidates.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pair(c.ip)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl bg-surface-2/60 px-4 py-3 ring-1 ring-default transition hover:bg-surface-2 hover:ring-accent dark:ring-white/5 dark:hover:ring-accent"
                  >
                    <span className="text-sm font-semibold text-text">{c.name || 'Hue Bridge'}</span>
                    <span className="font-mono text-xs text-subtle">{c.ip}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setStep('manual')}
              className="self-start text-sm/6 font-medium text-accent-strong hover:underline"
            >
              Enter IP manually instead
            </button>
          </div>
        )}

        {step === 'manual' && (
          <div className="flex flex-1 flex-col gap-4">
            <Field>
              <Label>Bridge IP address</Label>
              <Input
                value={manualIp}
                onChange={e => setManualIp(e.target.value)}
                onKeyUp={e => { if (e.key === 'Enter') pair(manualIp.trim()) }}
                className="font-mono"
                placeholder="192.168.1.42"
              />
            </Field>
          </div>
        )}

        {step === 'waiting' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="animate-warren-pulse text-5xl">🔘</div>
            <h3 className="text-base/6 font-semibold text-text">Press the link button on your bridge</h3>
            <p className="max-w-xs text-sm/6 text-muted">The round button on top of the bridge. We&apos;re waiting for it…</p>
            <div className="text-2xl font-bold tabular-nums text-accent">{countdown}s</div>
          </div>
        )}

        {step === 'success' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-success/15 text-2xl font-bold text-success ring-1 ring-success/30">✓</div>
            <p className="text-sm/6 text-muted">Bridge paired successfully.</p>
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-1 flex-col items-center gap-4">
            <div className="mt-2 flex size-12 items-center justify-center rounded-full bg-error/15 text-xl font-bold text-error ring-1 ring-error/30">!</div>
            <p className="text-center text-sm/6 text-error">{errorMsg}</p>
          </div>
        )}
      </DialogBody>

      {step === 'manual' && (
        <DialogActions>
          <button type="button" className="mr-auto text-sm/6 font-medium text-accent-strong hover:underline" onClick={discover}>
            Re-run discovery
          </button>
          <Button plain type="button" onClick={onCancel}>Cancel</Button>
          <Button disabled={!manualIp.trim()} onClick={() => pair(manualIp.trim())}>Pair</Button>
        </DialogActions>
      )}

      {step === 'error' && (
        <DialogActions>
          <Button plain type="button" onClick={onCancel}>Cancel</Button>
          <Button onClick={discover}>Try again</Button>
        </DialogActions>
      )}
    </Dialog>
  )
}
