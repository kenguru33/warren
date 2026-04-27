<script setup lang="ts">
const { loggedIn, user, clear } = useUserSession()
const route = useRoute()
const sidebarOpen = ref(true)
const menuOpen = ref(false)
const showChangePassword = ref(false)
const userSectionRef = ref<HTMLElement | null>(null)

function handleResize() {
  sidebarOpen.value = window.innerWidth > 768
}

function handleDocumentClick(e: MouseEvent) {
  if (userSectionRef.value && !userSectionRef.value.contains(e.target as Node)) {
    menuOpen.value = false
  }
}

onMounted(() => {
  sidebarOpen.value = window.innerWidth > 768
  window.addEventListener('resize', handleResize)
  document.addEventListener('click', handleDocumentClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('click', handleDocumentClick)
})

watch(() => route.path, () => {
  if (window.innerWidth <= 768) sidebarOpen.value = false
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
  { to: '/', label: 'Dashboard' },
  { to: '/sensors', label: 'Sensors' },
  { to: '/lights', label: 'Lights' },
  { to: '/integrations/hue', label: 'Hue Bridge' },
]
</script>

<template>
  <div class="layout">
    <!-- Header — always visible, full width -->
    <header class="topbar">
      <button
        class="hamburger"
        :aria-label="sidebarOpen ? 'Close menu' : 'Open menu'"
        @click="sidebarOpen = !sidebarOpen"
      >
        <!-- Sidebar open: double chevron left = collapse -->
        <svg v-if="sidebarOpen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 17l-5-5 5-5"/>
          <path d="M18 17l-5-5 5-5"/>
        </svg>
        <!-- Sidebar closed: double chevron right = expand -->
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 7l5 5-5 5"/>
          <path d="M13 7l5 5-5 5"/>
        </svg>
      </button>
      <div class="brand">
        <svg class="brand-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Ears -->
          <ellipse cx="8.5" cy="6" rx="2.5" ry="5" fill="currentColor"/>
          <ellipse cx="15.5" cy="6" rx="2.5" ry="5" fill="currentColor"/>
          <!-- Inner ears -->
          <ellipse cx="8.5" cy="6.5" rx="1.2" ry="3.5" fill="#4a6fa5"/>
          <ellipse cx="15.5" cy="6.5" rx="1.2" ry="3.5" fill="#4a6fa5"/>
          <!-- Head -->
          <circle cx="12" cy="17" r="6" fill="currentColor"/>
          <!-- Eyes -->
          <circle cx="10" cy="16" r="0.9" fill="#161a26"/>
          <circle cx="14" cy="16" r="0.9" fill="#161a26"/>
          <!-- Nose -->
          <circle cx="12" cy="18.5" r="0.7" fill="#4a6fa5"/>
        </svg>
        <span class="brand-name">Warren</span>
      </div>
      <div v-if="loggedIn" ref="userSectionRef" class="user-section">
        <button class="btn-username" @click="menuOpen = !menuOpen">{{ user?.name }}</button>
        <div v-if="menuOpen" class="user-menu">
          <button class="menu-item" @click="openChangePassword">Change password</button>
          <button class="menu-item menu-item--danger" @click="logout">Log out</button>
        </div>
      </div>
      <ChangePasswordModal v-if="showChangePassword" @close="showChangePassword = false" />
    </header>

    <!-- Below header: sidebar + content -->
    <div class="body">
      <!-- Mobile overlay -->
      <Transition name="fade">
        <div v-if="sidebarOpen" class="overlay" @click="sidebarOpen = false" />
      </Transition>

      <!-- Sidebar — sits below header -->
      <aside class="sidebar" :class="{ open: sidebarOpen }">
        <nav class="sidebar-nav">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="nav-link"
            :class="{ active: route.path === link.to }"
          >
            {{ link.label }}
          </NuxtLink>
        </nav>
      </aside>

      <main class="main-content" :class="{ 'sidebar-visible': sidebarOpen }">
        <div class="page-frame">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ── Overall shell ───────────────────────────────────────── */
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ── Top header ──────────────────────────────────────────── */
.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: #161a26;
  border-bottom: 1px solid #2a2f45;
  z-index: 100;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.brand-name {
  font-size: 1.45rem;
  font-weight: 900;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, #f1f5f9 20%, #7ab3e0 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-icon {
  width: 38px;
  height: 38px;
  color: #e2e8f0;
  flex-shrink: 0;
  filter: drop-shadow(0 0 6px rgba(74, 111, 165, 0.5));
}

.user-section {
  position: relative;
  flex-shrink: 0;
}

.btn-username {
  background: none;
  color: #64748b;
  border: 1px solid #2a2f45;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.btn-username:hover {
  color: #e2e8f0;
  border-color: #4a6fa5;
}

.user-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: #1e2130;
  border: 1px solid #2a2f45;
  border-radius: 8px;
  padding: 4px;
  min-width: 160px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  background: none;
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.82rem;
  color: #94a3b8;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  width: 100%;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
}

.menu-item--danger {
  color: #f87171;
}

.menu-item--danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
}

/* ── Hamburger ───────────────────────────────────────────── */
.hamburger {
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  color: #64748b;
  transition: color 0.15s;
}

.hamburger:hover { color: #e2e8f0; }

.hamburger svg {
  width: 22px;
  height: 22px;
}

/* ── Body (sidebar + content) ────────────────────────────── */
.body {
  display: flex;
  flex: 1;
  padding-top: 64px;
}

/* ── Sidebar ─────────────────────────────────────────────── */
.sidebar {
  width: 200px;
  flex-shrink: 0;
  position: fixed;
  top: 64px;
  left: 0;
  bottom: 0;
  background: #161a26;
  border-right: 1px solid #2a2f45;
  display: flex;
  flex-direction: column;
  z-index: 60;
  transform: translateX(-100%);
  transition: transform 0.25s ease;
}

.sidebar.open {
  transform: translateX(0);
}

.sidebar-nav {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.nav-link {
  display: block;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  color: #64748b;
  text-decoration: none;
  transition: color 0.15s, background 0.15s;
}

.nav-link:hover {
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.04);
}

.nav-link.active {
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.07);
}

/* ── Main content ────────────────────────────────────────── */
.main-content {
  flex: 1;
  margin-left: 0;
  padding: 28px;
  transition: margin-left 0.25s ease;
}

.main-content.sidebar-visible {
  margin-left: 200px;
}

.page-frame {
  background: #161a26;
  border: 1px solid #2a2f45;
  border-radius: 12px;
  padding: 28px;
  max-width: 1200px;
}

/* ── Overlay (mobile only) ───────────────────────────────── */
.overlay {
  position: fixed;
  inset: 0;
  top: 64px;
  background: rgba(0, 0, 0, 0.55);
  z-index: 50;
}

.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

@media (min-width: 769px) {
  .overlay { display: none; }
}

@media (max-width: 768px) {
  .main-content,
  .main-content.sidebar-visible {
    margin-left: 0;
    padding: 16px;
  }

  .page-frame {
    padding: 20px 16px;
  }
}
</style>
