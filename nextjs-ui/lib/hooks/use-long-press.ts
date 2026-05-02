'use client'

import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'

/**
 * Long-press hook with scroll-vs-press disambiguation.
 *
 * Returns pointer event handlers to spread onto an element, plus a
 * `wasLongPressRef` that consumers should check at the top of `onClick` to
 * suppress a tap that immediately follows a long-press fire.
 *
 * Cancels on `pointermove` >6px from the start point, so a touch user
 * scrolling past the element doesn't trigger the handler.
 */
export function useLongPress(
  handler: () => void,
  { ms = 500, moveTolerance = 6 }: { ms?: number; moveTolerance?: number } = {},
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const wasLongPressRef = useRef(false)
  const handlerRef = useRef(handler)

  useEffect(() => { handlerRef.current = handler }, [handler])

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }, [])

  useEffect(() => clear, [clear])

  const onPointerDown = useCallback((e: PointerEvent) => {
    // Ignore secondary buttons and stylus eraser; let right-click pass through to onContextMenu.
    if (e.button !== 0 && e.pointerType !== 'touch') return
    startRef.current = { x: e.clientX, y: e.clientY }
    wasLongPressRef.current = false
    clear()
    timerRef.current = setTimeout(() => {
      wasLongPressRef.current = true
      handlerRef.current()
      timerRef.current = null
    }, ms)
  }, [clear, ms])

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!startRef.current) return
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    if (dx * dx + dy * dy > moveTolerance * moveTolerance) clear()
  }, [clear, moveTolerance])

  const onPointerUp = useCallback(() => {
    clear()
    if (wasLongPressRef.current) {
      // Reset on next tick so the immediate `onClick` from this touch sees
      // wasLongPress=true; subsequent clicks see false.
      setTimeout(() => { wasLongPressRef.current = false }, 0)
    }
  }, [clear])

  const onPointerLeave = onPointerUp
  const onPointerCancel = onPointerUp

  // Right-click + iOS callout fallback: fire the handler immediately.
  const onContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault()
    handlerRef.current()
  }, [])

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel, onContextMenu },
    wasLongPressRef,
  }
}
