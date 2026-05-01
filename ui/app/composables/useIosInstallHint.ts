const STORAGE_KEY = 'warren:ios-hint-dismissed'

function detectIosSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isIosUa = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window)
  // iPadOS Safari reports as Macintosh with touch points >= 1
  const isIpadOs = ua.includes('Macintosh') && (window.navigator.maxTouchPoints ?? 0) > 1
  if (!isIosUa && !isIpadOs) return false
  // Exclude in-app browsers (Chrome, Edge, Firefox on iOS) — they share WebKit
  // but Share -> Add to Home Screen lives in Safari only.
  if (/CriOS|EdgiOS|FxiOS/.test(ua)) return false
  return true
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function useIosInstallHint() {
  const dismissed = useState<boolean>(STORAGE_KEY, () => false)
  const isIosSafari = useState<boolean>('warren:is-ios-safari', () => false)
  const standalone = useState<boolean>('warren:standalone', () => false)

  onMounted(() => {
    isIosSafari.value = detectIosSafari()
    standalone.value = detectStandalone()
    try {
      dismissed.value = window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      dismissed.value = false
    }
  })

  function dismiss() {
    dismissed.value = true
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // ignore
    }
  }

  const shouldShow = computed(() => isIosSafari.value && !standalone.value && !dismissed.value)

  return { shouldShow, dismiss }
}
