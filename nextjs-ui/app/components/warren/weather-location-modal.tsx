'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { MapPinIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import type { WeatherPlaceView } from '@/lib/shared/types'
import { Dialog, DialogTitle, DialogBody, DialogActions, DialogDescription } from '@/app/components/dialog'
import { Button } from '@/app/components/button'
import { Field, FieldGroup, Label, Description, ErrorMessage } from '@/app/components/fieldset'
import { Input } from '@/app/components/input'
import { Text } from '@/app/components/text'

/**
 * Choosing where the forecast is for, in the order the choices are actually
 * wanted: this device's position first, then a place by name, then raw
 * coordinates for when neither works.
 *
 * Coordinates remain because the other two both depend on something that can
 * fail — geolocation needs permission and a secure context, search needs an
 * upstream service — and a setup screen that can dead-end is worse than one
 * with a plain fallback.
 */
export function WeatherLocationModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  initial: { latitude: number; longitude: number; label: string | null } | null
  onClose: () => void
  onSave: (latitude: number, longitude: number, label: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  // Debounced separately so a typed word is one upstream request, not one per
  // keystroke — the geocoder is somebody else's service.
  const [debounced, setDebounced] = useState('')
  const [locating, setLocating] = useState(false)
  const [manual, setManual] = useState(false)
  const [latitude, setLatitude] = useState(initial ? String(initial.latitude) : '')
  const [longitude, setLongitude] = useState(initial ? String(initial.longitude) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Timer lives in the change handler rather than an effect; only the cleanup
  // needs to be one.
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current) }, [])

  const onQueryChange = useCallback((value: string) => {
    setQuery(value)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => setDebounced(value.trim()), 350)
  }, [])

  const { data: results = [], isLoading: searching } = useSWR<WeatherPlaceView[]>(
    debounced.length >= 2
      ? `/api/weather/search?q=${encodeURIComponent(debounced)}`
      : null,
    async (url: string) => {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  )

  const save = useCallback(async (lat: number, lon: number, label: string) => {
    setBusy(true)
    setError(null)
    try {
      await onSave(lat, lon, label)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the location')
    } finally {
      setBusy(false)
    }
  }, [onSave, onClose])

  /**
   * Browser geolocation. Needs a secure context and the user's permission, so
   * every failure mode here is ordinary rather than exceptional — each one is
   * named, because "location unavailable" tells the user nothing about whether
   * to grant permission, move, or just type a place name.
   */
  const useCurrentPosition = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('This browser cannot report its position — search for a place instead')
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false)
        void save(position.coords.latitude, position.coords.longitude, 'Current position')
      },
      geoError => {
        setLocating(false)
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? 'Location permission was denied — search for a place instead'
            : geoError.code === geoError.POSITION_UNAVAILABLE
              ? 'Your position could not be determined — search for a place instead'
              : 'Finding your position timed out — search for a place instead',
        )
      },
      { timeout: 10_000, maximumAge: 600_000 },
    )
  }, [save])

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Weather location</DialogTitle>
      <DialogDescription>
        Warren shows the forecast for one place.
      </DialogDescription>

      <DialogBody className="space-y-5">
        <div>
          <Button
            outline
            className="w-full"
            disabled={busy || locating}
            onClick={useCurrentPosition}
          >
            <MapPinIcon data-slot="icon" />
            {locating ? 'Finding your position…' : 'Use my current position'}
          </Button>
          <Text className="mt-1.5 text-xs text-muted">
            Uses this device&apos;s location. Nothing is sent anywhere except the
            coordinates, to fetch the forecast.
          </Text>
        </div>

        <Field>
          <Label>Search for a place</Label>
          <Description>A town or city name, for example Lillestrøm</Description>
          <div className="relative">
            <Input
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="Start typing…"
              spellCheck={false}
              autoComplete="off"
            />
            <MagnifyingGlassIcon
              className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
          </div>
        </Field>

        {searching && <Text className="text-xs text-muted">Searching…</Text>}

        {results.length > 0 && (
          <ul className="pretty-scroll max-h-56 divide-y divide-default/60 overflow-y-auto rounded-lg ring-1 ring-default dark:divide-white/5">
            {results.map(place => (
              <li key={place.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => save(place.latitude, place.longitude, place.label)}
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-50"
                >
                  <span className="text-sm text-text">{place.name}</span>
                  {/* Region disambiguates the many places that share a name. */}
                  <span className="text-xs text-subtle">
                    {[place.region, place.country].filter(Boolean).join(', ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {query.trim().length >= 2 && !searching && results.length === 0 && (
          <Text className="text-xs text-muted">
            Nothing found. Try a larger nearby town, or enter coordinates.
          </Text>
        )}

        <div>
          <button
            type="button"
            onClick={() => setManual(v => !v)}
            className="text-xs text-accent-strong underline"
          >
            {manual ? 'Hide coordinates' : 'Enter coordinates instead'}
          </button>

          {manual && (
            <FieldGroup className="mt-3">
              <Field>
                <Label>Latitude</Label>
                <Description>Between -90 and 90, for example 59.9139</Description>
                <Input
                  value={latitude}
                  onChange={e => setLatitude(e.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                />
              </Field>
              <Field>
                <Label>Longitude</Label>
                <Description>Between -180 and 180, for example 10.7522</Description>
                <Input
                  value={longitude}
                  onChange={e => setLongitude(e.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                />
              </Field>
              <Button
                outline
                disabled={busy || !latitude || !longitude}
                onClick={() => save(Number(latitude), Number(longitude), '')}
              >
                Use these coordinates
              </Button>
            </FieldGroup>
          )}
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  )
}
