'use client'

import { XMarkIcon } from '@heroicons/react/20/solid'
import { AppDialog } from './app-dialog'

export function LiveStreamModal({
  open,
  cameraName,
  streamUrl,
  onClose,
}: {
  open: boolean
  cameraName: string
  streamUrl: string | null
  onClose: () => void
}) {
  return (
    <AppDialog open={open} onClose={onClose} maxWidthClass="max-w-4xl">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-default">
        <span className="flex-1 text-base/6 font-semibold text-text truncate">{cameraName}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-error/10 px-2.5 py-1 ring-1 ring-error/30">
          <span className="size-1.5 rounded-full bg-error animate-warren-pulse" />
          <span className="text-xs font-bold text-error tracking-wider">LIVE</span>
        </span>
        <button type="button" className="btn-icon size-8" aria-label="Close" onClick={onClose}>
          <XMarkIcon className="size-4" />
        </button>
      </div>
      <div className="aspect-video bg-black overflow-hidden rounded-b-2xl">
        {!streamUrl ? (
          <div className="size-full flex flex-col items-center justify-center gap-3.5 text-white/60 text-sm">
            <svg className="size-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2}>
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
            <p>Stream URL not configured</p>
          </div>
        ) : (
          // External MJPEG/HLS stream — Next/Image isn't useful here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={streamUrl} alt="Live stream" className="size-full object-contain block" />
        )}
      </div>
    </AppDialog>
  )
}
