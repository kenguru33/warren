interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare global {
  interface Window {
    __warrenDeferredInstall: BeforeInstallPromptEvent | null
  }
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function useInstallPrompt() {
  const prompt = useState<BeforeInstallPromptEvent | null>('warren:install-prompt', () => null)
  const installed = useState<boolean>('warren:installed', () => false)
  const standalone = useState<boolean>('warren:standalone', () => false)

  function captureFromWindow() {
    if (typeof window === 'undefined') return
    if (window.__warrenDeferredInstall) {
      prompt.value = window.__warrenDeferredInstall
      window.__warrenDeferredInstall = null
    }
  }

  function onPromptReady() {
    captureFromWindow()
  }

  function onBeforeInstall(e: Event) {
    e.preventDefault()
    prompt.value = e as BeforeInstallPromptEvent
  }

  function onInstalled() {
    installed.value = true
    prompt.value = null
  }

  onMounted(() => {
    standalone.value = detectStandalone()
    captureFromWindow()
    window.addEventListener('warren:install-prompt-ready', onPromptReady)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
  })

  onBeforeUnmount(() => {
    if (typeof window === 'undefined') return
    window.removeEventListener('warren:install-prompt-ready', onPromptReady)
    window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    window.removeEventListener('appinstalled', onInstalled)
  })

  const canInstall = computed(() => !!prompt.value && !standalone.value && !installed.value)

  async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const ev = prompt.value
    if (!ev) return 'unavailable'
    try {
      await ev.prompt()
      const choice = await ev.userChoice
      prompt.value = null
      return choice.outcome
    } catch {
      prompt.value = null
      return 'dismissed'
    }
  }

  return { canInstall, install, installed, standalone }
}
