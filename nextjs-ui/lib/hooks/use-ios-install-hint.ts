'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'warren:ios-hint-dismissed'

function detectIosSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isIosUa = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window)
  const isIpadOs = ua.includes('Macintosh') && (window.navigator.maxTouchPoints ?? 0) > 1
  if (!isIosUa && !isIpadOs) return false
  if (/CriOS|EdgiOS|FxiOS/.test(ua)) return false
  return true
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function useIosInstallHint() {
  const [dismissed, setDismissed] = useState(false)
  const [isIosSafari, setIsIosSafari] = useState(false)
  const [standalone, setStandalone] = useState(false)

  useEffect(() => {
    setIsIosSafari(detectIosSafari())
    setStandalone(detectStandalone())
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === '1')
    } catch {}
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
    try { window.localStorage.setItem(STORAGE_KEY, '1') } catch {}
  }, [])

  return { shouldShow: isIosSafari && !standalone && !dismissed, dismiss }
}
