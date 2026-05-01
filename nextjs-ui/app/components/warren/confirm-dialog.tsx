'use client'

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/app/components/alert'
import { Button } from '@/app/components/button'

export function ConfirmDialog({
  open,
  message,
  title = 'Are you sure?',
  confirmLabel = 'Delete',
  tone = 'destructive',
  onConfirm,
  onCancel,
}: {
  open: boolean
  message: string
  title?: string
  confirmLabel?: string
  tone?: 'default' | 'destructive'
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Alert open={open} onClose={onCancel}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <AlertActions>
        <Button plain onClick={onCancel}>Cancel</Button>
        <Button color={tone === 'destructive' ? 'red' : 'dark/zinc'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </AlertActions>
    </Alert>
  )
}
