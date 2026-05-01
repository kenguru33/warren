'use client'

import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Transition } from '@headlessui/react'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import { Fragment } from 'react'
import { LIGHT_THEMES, type LightThemeKey } from '@/lib/shared/light-themes'

const themes = Object.values(LIGHT_THEMES)

export function LightThemePicker({
  value,
  onChange,
}: {
  value: LightThemeKey
  onChange: (key: LightThemeKey) => void
}) {
  const selectedTheme = LIGHT_THEMES[value]

  return (
    <Listbox value={value} onChange={onChange} as="div" className="relative w-full">
      <ListboxButton className="relative w-full cursor-pointer rounded-lg bg-input py-2 pl-3 pr-10 text-left text-sm text-text shadow-sm ring-1 ring-inset ring-default focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent transition dark:ring-white/10 dark:shadow-none">
        <span className="flex items-center gap-3">
          <span
            className="size-4 shrink-0 rounded-full ring-1 ring-white/10 shadow-sm"
            style={{ background: selectedTheme.swatch }}
            aria-hidden
          />
          <span className="font-medium">{selectedTheme.label}</span>
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5">
          <ChevronUpDownIcon className="size-4 text-subtle" aria-hidden />
        </span>
      </ListboxButton>

      <Transition
        as={Fragment}
        enter="transition duration-100 ease-out"
        enterFrom="opacity-0 -translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition duration-75 ease-in"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 -translate-y-1"
      >
        <ListboxOptions className="pretty-scroll absolute z-30 mt-1.5 w-full max-h-[60vh] overflow-y-auto rounded-lg bg-modal py-1 text-sm shadow-lg ring-1 ring-default focus:outline-none dark:ring-white/10">
          {themes.map(t => (
            <ListboxOption key={t.key} value={t.key} as={Fragment}>
              {({ active, selected }) => (
                <li
                  className={[
                    'relative cursor-pointer select-none mx-1 my-0.5 rounded-md py-2 pl-3 pr-9 flex items-center gap-3',
                    active ? 'bg-accent/10 text-text' : 'text-muted',
                  ].join(' ')}
                >
                  <span
                    className="size-4 shrink-0 rounded-full ring-1 ring-white/10 shadow-sm"
                    style={{ background: t.swatch }}
                    aria-hidden
                  />
                  <span className={`font-medium ${selected ? 'text-accent-strong' : ''}`}>{t.label}</span>
                  <span className="ml-auto flex gap-1" aria-hidden>
                    {t.bulbPalette.map(c => (
                      <span key={c} className="size-2.5 rounded-full ring-1 ring-white/10" style={{ background: c }} />
                    ))}
                  </span>
                  {selected && <CheckIcon className="absolute right-2.5 size-4 text-accent" aria-hidden />}
                </li>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Transition>
    </Listbox>
  )
}
