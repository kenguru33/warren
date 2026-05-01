'use client'

import { XMarkIcon } from '@heroicons/react/20/solid'
import { Button } from '@/app/components/button'
import { Dialog, DialogTitle } from '@/app/components/dialog'

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
    <Dialog open={open} onClose={onClose} size="4xl" className="overflow-hidden [--gutter:0px]">
      <div className="flex items-center gap-3 border-b border-default px-5 py-3">
        <DialogTitle className="flex-1 truncate">{cameraName}</DialogTitle>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-error/10 px-2.5 py-1 ring-1 ring-error/30">
          <span className="size-1.5 rounded-full bg-error animate-warren-pulse" />
          <span className="text-xs font-bold tracking-wider text-error">LIVE</span>
        </span>
        <Button plain aria-label="Close" onClick={onClose}>
          <XMarkIcon data-slot="icon" />
        </Button>
      </div>
      <div className="aspect-video overflow-hidden rounded-b-2xl bg-black">
        {!streamUrl ? (
          <div className="flex size-full flex-col items-center justify-center gap-3.5 text-sm text-white/60">
            <svg className="size-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2}>
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
            <p>Stream URL not configured</p>
          </div>
        ) : (
          // External MJPEG/HLS stream — Next/Image isn't useful here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={streamUrl} alt="Live stream" className="block size-full object-contain" />
        )}
      </div>
    </Dialog>
  )
}
