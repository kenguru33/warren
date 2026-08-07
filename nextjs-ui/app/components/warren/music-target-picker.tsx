'use client'

import * as Headless from '@headlessui/react'
import { ChevronDownIcon, SpeakerWaveIcon, ComputerDesktopIcon } from '@heroicons/react/20/solid'
import type { MusicTargetView } from '@/lib/shared/types'
import { BROWSER_TARGET_ID } from '@/lib/shared/types'
import { DropdownItem, DropdownLabel, DropdownMenu } from '@/app/components/dropdown'

/**
 * Output picker. The current output is named on the tile face, not hidden
 * inside the menu — the browser/speaker asymmetry is deliberately visible,
 * since only one of the two is controllable from another device.
 *
 * Cast and Sonos speakers share one list: the user is choosing where sound
 * comes out, and the protocol is an implementation detail. The kind is still
 * shown, quietly, for a household that has both.
 */
export function MusicTargetPicker({
  targets,
  selectedTargetId,
  onSelect,
  disabled,
}: {
  targets: MusicTargetView[]
  selectedTargetId: string | null
  onSelect: (targetId: string) => void
  disabled?: boolean
}) {
  const isBrowser = selectedTargetId === null || selectedTargetId === BROWSER_TARGET_ID
  const selected = isBrowser ? null : targets.find(t => t.targetId === selectedTargetId) ?? null

  const label = isBrowser ? 'This device' : selected?.friendlyName ?? 'Unknown speaker'

  // With nothing but the browser available, show a static label rather than a
  // menu whose only entry is the thing already selected.
  if (targets.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
        <ComputerDesktopIcon className="size-3.5" aria-hidden="true" />
        This device
      </span>
    )
  }

  return (
    <Headless.Menu>
      <Headless.MenuButton
        disabled={disabled}
        aria-label={`Output: ${label}`}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-subtle hover:bg-surface-2 disabled:opacity-50"
      >
        {isBrowser
          ? <ComputerDesktopIcon className="size-3.5 shrink-0" aria-hidden="true" />
          : <SpeakerWaveIcon className="size-3.5 shrink-0" aria-hidden="true" />}
        <span className="truncate">{label}</span>
        <ChevronDownIcon className="size-3 shrink-0" aria-hidden="true" />
      </Headless.MenuButton>

      <DropdownMenu anchor="bottom end" className="min-w-56">
        <DropdownItem onClick={() => onSelect(BROWSER_TARGET_ID)}>
          <ComputerDesktopIcon data-slot="icon" />
          <DropdownLabel>This device</DropdownLabel>
        </DropdownItem>

        {targets.map(target => (
          <DropdownItem
            key={target.targetId}
            onClick={() => onSelect(target.targetId)}
            disabled={!target.reachable}
          >
            <SpeakerWaveIcon data-slot="icon" />
            <DropdownLabel>
              {target.friendlyName}
              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted">
                {target.protocol === 'sonos' ? 'sonos' : 'cast'}
              </span>
              {target.origin === 'manual' && (
                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted">manual</span>
              )}
              {!target.reachable && (
                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted">offline</span>
              )}
              {/*
                A grouped Sonos coordinator plays in every room of its group.
                Naming only the coordinator would let the user pick "Kitchen"
                and fill four rooms with sound.
              */}
              {target.groupRooms.length > 0 && (
                <span className="block text-[11px] text-muted">
                  + {target.groupRooms.join(', ')}
                </span>
              )}
            </DropdownLabel>
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Headless.Menu>
  )
}
