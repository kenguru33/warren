'use client'

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { AppDialog } from './app-dialog'

export function ConfirmDialog({
  open,
  message,
  title = 'Are you sure?',
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  open: boolean
  message: string
  title?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AppDialog open={open} onClose={onCancel} maxWidthClass="max-w-md">
      <div className="px-6 py-6 sm:flex sm:items-start gap-4">
        <div className="mx-auto flex size-10 shrink-0 items-center justify-center rounded-full bg-error/10 ring-1 ring-error/20 sm:mx-0">
          <ExclamationTriangleIcon className="size-5 text-error" aria-hidden />
        </div>
        <div className="mt-3 text-center sm:mt-0 sm:text-left">
          <h3 className="text-base font-semibold text-text">{title}</h3>
          <p className="mt-2 text-sm text-muted leading-relaxed">{message}</p>
        </div>
      </div>
      <div className="px-6 pb-5 pt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </AppDialog>
  )
}
