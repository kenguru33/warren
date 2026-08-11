'use client'

import { ArrowPathIcon, MapPinIcon, TrashIcon } from '@heroicons/react/20/solid'
import type { WeatherView } from '@/lib/shared/types'
import { WeatherIcon } from './weather-icon'
import { TileMenu, type TileMenuItem } from './tile-menu'

/**
 * Outdoor weather from MET Norway (Yr).
 *
 * House-wide like the music player, so it sits beside the room grid rather than
 * inside a room card. It leads with a large temperature and symbol because the
 * wall panel is a primary surface and has to be readable across a room.
 *
 * Attribution to MET Norway is rendered here rather than hidden in settings —
 * it is a condition of the data licence (NLOD 2.0 / CC BY 4.0), not a credit.
 */
export function WeatherCard({
  weather,
  onEditLocation,
  onRemove,
  onRefresh,
}: {
  weather: WeatherView
  onEditLocation: () => void
  onRemove: () => void
  onRefresh: () => void
}) {
  const { current, hourly, daily, location } = weather

  const menuItems: TileMenuItem[] = [
    { key: 'refresh', label: 'Refresh now', icon: <ArrowPathIcon data-slot="icon" />, onSelect: onRefresh },
    { key: 'location', label: 'Change location…', icon: <MapPinIcon data-slot="icon" />, onSelect: onEditLocation },
    { key: 'remove', label: 'Remove weather', icon: <TrashIcon data-slot="icon" />, tone: 'destructive', onSelect: onRemove },
  ]

  return (
    <article className="flex flex-col gap-4 rounded-2xl bg-surface p-5 ring-1 ring-default shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_20px_-12px_rgba(0,0,0,0.08)] dark:ring-white/10 dark:shadow-none dark:[box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Weather</p>
          <p className="truncate text-sm text-muted">
            {location?.label || (location ? `${location.latitude}, ${location.longitude}` : '')}
          </p>
        </div>
        <TileMenu items={menuItems} aria-label="Weather menu" positionClassName="shrink-0" />
      </div>

      {current ? (
        <div className="flex items-center gap-4">
          <WeatherIcon symbol={current.symbol} className="size-16 shrink-0 text-accent-strong" />
          <div className="min-w-0">
            <p className="text-4xl font-semibold tabular-nums text-text">
              {current.temperature !== null ? `${Math.round(current.temperature)}°` : '--'}
            </p>
            <p className="mt-0.5 text-xs text-subtle">
              {current.windSpeed !== null && <>{Math.round(current.windSpeed)} m/s</>}
              {current.precipitation !== null && current.precipitation > 0 && (
                <> · {current.precipitation} mm</>
              )}
              {current.humidity !== null && <> · {Math.round(current.humidity)}%</>}
            </p>
          </div>
        </div>
      ) : (
        // Never render a blank temperature as though it were a reading.
        <p className="text-sm text-muted">
          {weather.error ?? 'No forecast yet.'}
        </p>
      )}

      {hourly.length > 0 && (
        <div className="pretty-scroll flex gap-3 overflow-x-auto pb-1">
          {hourly.map(hour => (
            <div key={hour.time} className="flex w-12 shrink-0 flex-col items-center gap-1">
              <span className="text-[11px] text-muted">
                {new Date(hour.time).toLocaleTimeString([], { hour: '2-digit' })}
              </span>
              <WeatherIcon symbol={hour.symbol} className="size-5 text-subtle" />
              <span className="text-xs tabular-nums text-text">
                {hour.temperature !== null ? `${Math.round(hour.temperature)}°` : '--'}
              </span>
            </div>
          ))}
        </div>
      )}

      {daily.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-default/60 pt-3 dark:border-white/5">
          {daily.map(day => (
            <li key={day.date} className="flex items-center gap-3 text-sm">
              <span className="w-10 shrink-0 text-xs text-subtle">
                {new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: 'short' })}
              </span>
              <WeatherIcon symbol={day.symbol} className="size-5 shrink-0 text-subtle" />
              {day.precipitation !== null && day.precipitation > 0 && (
                <span className="text-xs tabular-nums text-accent-strong">{day.precipitation} mm</span>
              )}
              <span className="ml-auto shrink-0 tabular-nums text-text">
                {day.high !== null ? `${Math.round(day.high)}°` : '--'}
                <span className="ml-1.5 text-muted">
                  {day.low !== null ? `${Math.round(day.low)}°` : '--'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-default/60 pt-3 text-[11px] text-muted dark:border-white/5">
        {/* Required by the data licence, so it is in the card and legible. */}
        <a
          href="https://api.met.no/doc/License"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Data from MET Norway
        </a>
        <span>
          {weather.stale && <span className="mr-1.5 text-error">Stale</span>}
          {weather.updatedAt
            ? new Date(weather.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'never updated'}
        </span>
      </div>
    </article>
  )
}
