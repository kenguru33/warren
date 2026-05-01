'use client'

import useSWR from 'swr'
import type { SensorView } from '@/lib/shared/types'
import { AppDialog } from './app-dialog'

interface Reading { time: number; value: number }

const W = 560, H = 200
const PL = 44, PR = 12, PT = 14, PB = 30
const plotW = W - PL - PR
const plotH = H - PT - PB

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json())

const ICONS: Record<string, string> = { temperature: '🌡️', humidity: '💧', motion: '🏃', camera: '📷' }
const LABELS: Record<string, string> = { temperature: 'Temperature', humidity: 'Humidity', motion: 'Motion', camera: 'Camera' }

export function SensorHistoryModal({
  open,
  sensor,
  roomName,
  onClose,
}: {
  open: boolean
  sensor: SensorView | null
  roomName: string
  onClose: () => void
}) {
  const { data, isLoading } = useSWR<{ readings: Reading[] }>(
    open && sensor ? `/api/sensors/${sensor.id}/history` : null,
    fetcher,
  )
  const readings = data?.readings ?? []

  if (!sensor) return null

  const now = Date.now()
  const startTime = now - 24 * 60 * 60 * 1000
  const xPos = (time: number) => PL + ((time - startTime) / (24 * 60 * 60 * 1000)) * plotW

  const unit = sensor.type === 'temperature' ? '°C' : sensor.type === 'humidity' ? '%' : ''
  const lineColor = sensor.type === 'temperature' ? '#ff9f5a' : sensor.type === 'humidity' ? '#4a9eff' : '#a78bfa'
  const title = `${ICONS[sensor.type] ?? '📡'} ${sensor.label ?? LABELS[sensor.type] ?? sensor.type}`

  const xLabels: { label: string; x: number }[] = []
  for (let h = 0; h <= 24; h += 6) {
    const t = startTime + h * 60 * 60 * 1000
    const d = new Date(t)
    const hh = String(d.getHours()).padStart(2, '0')
    xLabels.push({ label: `${hh}:00`, x: xPos(t) })
  }

  const motionEvents = sensor.type === 'motion'
    ? readings.filter(p => p.value === 1).map(p => xPos(p.time))
    : []

  let chart: { linePath: string; areaPath: string; yLabels: { label: string; y: number }[] } | null = null
  if (readings.length > 0 && sensor.type !== 'motion') {
    const values = readings.map(p => p.value)
    let minVal = Math.min(...values)
    let maxVal = Math.max(...values)
    const pad = Math.max((maxVal - minVal) * 0.12, 0.5)
    minVal -= pad
    maxVal += pad
    const range = maxVal - minVal
    const yPos = (value: number) => PT + plotH - ((value - minVal) / range) * plotH

    const points = readings.map(p => ({ x: xPos(p.time), y: yPos(p.value) }))
    const bottom = PT + plotH
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const last = points[points.length - 1]!
    const first = points[0]!
    const areaPath = `${linePath} L${last.x.toFixed(1)},${bottom} L${first.x.toFixed(1)},${bottom} Z`

    const yLabels: { label: string; y: number }[] = []
    for (let i = 0; i <= 4; i++) {
      const val = minVal + range * (i / 4)
      const y = PT + plotH - (plotH * i / 4)
      yLabels.push({ label: val.toFixed(1), y })
    }
    chart = { linePath, areaPath, yLabels }
  }

  const min = readings.length ? Math.min(...readings.map(r => r.value)) : null
  const max = readings.length ? Math.max(...readings.map(r => r.value)) : null
  const latest = readings.length ? readings[readings.length - 1]!.value : null

  return (
    <AppDialog open={open} onClose={onClose} maxWidthClass="max-w-3xl">
      <div className="px-6 pt-5 pb-4 border-b border-default flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base/6 font-semibold text-text truncate">{title}</h3>
          <p className="text-xs text-subtle mt-0.5">{roomName} · last 24 hours</p>
        </div>
        <button type="button" className="btn-icon size-8" aria-label="Close" onClick={onClose}>
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="px-6 py-5 space-y-5">
        <div className="rounded-xl bg-surface-2/60 ring-1 ring-default p-4 min-h-[180px] flex items-center justify-center">
          {isLoading ? (
            <div className="text-sm text-subtle">Loading…</div>
          ) : !readings.length && sensor.type !== 'motion' ? (
            <div className="text-sm text-subtle">No data in the last 24 hours</div>
          ) : sensor.type === 'motion' && !motionEvents.length ? (
            <div className="text-sm text-subtle">No motion detected in the last 24 hours</div>
          ) : sensor.type !== 'motion' ? (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block overflow-visible">
              <defs>
                <linearGradient id={`grad-${sensor.id}`} x1="0" y1={PT} x2="0" y2={PT + plotH} gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor={lineColor} stopOpacity="0.25"/>
                  <stop offset="100%" stopColor={lineColor} stopOpacity="0.03"/>
                </linearGradient>
              </defs>
              {chart && chart.yLabels.map(label => (
                <line key={label.y} x1={PL} y1={label.y} x2={W - PR} y2={label.y} stroke="var(--color-border)" strokeWidth={1} />
              ))}
              {xLabels.map(xl => (
                <line key={xl.x} x1={xl.x} y1={PT} x2={xl.x} y2={PT + plotH} stroke="var(--color-border)" strokeWidth={1} />
              ))}
              {chart && <path d={chart.areaPath} fill={`url(#grad-${sensor.id})`} />}
              {chart && (
                <path d={chart.linePath} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {chart && (
                <g fontSize={9} fill="var(--color-text-subtle)" textAnchor="end">
                  {chart.yLabels.map(yl => (
                    <text key={yl.y} x={PL - 5} y={yl.y + 3}>{yl.label}{unit}</text>
                  ))}
                </g>
              )}
              <g fontSize={9} fill="var(--color-text-subtle)" textAnchor="middle">
                {xLabels.map(xl => (
                  <text key={xl.x} x={xl.x} y={PT + plotH + 18}>{xl.label}</text>
                ))}
              </g>
            </svg>
          ) : (
            <svg viewBox={`0 0 ${W} 80`} className="w-full h-auto block overflow-visible max-h-[90px]">
              <line x1={PL} y1={40} x2={W - PR} y2={40} stroke="var(--color-border)" strokeWidth={1} />
              {motionEvents.map((x, i) => (
                <line key={i} x1={x} y1={20} x2={x} y2={60} stroke="var(--color-error)" strokeWidth={2} strokeLinecap="round" />
              ))}
              <g fontSize={9} fill="var(--color-text-subtle)" textAnchor="middle">
                {xLabels.map(xl => (
                  <text key={xl.x} x={xl.x} y={74}>{xl.label}</text>
                ))}
              </g>
            </svg>
          )}
        </div>

        {!isLoading && readings.length > 0 && sensor.type !== 'motion' ? (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <dt className="text-xs text-subtle">Min</dt>
              <dd className="mt-0.5 text-sm font-semibold text-text tabular-nums">{min!.toFixed(1)}{unit}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Max</dt>
              <dd className="mt-0.5 text-sm font-semibold text-text tabular-nums">{max!.toFixed(1)}{unit}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Latest</dt>
              <dd className="mt-0.5 text-sm font-semibold text-accent-strong tabular-nums">{latest!.toFixed(1)}{unit}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Readings</dt>
              <dd className="mt-0.5 text-sm font-semibold text-text tabular-nums">{readings.length}</dd>
            </div>
          </dl>
        ) : !isLoading && sensor.type === 'motion' && motionEvents.length > 0 ? (
          <div className="text-sm text-muted">
            {motionEvents.length} event{motionEvents.length === 1 ? '' : 's'} in the last 24 hours.
          </div>
        ) : null}
      </div>
    </AppDialog>
  )
}
