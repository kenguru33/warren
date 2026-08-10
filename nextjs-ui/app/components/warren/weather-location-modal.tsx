'use client'

import { useState } from 'react'
import { Dialog, DialogTitle, DialogBody, DialogActions, DialogDescription } from '@/app/components/dialog'
import { Button } from '@/app/components/button'
import { Field, FieldGroup, Label, Description, ErrorMessage } from '@/app/components/fieldset'
import { Input } from '@/app/components/input'

/**
 * Coordinates rather than a place-name search: MET does not geocode, and adding
 * a geocoder means another service with its own terms and another failure mode.
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
  const [latitude, setLatitude] = useState(initial ? String(initial.latitude) : '')
  const [longitude, setLongitude] = useState(initial ? String(initial.longitude) : '')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await onSave(Number(latitude), Number(longitude), label)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the location')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Weather location</DialogTitle>
      <DialogDescription>
        Warren shows the forecast for one place. Coordinates are sent to MET Norway
        rounded to four decimals, which is all their service accepts.
      </DialogDescription>

      <DialogBody>
        <FieldGroup>
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
          <Field>
            <Label>Label</Label>
            <Description>Optional — what you call this place</Description>
            <Input value={label} onChange={e => setLabel(e.target.value)} />
          </Field>
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </FieldGroup>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !latitude || !longitude} onClick={save}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
