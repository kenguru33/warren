'use client'

import type { RoomWithSensors, SensorView } from '@/lib/shared/types'

function formatValue(s: SensorView): string {
  if (s.latestValue === null) return '—'
  switch (s.type) {
    case 'temperature': return `${s.latestValue.toFixed(1)} °C`
    case 'humidity':    return `${s.latestValue.toFixed(0)} %`
    case 'lightlevel':  return `${s.latestValue.toFixed(0)} lux`
    case 'motion':      return s.latestValue >= 1 ? 'Motion' : 'Clear'
    case 'light':       return s.lightOn === true ? 'On' : s.lightOn === false ? 'Off' : '—'
    default:            return String(s.latestValue)
  }
}

export function RoomCard({ room }: { room: RoomWithSensors }) {
  return (
    <article className="card p-5 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base/6 font-semibold text-text sm:text-lg/6">{room.name}</h2>
          {room.reference && (room.reference.refTemp !== null || room.reference.refHumidity !== null) && (
            <p className="text-xs/5 text-subtle mt-0.5">
              {room.reference.refTemp !== null && <>Ref: {room.reference.refTemp.toFixed(1)} °C</>}
              {room.reference.refTemp !== null && room.reference.refHumidity !== null && ' · '}
              {room.reference.refHumidity !== null && <>{room.reference.refHumidity.toFixed(0)} %</>}
            </p>
          )}
        </div>
        {room.lightMaster && (
          <span className="badge badge-neutral">
            {room.lightMaster.state === 'all-on' ? 'All on' : room.lightMaster.state === 'mixed' ? 'Mixed' : 'All off'}
          </span>
        )}
      </header>

      {room.sensors.length === 0 ? (
        <p className="mt-4 text-sm/5 text-subtle">No sensors assigned to this room yet.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {room.sensors.map(s => (
            <li key={s.id} className="panel flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm/5 font-medium text-text truncate">{s.label ?? s.hueName ?? s.type}</div>
                <div className="text-xs/4 text-subtle truncate">
                  {s.type}
                  {s.deviceId && <> · <span className="font-mono">{s.deviceId}</span></>}
                </div>
              </div>
              <div className="text-sm/5 font-semibold text-text shrink-0">{formatValue(s)}</div>
            </li>
          ))}
        </ul>
      )}

      {room.lightGroups.length > 0 && (
        <div className="mt-4 pt-4 border-t border-default">
          <div className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">Light groups</div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {room.lightGroups.map(g => (
              <li key={g.id} className="panel flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm/5 font-medium text-text truncate">{g.name}</div>
                  <div className="text-xs/4 text-subtle">{g.memberCount} lights · {g.theme}</div>
                </div>
                <span className={`badge ${g.state === 'all-on' ? 'badge-success' : g.state === 'mixed' ? 'badge-warning' : 'badge-neutral'}`}>
                  {g.state === 'all-on' ? 'On' : g.state === 'mixed' ? 'Mixed' : 'Off'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}
