'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  CpuChipIcon,
  LightBulbIcon,
  Squares2X2Icon,
  ChevronUpIcon,
} from '@heroicons/react/20/solid'
import { useSession } from '@/lib/hooks/use-session'
import {
  Sidebar,
  SidebarBody,
  SidebarDivider,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from '@/app/components/sidebar'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSection,
} from '@/app/components/dropdown'
import { Avatar, AvatarButton } from '@/app/components/avatar'
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

function BrandMark({ className }: { className?: string }) {
  // Tight viewBox (2:0 → 22:24, aspect 5:6) crops the empty horizontal padding
  // from the original 24x24 box so the rabbit visually fills its container at
  // a given height. Pair with `h-N w-auto` at call sites to preserve aspect.
  return (
    <svg className={className} viewBox="2 0 20 24" fill="none" aria-hidden>
      <ellipse cx="8.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
      <ellipse cx="15.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
      <circle cx="12" cy="17" r="6" fill="currentColor" />
      <circle cx="10" cy="16" r="0.9" className="fill-surface" />
      <circle cx="14" cy="16" r="0.9" className="fill-surface" />
    </svg>
  )
}

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loggedIn, clear } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

  useEffect(() => { setSidebarOpen(false) }, [pathname])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    clear()
    router.push('/login')
  }

  const initials = (user?.name ?? '?').slice(0, 1).toUpperCase()

  const userMenu = loggedIn && (
    <DropdownMenu className="min-w-72" anchor="top start">
      <DropdownSection>
        <div className="col-span-full px-3 py-2">
          <div className="mb-1.5 text-[0.65rem] font-semibold tracking-wider text-subtle uppercase">
            Color scheme
          </div>
          <ColorSchemePicker />
        </div>
        <div className="col-span-full flex items-center justify-between px-3 py-2">
          <span className="text-sm/5 text-text">Appearance</span>
          <ThemeToggle />
        </div>
      </DropdownSection>
      <DropdownDivider />
      <InstallMenuItem />
      <DropdownItem onClick={() => setShowChangePassword(true)}>
        <DropdownLabel>Change password</DropdownLabel>
      </DropdownItem>
      <DropdownItem onClick={logout}>
        <DropdownLabel>Sign out</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )

  return (
    <div className="relative isolate flex min-h-svh w-full bg-surface-2 max-lg:flex-col">
      {/* Desktop sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 max-lg:hidden">
        <Sidebar>
          <SidebarHeader>
            <Link href="/" className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-default">
              <BrandMark className="h-8 w-auto shrink-0 text-text" />
              <div className="flex flex-col">
                <span className="text-sm/5 font-semibold text-text">Warren</span>
                <span className="text-xs/4 text-subtle">Home dashboard</span>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarBody>
            <SidebarSection>
              {navLinks.map(link => {
                const Icon = link.icon
                return (
                  <SidebarItem key={link.to} href={link.to} current={pathname === link.to}>
                    <Icon data-slot="icon" />
                    <SidebarLabel>{link.label}</SidebarLabel>
                  </SidebarItem>
                )
              })}
            </SidebarSection>
          </SidebarBody>

          {loggedIn && (
            <SidebarFooter>
              <Dropdown>
                <DropdownButton
                  as="button"
                  className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-default focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Avatar
                    initials={initials}
                    className="size-9 bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm/5 font-medium text-text">{user?.name}</span>
                    <span className="block truncate text-xs/4 text-subtle">Signed in</span>
                  </span>
                  <ChevronUpIcon className="size-4 text-subtle" />
                </DropdownButton>
                {userMenu}
              </Dropdown>
            </SidebarFooter>
          )}
        </Sidebar>
      </div>

      {/* Mobile top bar — Material/Catalyst convention: [hamburger] [logo]
          on the left as a brand cluster, avatar on the far right. Hamburger
          and avatar use matching size-9 squares for visual symmetry; the
          BrandMark + wordmark sit between them at a slightly larger size
          than the icons so the brand reads as the visual anchor. */}
      <header className="flex h-14 items-center gap-3 px-3 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-default hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-white/10 dark:hover:text-white"
        >
          <Bars3Icon className="size-5" />
        </button>
        <Link href="/" className="flex min-w-0 items-center gap-2 rounded-lg p-1.5 hover:bg-default focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <BrandMark className="h-8 w-auto shrink-0 text-text" />
          <span className="text-base/6 font-semibold tracking-tight text-text">Warren</span>
        </Link>
        {loggedIn && (
          <div className="ml-auto flex shrink-0 items-center">
            <Dropdown>
              <DropdownButton
                as={AvatarButton}
                aria-label="User menu"
                initials={initials}
                className="size-9 bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
              />
              {userMenu}
            </Dropdown>
          </div>
        )}
      </header>

      {/* Mobile drawer — full Sidebar mirror of the desktop layout: brand
          header at the top, nav links in the body, user menu in the footer. */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden dark:bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-surface shadow-xl ring-1 ring-default lg:hidden dark:ring-white/10">
            <Sidebar>
              <SidebarHeader>
                <div className="flex items-center justify-between">
                  <Link href="/" className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-default">
                    <BrandMark className="h-8 w-auto shrink-0 text-text" />
                    <div className="flex flex-col">
                      <span className="text-sm/5 font-semibold text-text">Warren</span>
                      <span className="text-xs/4 text-subtle">Home dashboard</span>
                    </div>
                  </Link>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg p-2 text-muted hover:bg-default"
                    aria-label="Close navigation"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <XMarkIcon className="size-5" />
                  </button>
                </div>
              </SidebarHeader>

              <SidebarBody>
                <SidebarSection>
                  {navLinks.map(link => {
                    const Icon = link.icon
                    return (
                      <SidebarItem key={link.to} href={link.to} current={pathname === link.to}>
                        <Icon data-slot="icon" />
                        <SidebarLabel>{link.label}</SidebarLabel>
                      </SidebarItem>
                    )
                  })}
                </SidebarSection>
              </SidebarBody>

              {loggedIn && (
                <SidebarFooter>
                  <Dropdown>
                    <DropdownButton
                      as="button"
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-default focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <Avatar
                        initials={initials}
                        className="size-9 bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm/5 font-medium text-text">{user?.name}</span>
                        <span className="block truncate text-xs/4 text-subtle">Signed in</span>
                      </span>
                      <ChevronUpIcon className="size-4 text-subtle" />
                    </DropdownButton>
                    {userMenu}
                  </Dropdown>
                </SidebarFooter>
              )}
            </Sidebar>
          </div>
        </>
      )}

      <main className="flex flex-1 flex-col pb-2 lg:min-w-0 lg:pl-64 lg:pt-2 lg:pr-2">
        <div className="grow p-6 lg:rounded-lg lg:p-10 lg:ring-1 lg:ring-default dark:lg:ring-white/10">
          {children}
        </div>
      </main>

      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </div>
  )
}
