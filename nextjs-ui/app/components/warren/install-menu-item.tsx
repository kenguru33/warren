'use client'

import { ArrowDownTrayIcon } from '@heroicons/react/20/solid'
import { useInstallPrompt } from '@/lib/hooks/use-install-prompt'
import { DropdownItem, DropdownLabel } from '@/app/components/dropdown'

export function InstallMenuItem() {
  const { canInstall, install } = useInstallPrompt()
  if (!canInstall) return null
  return (
    <DropdownItem onClick={() => install()}>
      <ArrowDownTrayIcon data-slot="icon" />
      <DropdownLabel>Install Warren</DropdownLabel>
    </DropdownItem>
  )
}
