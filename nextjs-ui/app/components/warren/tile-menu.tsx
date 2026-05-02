'use client'

import * as Headless from '@headlessui/react'
import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react'
import { EllipsisVerticalIcon } from '@heroicons/react/20/solid'
import {
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/app/components/dropdown'

export type TileMenuItem = {
  key: string
  label: string
  icon?: ReactNode
  tone?: 'default' | 'warning' | 'destructive'
  disabled?: boolean
  onSelect: () => void
}

export type TileMenuHandle = {
  /** Synthesize a click on the kebab so the long-press hook can open the menu. */
  open: () => void
}

/**
 * Always-visible kebab + Catalyst Dropdown for the top-right corner of a tile.
 *
 * Positioned via `absolute top-1.5 right-1.5` over the tile's content. The
 * trigger button stops `pointerdown` so opening the menu doesn't fire the
 * tile's primary `onClick`. Pair with `useLongPress` on the tile root to
 * also open the menu on a 500ms touch-and-hold via the imperative `open()`
 * handle.
 */
export const TileMenu = forwardRef<TileMenuHandle, {
  items: TileMenuItem[]
  /** Override the trigger styling — used by CameraTile for white-on-image chrome. */
  triggerClassName?: string
  /** Override the absolute position. Defaults to top-right corner. */
  positionClassName?: string
  /** Anchor for the dropdown menu. Defaults to "bottom end". */
  anchor?: 'top start' | 'top end' | 'bottom start' | 'bottom end'
  'aria-label'?: string
}>(function TileMenu(
  {
    items,
    triggerClassName,
    positionClassName = 'absolute top-1.5 right-1.5 z-10',
    anchor = 'bottom end',
    'aria-label': ariaLabel = 'Tile menu',
  },
  ref,
) {
  const btnRef = useRef<HTMLButtonElement>(null)
  useImperativeHandle(ref, () => ({
    open: () => btnRef.current?.click(),
  }), [])

  return (
    <div className={positionClassName}>
      <Headless.Menu>
        <Headless.MenuButton
          ref={btnRef}
          as="button"
          aria-label={ariaLabel}
          onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className={
            triggerClassName ??
            'inline-flex size-7 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-2/50 hover:text-text focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:hover:bg-white/10 dark:hover:text-white'
          }
        >
          <EllipsisVerticalIcon className="size-4" />
        </Headless.MenuButton>
        <DropdownMenu className="min-w-52" anchor={anchor}>
          {items.map(item => (
            <DropdownItem
              key={item.key}
              disabled={item.disabled}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                item.onSelect()
              }}
              className={
                item.tone === 'destructive'
                  ? '!text-error data-focus:!text-white'
                  : item.tone === 'warning'
                    ? '!text-warning data-focus:!text-white'
                    : undefined
              }
            >
              {item.icon}
              <DropdownLabel>{item.label}</DropdownLabel>
            </DropdownItem>
          ))}
        </DropdownMenu>
      </Headless.Menu>
    </div>
  )
})
