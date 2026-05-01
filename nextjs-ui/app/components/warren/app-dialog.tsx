'use client'

import { type ReactNode } from 'react'
import { Dialog, DialogTitle } from '@/app/components/dialog'

const SIZE_MAP: Record<string, 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'> = {
  'max-w-md': 'md',
  'max-w-lg': 'lg',
  'max-w-xl': 'xl',
  'max-w-2xl': '2xl',
  'max-w-3xl': '3xl',
  'max-w-4xl': '4xl',
  'max-w-5xl': '5xl',
}

/**
 * Adapter shim around Catalyst {@link Dialog}.
 *
 * Existing modals still ship their own header/body/footer with px-6 padding,
 * so we zero out Catalyst's `--gutter` to avoid double padding. Phase 7 will
 * migrate each modal to native Catalyst body/actions slots; once that lands
 * the gutter override and `maxWidthClass` API can both be retired.
 */
export function AppDialog({
  open,
  onClose,
  title,
  maxWidthClass = 'max-w-md',
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  maxWidthClass?: string
  children: ReactNode
}) {
  const size = SIZE_MAP[maxWidthClass] ?? 'md'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size={size}
      className="flex max-h-[88vh] flex-col overflow-hidden [--gutter:0px]"
    >
      {title && (
        <DialogTitle className="border-b border-default px-6 pt-5 pb-4">
          {title}
        </DialogTitle>
      )}
      {children}
    </Dialog>
  )
}
