'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Button } from '@/app/components/button'
import { Subheading } from '@/app/components/heading'
import { Text } from '@/app/components/text'
import { Field, Label, Description } from '@/app/components/fieldset'
import { Input } from '@/app/components/input'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/app/components/alert'
import type { SnapshotHeader } from '@/lib/shared/backup'
import { BackupPreviewTable } from './backup-preview-table'

interface PreviewResponse {
  header: SnapshotHeader
  warnings: string[]
  errors: string[]
  compatible: boolean
}

interface ApiError {
  message?: string
  statusMessage?: string
}

const CONFIRM_PHRASE = 'restore'

export function BackupRestoreCard() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  function clearPreview() {
    setFile(null)
    setPreview(null)
    setPreviewError(null)
    setRestoreError(null)
    setConfirmText('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (!f) {
      clearPreview()
      return
    }
    setFile(f)
    setPreview(null)
    setPreviewError(null)
    setRestoreError(null)
    setPreviewLoading(true)
    try {
      const form = new FormData()
      form.append('file', f)
      const res = await fetch('/api/admin/backup/preview', {
        method: 'POST',
        body: form,
        credentials: 'include',
      })
      const json = (await res.json()) as PreviewResponse | ApiError
      if (!res.ok) {
        throw new Error(
          (json as ApiError).message ?? (json as ApiError).statusMessage ?? 'Preview failed',
        )
      }
      setPreview(json as PreviewResponse)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function doRestore() {
    if (!file) return
    setRestoring(true)
    setRestoreError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/admin/backup/restore', {
        method: 'POST',
        body: form,
        credentials: 'include',
      })
      const json = (await res.json()) as ApiError | { ok: true }
      if (!res.ok) {
        throw new Error(
          (json as ApiError).message ?? (json as ApiError).statusMessage ?? 'Restore failed',
        )
      }
      window.location.reload()
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed')
      setShowConfirm(false)
    } finally {
      setRestoring(false)
    }
  }

  const canRestore = preview?.compatible === true && !restoring
  const confirmReady = confirmText.trim().toLowerCase() === CONFIRM_PHRASE

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-xl bg-surface p-6 ring-1 shadow-sm ring-default dark:shadow-none dark:ring-white/10">
        <div>
          <Subheading>Export</Subheading>
          <Text className="mt-1">
            Download a snapshot of your dashboard configuration. Includes rooms, sensors, lights,
            Hue pairing, and users. Does not include sensor history, broker credentials, or TLS
            material.
          </Text>
        </div>
        <Button onClick={() => window.location.assign('/api/admin/backup/export')}>
          Download snapshot
        </Button>
      </section>

      <section className="space-y-4 rounded-xl bg-surface p-6 ring-1 shadow-sm ring-default dark:shadow-none dark:ring-white/10">
        <div>
          <Subheading>Restore</Subheading>
          <Text className="mt-1">
            Upload a snapshot to replace the current configuration. The currently signed-in user&apos;s
            password is preserved so you stay logged in.
          </Text>
        </div>

        <Field>
          <Label>Snapshot file</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={onFileChange}
            className="block w-full text-sm text-text file:mr-3 file:rounded-md file:border-0 file:bg-default file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text hover:file:bg-surface-2 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <Description>JSON file produced by &ldquo;Download snapshot&rdquo;.</Description>
        </Field>

        {previewLoading && <Text className="text-subtle">Reading snapshot…</Text>}

        {previewError && (
          <div className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error ring-1 ring-error/30">
            {previewError}
          </div>
        )}

        {preview && <BackupPreviewTable preview={preview} />}

        {restoreError && (
          <div className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error ring-1 ring-error/30">
            {restoreError}
          </div>
        )}

        {preview && (
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button plain disabled={restoring} onClick={clearPreview}>
              Cancel
            </Button>
            <Button color="red" disabled={!canRestore} onClick={() => setShowConfirm(true)}>
              Restore
            </Button>
          </div>
        )}
      </section>

      <Alert open={showConfirm} onClose={() => !restoring && setShowConfirm(false)}>
        <AlertTitle>Replace current configuration?</AlertTitle>
        <AlertDescription>
          This wipes every configuration table in the database and replaces it with the contents of
          the snapshot. Your own password is preserved so you stay logged in. To confirm, type
          &ldquo;{CONFIRM_PHRASE}&rdquo; below.
        </AlertDescription>
        <Field className="mt-4">
          <Label>Type to confirm</Label>
          <Input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoFocus
          />
        </Field>
        <AlertActions>
          <Button plain disabled={restoring} onClick={() => setShowConfirm(false)}>
            Cancel
          </Button>
          <Button color="red" disabled={!confirmReady || restoring} onClick={doRestore}>
            {restoring ? 'Restoring…' : 'Replace configuration'}
          </Button>
        </AlertActions>
      </Alert>
    </div>
  )
}
