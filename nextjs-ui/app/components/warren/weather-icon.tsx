import type { WeatherSymbol } from '@/lib/shared/types'

/**
 * Weather symbols, drawn inline rather than vendored from MET's icon set.
 *
 * MET publishes ~100 SVGs that map one-to-one to `symbol_code`, and using them
 * would be the exact choice. This trades that exactness for not carrying a
 * hundred unverifiable files in the repo: MET's codes are systematic
 * (`<condition>[_day|_night|_polartwilight]`, with intensity prefixes like
 * `light`/`heavy` and `showers` suffixes), so matching on the condition alone
 * covers every code it can emit.
 *
 * Everything uses `currentColor` so the six colour schemes and both themes work
 * without per-icon variants.
 */
function conditionOf(symbol: WeatherSymbol): string {
  const base = symbol.replace(/_(day|night|polartwilight)$/, '')
  if (base.includes('thunder')) return 'thunder'
  if (base.includes('sleet')) return 'sleet'
  if (base.includes('snow')) return 'snow'
  if (base.includes('rain')) return 'rain'
  if (base.includes('fog')) return 'fog'
  if (base === 'cloudy') return 'cloudy'
  if (base.includes('partlycloudy')) return 'partlycloudy'
  if (base.includes('fair')) return 'fair'
  return 'clearsky'
}

function isNight(symbol: WeatherSymbol): boolean {
  return symbol.endsWith('_night')
}

export function WeatherIcon({
  symbol,
  className = 'size-6',
}: {
  symbol: WeatherSymbol | null
  className?: string
}) {
  if (!symbol) {
    // A missing symbol renders nothing rather than a fabricated "clear".
    return <span className={className} aria-hidden="true" />
  }

  const condition = conditionOf(symbol)
  const night = isNight(symbol)

  const cloud = <path d="M7 17h9a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7 11a3 3 0 0 0 0 6Z" />
  const sun = night
    ? <path d="M14.5 3.5A6.5 6.5 0 1 0 20.5 12 5.2 5.2 0 0 1 14.5 3.5Z" />
    : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.1-7.1-1.4 1.4M8.3 15.7l-1.4 1.4m0-12.2 1.4 1.4m7.4 7.4 1.4 1.4" /></>

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={symbol.replace(/_/g, ' ')}
    >
      {condition === 'clearsky' && sun}
      {condition === 'fair' && <>{sun}{cloud}</>}
      {condition === 'partlycloudy' && <>{sun}{cloud}</>}
      {condition === 'cloudy' && cloud}
      {condition === 'fog' && <><path d="M4 10h16M4 14h16M6 18h12" /></>}
      {condition === 'rain' && <>{cloud}<path d="M9 19v2m3-3v2m3-3v2" /></>}
      {condition === 'sleet' && <>{cloud}<path d="M9 19v2m6-3v2" /><path d="M12 19.5h.01" /></>}
      {condition === 'snow' && <>{cloud}<path d="M9 20h.01M12 19h.01M15 20h.01" /></>}
      {condition === 'thunder' && <>{cloud}<path d="M13 18l-3 4h4l-3 3" /></>}
    </svg>
  )
}
