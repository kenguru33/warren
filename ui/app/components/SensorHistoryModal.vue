<script setup lang="ts">
import type { SensorView } from '../../shared/types'

const props = defineProps<{
  sensor: SensorView
  roomName: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

interface Reading { time: number; value: number }

const { data, pending } = useFetch<{ readings: Reading[] }>(
  `/api/sensors/${props.sensor.id}/history`,
  { key: `sensor-history-${props.sensor.id}` }
)

const readings = computed(() => data.value?.readings ?? [])

// SVG chart constants
const W = 560, H = 200
const PL = 44, PR = 12, PT = 14, PB = 30
const plotW = W - PL - PR
const plotH = H - PT - PB

const now = Date.now()
const startTime = now - 24 * 60 * 60 * 1000

function xPos(time: number) {
  return PL + ((time - startTime) / (24 * 60 * 60 * 1000)) * plotW
}

const unit = computed(() => {
  if (props.sensor.type === 'temperature') return '°C'
  if (props.sensor.type === 'humidity') return '%'
  return ''
})

const lineColor = computed(() => {
  if (props.sensor.type === 'temperature') return '#ff9f5a'
  if (props.sensor.type === 'humidity') return '#4a9eff'
  return '#a78bfa'
})

const title = computed(() => {
  const icons: Record<string, string> = { temperature: '🌡️', humidity: '💧', motion: '🏃', camera: '📷' }
  const labels: Record<string, string> = { temperature: 'Temperature', humidity: 'Humidity', motion: 'Motion', camera: 'Camera' }
  return `${icons[props.sensor.type]} ${props.sensor.label ?? labels[props.sensor.type]}`
})

const xLabels = computed(() => {
  const labels = []
  for (let h = 0; h <= 24; h += 6) {
    const t = startTime + h * 60 * 60 * 1000
    const d = new Date(t)
    const hh = String(d.getHours()).padStart(2, '0')
    labels.push({ label: `${hh}:00`, x: xPos(t) })
  }
  return labels
})

const chart = computed(() => {
  const r = readings.value
  if (!r.length) return null

  const values = r.map(p => p.value)
  let minVal = Math.min(...values)
  let maxVal = Math.max(...values)

  const pad = Math.max((maxVal - minVal) * 0.12, 0.5)
  minVal -= pad
  maxVal += pad

  const range = maxVal - minVal

  function yPos(value: number) {
    return PT + plotH - ((value - minVal) / range) * plotH
  }

  const points = r.map(p => ({ x: xPos(p.time), y: yPos(p.value) }))
  const bottom = PT + plotH

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${points.at(-1)!.x.toFixed(1)},${bottom} L${points[0].x.toFixed(1)},${bottom} Z`

  const yLabels = []
  for (let i = 0; i <= 4; i++) {
    const val = minVal + range * (i / 4)
    const y = PT + plotH - (plotH * i / 4)
    yLabels.push({ label: val.toFixed(1), y })
  }

  return { linePath, areaPath, yLabels }
})

const motionEvents = computed(() => {
  if (props.sensor.type !== 'motion') return []
  return readings.value
    .filter(p => p.value === 1)
    .map(p => xPos(p.time))
})
</script>

<template>
  <AppDialog :open="true" max-width-class="max-w-3xl" @close="emit('close')">
    <div class="px-6 pt-5 pb-4 border-b border-default flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-base/6 font-semibold text-text truncate">{{ title }}</h3>
        <p class="text-xs text-subtle mt-0.5">{{ roomName }} · last 24 hours</p>
      </div>
      <button class="btn-icon size-8" aria-label="Close" @click="emit('close')">
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>

    <div class="px-6 py-5 space-y-5">
      <div class="rounded-xl bg-surface-2/60 ring-1 ring-default p-4 min-h-[180px] flex items-center justify-center">
        <div v-if="pending" class="text-sm text-subtle">Loading…</div>
        <div v-else-if="!readings.length && sensor.type !== 'motion'" class="text-sm text-subtle">
          No data in the last 24 hours
        </div>
        <div v-else-if="sensor.type === 'motion' && !motionEvents.length" class="text-sm text-subtle">
          No motion detected in the last 24 hours
        </div>

        <svg v-else-if="sensor.type !== 'motion'" :viewBox="`0 0 ${W} ${H}`" class="w-full h-auto block overflow-visible">
          <defs>
            <linearGradient :id="`grad-${sensor.id}`" x1="0" :y1="PT" x2="0" :y2="PT + plotH" gradientUnits="userSpaceOnUse">
              <stop offset="0%" :stop-color="lineColor" stop-opacity="0.25"/>
              <stop offset="100%" :stop-color="lineColor" stop-opacity="0.03"/>
            </linearGradient>
          </defs>
          <g v-if="chart">
            <line
              v-for="label in chart.yLabels"
              :key="label.y"
              :x1="PL" :y1="label.y" :x2="W - PR" :y2="label.y"
              stroke="var(--color-border)" stroke-width="1"
            />
          </g>
          <g>
            <line
              v-for="xl in xLabels"
              :key="xl.x"
              :x1="xl.x" :y1="PT" :x2="xl.x" :y2="PT + plotH"
              stroke="var(--color-border)" stroke-width="1"
            />
          </g>
          <path v-if="chart" :d="chart.areaPath" :fill="`url(#grad-${sensor.id})`" />
          <path
            v-if="chart"
            :d="chart.linePath"
            fill="none"
            :stroke="lineColor"
            stroke-width="1.5"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <g v-if="chart" font-size="9" fill="var(--color-text-subtle)" text-anchor="end">
            <text
              v-for="yl in chart.yLabels"
              :key="yl.y"
              :x="PL - 5"
              :y="yl.y + 3"
            >{{ yl.label }}{{ unit }}</text>
          </g>
          <g font-size="9" fill="var(--color-text-subtle)" text-anchor="middle">
            <text
              v-for="xl in xLabels"
              :key="xl.x"
              :x="xl.x"
              :y="PT + plotH + 18"
            >{{ xl.label }}</text>
          </g>
        </svg>

        <svg v-else :viewBox="`0 0 ${W} 80`" class="w-full h-auto block overflow-visible max-h-[90px]">
          <line :x1="PL" y1="40" :x2="W - PR" y2="40" stroke="var(--color-border)" stroke-width="1"/>
          <line
            v-for="(x, i) in motionEvents"
            :key="i"
            :x1="x" y1="20" :x2="x" y2="60"
            stroke="var(--color-error)" stroke-width="2"
            stroke-linecap="round"
          />
          <g font-size="9" fill="var(--color-text-subtle)" text-anchor="middle">
            <text
              v-for="xl in xLabels"
              :key="xl.x"
              :x="xl.x"
              y="74"
            >{{ xl.label }}</text>
          </g>
        </svg>
      </div>

      <dl v-if="!pending && readings.length && sensor.type !== 'motion'" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <dt class="text-xs text-subtle">Min</dt>
          <dd class="mt-0.5 text-sm font-semibold text-text tabular-nums">{{ Math.min(...readings.map(r => r.value)).toFixed(1) }}{{ unit }}</dd>
        </div>
        <div>
          <dt class="text-xs text-subtle">Max</dt>
          <dd class="mt-0.5 text-sm font-semibold text-text tabular-nums">{{ Math.max(...readings.map(r => r.value)).toFixed(1) }}{{ unit }}</dd>
        </div>
        <div>
          <dt class="text-xs text-subtle">Latest</dt>
          <dd class="mt-0.5 text-sm font-semibold text-accent-strong tabular-nums">{{ readings.at(-1)!.value.toFixed(1) }}{{ unit }}</dd>
        </div>
        <div>
          <dt class="text-xs text-subtle">Readings</dt>
          <dd class="mt-0.5 text-sm font-semibold text-text tabular-nums">{{ readings.length }}</dd>
        </div>
      </dl>
      <div v-else-if="!pending && sensor.type === 'motion' && motionEvents.length" class="text-sm text-muted">
        {{ motionEvents.length }} event{{ motionEvents.length === 1 ? '' : 's' }} in the last 24 hours.
      </div>
    </div>
  </AppDialog>
</template>
