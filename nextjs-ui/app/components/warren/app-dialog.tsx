'use client'

import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { Fragment, type ReactNode } from 'react'

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
  return (
    <Transition show={open} as={Fragment} appear>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="duration-200 ease-out"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="duration-150 ease-in"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
            <TransitionChild
              as={Fragment}
              enter="duration-200 ease-out"
              enterFrom="opacity-0 translate-y-2 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="duration-150 ease-in"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-2 sm:scale-95"
            >
              <DialogPanel
                className={[
                  'relative w-full bg-modal text-text rounded-2xl shadow-2xl ring-1 ring-default/70 dark:ring-white/10',
                  'flex flex-col max-h-[88vh]',
                  maxWidthClass,
                ].join(' ')}
              >
                {title && (
                  <DialogTitle className="px-6 pt-5 pb-4 text-base font-semibold text-text border-b border-default">
                    {title}
                  </DialogTitle>
                )}
                {children}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
