'use client'

import { ArrowDownTrayIcon } from '@heroicons/react/20/solid'
import { useInstallPrompt } from '@/lib/hooks/use-install-prompt'

export function InstallMenuItem() {
  const { canInstall, install } = useInstallPrompt()
  if (!canInstall) return null
  return (
    <button
      type="button"
      onClick={() => install()}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm/5 text-text hover:bg-default"
    >
      <ArrowDownTrayIcon className="size-4 text-subtle" />
      <span>Install Warren</span>
    </button>
  )
}
