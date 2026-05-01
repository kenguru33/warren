'use client'

import { useCallback, useEffect, useState } from 'react'

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
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [standalone, setStandalone] = useState(false)

  useEffect(() => {
    setStandalone(detectStandalone())
    if (window.__warrenDeferredInstall) {
      setPrompt(window.__warrenDeferredInstall)
      window.__warrenDeferredInstall = null
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
    }
    const onPromptReady = () => {
      if (window.__warrenDeferredInstall) {
        setPrompt(window.__warrenDeferredInstall)
        window.__warrenDeferredInstall = null
      }
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('warren:install-available', onPromptReady)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('warren:install-available', onPromptReady)
    }
  }, [])

  const canInstall = !!prompt && !standalone && !installed

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!prompt) return 'unavailable'
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      setPrompt(null)
      return choice.outcome
    } catch {
      setPrompt(null)
      return 'dismissed'
    }
  }, [prompt])

  return { canInstall, install, installed, standalone }
}
