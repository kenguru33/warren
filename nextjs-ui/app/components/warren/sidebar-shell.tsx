'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  CpuChipIcon,
  LightBulbIcon,
  Squares2X2Icon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/20/solid'
import { useSession } from '@/lib/hooks/use-session'
import { ColorSchemePicker } from './color-scheme-picker'
import { ThemeToggle } from './theme-toggle'
import { InstallMenuItem } from './install-menu-item'
import { ChangePasswordModal } from './change-password-modal'

const navLinks = [
  { to: '/', label: 'Dashboard', icon: HomeIcon },
  { to: '/sensors', label: 'Sensors', icon: CpuChipIcon },
  { to: '/lights', label: 'Lights', icon: LightBulbIcon },
  { to: '/integrations/hue', label: 'Hue Bridge', icon: Squares2X2Icon },
]

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loggedIn, clear } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const userSectionDesktopRef = useRef<HTMLDivElement | null>(null)
  const userSectionMobileRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { setSidebarOpen(false); setMenuOpen(false) }, [pathname])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      const insideDesktop = userSectionDesktopRef.current?.contains(t) ?? false
      const insideMobile = userSectionMobileRef.current?.contains(t) ?? false
      if (!insideDesktop && !insideMobile) setMenuOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    clear()
    router.push('/login')
  }

  const initial = (user?.name ?? '?').slice(0, 1).toUpperCase()

  return (
    <div className="relative isolate flex min-h-svh w-full bg-surface max-lg:flex-col lg:bg-surface-2">
      {/* Desktop sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 max-lg:hidden">
        <nav className="flex h-full min-h-0 flex-col">
          <div className="flex flex-col border-b border-default p-4">
            <Link href="/" className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-default">
              <svg className="size-8 shrink-0 text-text" viewBox="0 0 24 24" fill="none" aria-hidden>
                <ellipse cx="8.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
                <ellipse cx="15.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
                <circle cx="12" cy="17" r="6" fill="currentColor" />
                <circle cx="10" cy="16" r="0.9" className="fill-surface" />
                <circle cx="14" cy="16" r="0.9" className="fill-surface" />
              </svg>
              <div className="flex flex-col">
                <span className="text-sm/5 font-semibold text-text">Warren</span>
                <span className="text-xs/4 text-subtle">Home dashboard</span>
              </div>
            </Link>
          </div>

          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-4">
            {navLinks.map(link => {
              const active = pathname === link.to
              const Icon = link.icon
              return (
                <Link
                  key={link.to}
                  href={link.to}
                  className={`group relative flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm/5 font-medium ${
                    active
                      ? 'bg-accent-soft text-accent-strong ring-1 ring-inset ring-accent/30'
                      : 'text-muted hover:bg-default hover:text-text'
                  }`}
                >
                  <Icon className={`size-5 shrink-0 ${active ? 'text-accent-strong' : 'text-subtle group-hover:text-text'}`} />
                  <span className="truncate">{link.label}</span>
                </Link>
              )
            })}
          </div>

          {loggedIn && (
            <div ref={userSectionDesktopRef} className="relative border-t border-default p-3">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-default"
                onClick={() => setMenuOpen(o => !o)}
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-medium text-white dark:bg-white dark:text-stone-950">
                  {initial}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm/5 font-medium text-text">{user?.name}</span>
                  <span className="block truncate text-xs/4 text-subtle">Signed in</span>
                </span>
                <ChevronUpIcon className="size-4 text-subtle" />
              </button>
              {menuOpen && (
                <div className="absolute bottom-full left-3 right-3 mb-2 origin-bottom rounded-xl bg-modal p-2 shadow-lg ring-1 ring-default focus:outline-none dark:ring-white/10">
                  <div className="px-2 pt-1 pb-2 space-y-3">
                    <div>
                      <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-subtle mb-1.5">Color scheme</div>
                      <ColorSchemePicker />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm/5 text-text">Appearance</span>
                      <ThemeToggle />
                    </div>
                  </div>
                  <div className="my-1 border-t border-default" />
                  <InstallMenuItem />
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setShowChangePassword(true) }}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm/5 text-text hover:bg-default"
                  >
                    Change password
                  </button>
                  <button
                    onClick={logout}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm/5 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>

      {/* Mobile top bar */}
      <header className="flex items-center px-4 lg:hidden">
        <div className="py-2.5">
          <button
            type="button"
            className="-ml-1 inline-flex items-center justify-center rounded-lg p-2 text-muted hover:bg-default"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="size-5" />
          </button>
        </div>
        <Link href="/" className="min-w-0 flex-1 ml-2 flex items-center gap-2">
          <svg className="size-7 shrink-0 text-text" viewBox="0 0 24 24" fill="none" aria-hidden>
            <ellipse cx="8.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
            <ellipse cx="15.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
            <circle cx="12" cy="17" r="6" fill="currentColor" />
          </svg>
          <span className="text-sm/5 font-semibold tracking-tight text-text">Warren</span>
        </Link>

        {loggedIn && (
          <div ref={userSectionMobileRef} className="relative">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-default p-1 pr-3 hover:bg-surface-2"
              onClick={() => setMenuOpen(o => !o)}
            >
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-medium text-white dark:bg-white dark:text-stone-950">
                {initial}
              </span>
              <ChevronDownIcon className="size-4 text-subtle" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 origin-top-right rounded-xl bg-modal p-2 shadow-lg ring-1 ring-default focus:outline-none dark:ring-white/10 z-30">
                <div className="px-2 pt-1 pb-2 space-y-3">
                  <div className="text-sm/5 font-medium text-text truncate">{user?.name}</div>
                  <div>
                    <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-subtle mb-1.5">Color scheme</div>
                    <ColorSchemePicker />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm/5 text-text">Appearance</span>
                    <ThemeToggle />
                  </div>
                </div>
                <div className="my-1 border-t border-default" />
                <button
                  onClick={logout}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm/5 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface p-2 shadow-xl ring-1 ring-default lg:hidden dark:ring-white/10">
            <div className="flex items-center justify-between p-2">
              <span className="text-sm/5 font-semibold text-text">Warren</span>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg p-2 text-muted hover:bg-default"
                aria-label="Close navigation"
                onClick={() => setSidebarOpen(false)}
              >
                <XMarkIcon className="size-5" />
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-0.5 px-2">
              {navLinks.map(link => {
                const active = pathname === link.to
                const Icon = link.icon
                return (
                  <Link
                    key={link.to}
                    href={link.to}
                    className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm/5 font-medium ${
                      active
                        ? 'bg-accent-soft text-accent-strong ring-1 ring-inset ring-accent/30'
                        : 'text-muted hover:bg-default hover:text-text'
                    }`}
                  >
                    <Icon className={`size-5 shrink-0 ${active ? 'text-accent-strong' : 'text-subtle'}`} />
                    {link.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}

      <main className="flex flex-1 flex-col pb-2 lg:min-w-0 lg:pl-64 lg:pr-2 lg:pt-2">
        <div className="grow p-6 lg:rounded-lg lg:bg-surface lg:p-10 lg:shadow-sm lg:ring-1 lg:ring-default dark:lg:ring-white/10">
          {children}
        </div>
      </main>

      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </div>
  )
}
