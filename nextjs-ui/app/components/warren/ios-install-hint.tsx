'use client'

import { ArrowUpOnSquareIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { useIosInstallHint } from '@/lib/hooks/use-ios-install-hint'

export function IosInstallHint() {
  const { shouldShow, dismiss } = useIosInstallHint()
  if (!shouldShow) return null
  return (
    <div
      className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl bg-modal p-3 shadow-lg ring-1 ring-default dark:ring-white/10"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <ArrowUpOnSquareIcon className="mt-0.5 size-5 shrink-0 text-subtle" />
      <p className="flex-1 text-sm/5 text-text">
        Install on iPhone: tap the Share icon then <span className="font-semibold">Add to Home Screen</span>.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-subtle hover:bg-default hover:text-text"
        aria-label="Dismiss"
      >
        <XMarkIcon className="size-4" />
      </button>
    </div>
  )
}
