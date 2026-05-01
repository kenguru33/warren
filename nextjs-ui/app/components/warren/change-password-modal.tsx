'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Button } from '@/app/components/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/app/components/dialog'
import {
  ErrorMessage,
  Field,
  FieldGroup,
  Fieldset,
  Label,
} from '@/app/components/fieldset'
import { Input } from '@/app/components/input'

export function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setError('')
      setSuccess(false)
      setLoading(false)
    }
  }, [open])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.status === 401) {
        setError('Current password is incorrect')
        return
      }
      if (!res.ok) {
        setError('Something went wrong. Please try again.')
        return
      }
      setSuccess(true)
      setTimeout(() => onClose(), 1500)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <form onSubmit={submit}>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>Use at least 8 characters.</DialogDescription>
        <DialogBody>
          <Fieldset disabled={success}>
            <FieldGroup>
              <Field>
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                />
              </Field>
              <Field>
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                />
              </Field>
              <Field>
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                />
                {error && <ErrorMessage>{error}</ErrorMessage>}
              </Field>
            </FieldGroup>
          </Fieldset>
          {success && (
            <p className="mt-6 rounded-lg bg-success/10 ring-1 ring-success/30 px-3 py-2 text-sm text-success">
              Password changed successfully
            </p>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain type="button" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            disabled={loading || success || !currentPassword || !newPassword || !confirmPassword}
          >
            {loading ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
