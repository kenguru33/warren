<script setup lang="ts">
import {
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  CpuChipIcon,
  LightBulbIcon,
  Squares2X2Icon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/vue/20/solid'

const { loggedIn, user, clear } = useUserSession()
const route = useRoute()
const sidebarOpen = ref(false) // mobile drawer
const menuOpen = ref(false)
const showChangePassword = ref(false)
const userSectionDesktopRef = ref<HTMLElement | null>(null)
const userSectionMobileRef = ref<HTMLElement | null>(null)

function handleDocumentClick(e: MouseEvent) {
  const t = e.target as Node
  const insideDesktop = userSectionDesktopRef.value?.contains(t) ?? false
  const insideMobile = userSectionMobileRef.value?.contains(t) ?? false
  if (!insideDesktop && !insideMobile) menuOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})

watch(() => route.path, () => {
  sidebarOpen.value = false
  menuOpen.value = false
})

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}

function openChangePassword() {
  menuOpen.value = false
  showChangePassword.value = true
}

const navLinks = [
  { to: '/', label: 'Dashboard', icon: HomeIcon },
  { to: '/sensors', label: 'Sensors', icon: CpuChipIcon },
  { to: '/lights', label: 'Lights', icon: LightBulbIcon },
  { to: '/integrations/hue', label: 'Hue Bridge', icon: Squares2X2Icon },
]

const initial = computed(() => (user.value?.name ?? '?').slice(0, 1).toUpperCase())
</script>

<template>
  <!-- Catalyst SidebarLayout: tinted shell, surface main panel "card" -->
  <div class="relative isolate flex min-h-svh w-full bg-surface max-lg:flex-col lg:bg-surface-2">

    <!-- ─── Sidebar (desktop) ─────────────────────────────────────── -->
    <div class="fixed inset-y-0 left-0 w-64 max-lg:hidden">
      <nav class="flex h-full min-h-0 flex-col">
        <!-- Brand header -->
        <div class="flex flex-col border-b border-default p-4">
          <NuxtLink to="/" class="flex items-center gap-3 rounded-lg p-1.5 hover:bg-default">
            <svg class="size-8 shrink-0 text-text" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <ellipse cx="8.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
              <ellipse cx="15.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
              <circle cx="12" cy="17" r="6" fill="currentColor" />
              <circle cx="10" cy="16" r="0.9" class="fill-surface" />
              <circle cx="14" cy="16" r="0.9" class="fill-surface" />
            </svg>
            <div class="flex flex-col">
              <span class="text-sm/5 font-semibold text-text">Warren</span>
              <span class="text-xs/4 text-subtle">Home dashboard</span>
            </div>
          </NuxtLink>
        </div>

        <!-- Nav links (scrollable) -->
        <div class="flex flex-1 flex-col gap-0.5 overflow-y-auto p-4">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            :class="[
              'group relative flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm/5 font-medium',
              route.path === link.to
                ? 'bg-accent-soft text-accent-strong ring-1 ring-inset ring-accent/30'
                : 'text-muted hover:bg-default hover:text-text',
            ]"
          >
            <component
              :is="link.icon"
              :class="[
                'size-5 shrink-0',
                route.path === link.to
                  ? 'text-accent-strong'
                  : 'text-subtle group-hover:text-text',
              ]"
            />
            <span class="truncate">{{ link.label }}</span>
          </NuxtLink>
        </div>

        <!-- User footer + dropdown (desktop) -->
        <div v-if="loggedIn" ref="userSectionDesktopRef" class="relative border-t border-default p-3">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-default"
            @click="menuOpen = !menuOpen"
          >
            <span class="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-medium text-white dark:bg-white dark:text-stone-950">
              {{ initial }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm/5 font-medium text-text">{{ user?.name }}</span>
              <span class="block truncate text-xs/4 text-subtle">Signed in</span>
            </span>
            <ChevronUpIcon class="size-4 text-subtle" />
          </button>
          <Transition
            enter-active-class="transition duration-100 ease-out"
            enter-from-class="transform opacity-0 scale-95"
            enter-to-class="transform opacity-100 scale-100"
            leave-active-class="transition duration-75 ease-in"
            leave-from-class="transform opacity-100 scale-100"
            leave-to-class="transform opacity-0 scale-95"
          >
            <div
              v-if="menuOpen"
              class="absolute bottom-full left-3 right-3 mb-2 origin-bottom rounded-xl bg-modal p-2 shadow-lg ring-1 ring-default focus:outline-none dark:ring-white/10"
            >
              <div class="px-2 pt-1 pb-2 space-y-3">
                <div>
                  <div class="text-[0.65rem] font-semibold uppercase tracking-wider text-subtle mb-1.5">Color scheme</div>
                  <ColorSchemePicker />
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm/5 text-text">Appearance</span>
                  <ThemeToggle />
                </div>
              </div>
              <div class="my-1 border-t border-default" />
              <button
                class="block w-full rounded-md px-3 py-2 text-left text-sm/5 text-text hover:bg-default"
                @click="openChangePassword"
              >
                Change password
              </button>
              <button
                class="block w-full rounded-md px-3 py-2 text-left text-sm/5 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                @click="logout"
              >
                Sign out
              </button>
            </div>
          </Transition>
        </div>
      </nav>
    </div>

    <!-- ─── Mobile top bar ─────────────────────────────────────────── -->
    <header class="flex items-center px-4 lg:hidden">
      <div class="py-2.5">
        <button
          type="button"
          class="-ml-1 inline-flex items-center justify-center rounded-lg p-2 text-muted hover:bg-default"
          aria-label="Open navigation"
          @click="sidebarOpen = true"
        >
          <Bars3Icon class="size-5" />
        </button>
      </div>
      <NuxtLink to="/" class="min-w-0 flex-1 ml-2 flex items-center gap-2">
        <svg class="size-7 shrink-0 text-text" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <ellipse cx="8.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
          <ellipse cx="15.5" cy="6" rx="2.5" ry="5" fill="currentColor" />
          <circle cx="12" cy="17" r="6" fill="currentColor" />
        </svg>
        <span class="text-sm/5 font-semibold tracking-tight text-text">Warren</span>
      </NuxtLink>

      <!-- User pill + dropdown (mobile) -->
      <div v-if="loggedIn" ref="userSectionMobileRef" class="relative">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-full bg-default p-1 pr-3 hover:bg-surface-2"
          @click="menuOpen = !menuOpen"
        >
          <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-medium text-white dark:bg-white dark:text-stone-950">
            {{ initial }}
          </span>
          <ChevronDownIcon class="size-4 text-subtle" />
        </button>
        <Transition
          enter-active-class="transition duration-100 ease-out"
          enter-from-class="transform opacity-0 scale-95"
          enter-to-class="transform opacity-100 scale-100"
          leave-active-class="transition duration-75 ease-in"
          leave-from-class="transform opacity-100 scale-100"
          leave-to-class="transform opacity-0 scale-95"
        >
          <div
            v-if="menuOpen"
            class="absolute right-0 top-full mt-2 w-64 origin-top-right rounded-xl bg-modal p-2 shadow-lg ring-1 ring-default focus:outline-none dark:ring-white/10 z-30"
          >
            <div class="px-2 pt-1 pb-2 space-y-3">
              <div class="text-sm/5 font-medium text-text truncate">{{ user?.name }}</div>
              <div>
                <div class="text-[0.65rem] font-semibold uppercase tracking-wider text-subtle mb-1.5">Color scheme</div>
                <ColorSchemePicker />
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm/5 text-text">Appearance</span>
                <ThemeToggle />
              </div>
            </div>
            <div class="my-1 border-t border-default" />
            <button
              class="block w-full rounded-md px-3 py-2 text-left text-sm/5 text-text hover:bg-default"
              @click="openChangePassword"
            >
              Change password
            </button>
            <button
              class="block w-full rounded-md px-3 py-2 text-left text-sm/5 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              @click="logout"
            >
              Sign out
            </button>
          </div>
        </Transition>
      </div>
    </header>

    <!-- ─── Mobile drawer ──────────────────────────────────────────── -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 z-40 bg-black/30 dark:bg-black/60 lg:hidden"
        @click="sidebarOpen = false"
      />
    </Transition>
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="-translate-x-full"
    >
      <div
        v-if="sidebarOpen"
        class="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface p-2 shadow-xl ring-1 ring-default lg:hidden dark:ring-white/10"
      >
        <div class="flex items-center justify-between p-2">
          <span class="text-sm/5 font-semibold text-text">Warren</span>
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-lg p-2 text-muted hover:bg-default"
            aria-label="Close navigation"
            @click="sidebarOpen = false"
          >
            <XMarkIcon class="size-5" />
          </button>
        </div>
        <div class="mt-2 flex flex-col gap-0.5 px-2">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            :class="[
              'flex items-center gap-3 rounded-lg px-2 py-2 text-sm/5 font-medium',
              route.path === link.to
                ? 'bg-accent-soft text-accent-strong ring-1 ring-inset ring-accent/30'
                : 'text-muted hover:bg-default hover:text-text',
            ]"
          >
            <component
              :is="link.icon"
              :class="[
                'size-5 shrink-0',
                route.path === link.to
                  ? 'text-accent-strong'
                  : 'text-subtle',
              ]"
            />
            {{ link.label }}
          </NuxtLink>
        </div>
      </div>
    </Transition>

    <!-- ─── Main content panel ────────────────────────────────────── -->
    <main class="flex flex-1 flex-col pb-2 lg:min-w-0 lg:pl-64 lg:pr-2 lg:pt-2">
      <div class="grow p-6 lg:rounded-lg lg:bg-surface lg:p-10 lg:shadow-sm lg:ring-1 lg:ring-default dark:lg:ring-white/10">
        <slot />
      </div>
    </main>

    <ChangePasswordModal v-if="showChangePassword" @close="showChangePassword = false" />
  </div>
</template>
