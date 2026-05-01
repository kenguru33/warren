'use client'

import { FormEvent, useEffect, useState } from 'react'
import { AppDialog } from './app-dialog'

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
    <AppDialog open={open} onClose={onClose} maxWidthClass="max-w-md">
      <form onSubmit={submit}>
        <div className="px-6 pt-5 pb-4 border-b border-default">
          <h3 className="text-base/6 font-semibold text-text">Change password</h3>
          <p className="mt-1 text-sm/6 text-muted">Use at least 8 characters.</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor="current-password" className="label">Current password</label>
            <input
              id="current-password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="input mt-1.5"
              type="password"
              autoComplete="current-password"
              autoFocus
              disabled={success}
            />
          </div>
          <div>
            <label htmlFor="new-password" className="label">New password</label>
            <input
              id="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="input mt-1.5"
              type="password"
              autoComplete="new-password"
              disabled={success}
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="label">Confirm new password</label>
            <input
              id="confirm-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="input mt-1.5"
              type="password"
              autoComplete="new-password"
              disabled={success}
            />
          </div>
          {error && (
            <p className="rounded-lg bg-error/10 ring-1 ring-error/30 px-3 py-2 text-sm text-error">{error}</p>
          )}
          {success && (
            <p className="rounded-lg bg-success/10 ring-1 ring-success/30 px-3 py-2 text-sm text-success">
              Password changed successfully
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-default bg-surface-2/50">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || success || !currentPassword || !newPassword || !confirmPassword}
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </AppDialog>
  )
}
