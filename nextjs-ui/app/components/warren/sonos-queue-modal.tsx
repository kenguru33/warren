'use client'

import { useCallback, useState } from 'react'
import {
  PlayIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon,
  SpeakerWaveIcon, ArrowTopRightOnSquareIcon,
} from '@heroicons/react/20/solid'
import { Dialog, DialogTitle, DialogBody, DialogActions } from '@/app/components/dialog'
import { Button } from '@/app/components/button'
import { Text } from '@/app/components/text'
import { useSonosQueue } from '@/lib/hooks/use-music'

/** Where content is actually chosen — the LAN surface cannot reach the services. */
const SONOS_WEB_APP = 'https://play.sonos.com'

/**
 * The Sonos queue.
 *
 * This exists instead of a catalogue browser because the speaker's content
 * directory does not expose the household's linked music services at all — the
 * only content it enumerates is the favorites Warren already shows. The queue
 * is the one surface worth adding, and choosing new content stays in Sonos's
 * own clients, reached by the link at the foot of this dialog.
 *
 * Every control is an explicit tap target. The wall panel has no pointer and no
 * keyboard, so there is no drag-to-reorder — a drag gesture on a scrolling list
 * fights the scroll — and nothing is hover-revealed.
 */
export function SonosQueueModal({
  open,
  targetId,
  targetName,
  onClose,
}: {
  open: boolean
  targetId: string | null
  targetName: string
  onClose: () => void
}) {
  const { queue, queueError, queueLoading, actOnQueue } = useSonosQueue(open ? targetId : null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const run = useCallback(async (
    action: 'play' | 'remove' | 'move',
    index: number,
    toIndex?: number,
  ) => {
    setBusy(true)
    setActionError(null)
    try {
      await actOnQueue(action, index, toIndex)
    } catch (err) {
      // The list is re-read from the server on success; on failure the existing
      // list stands rather than showing a change that did not happen.
      setActionError(err instanceof Error ? err.message : 'That did not work')
    } finally {
      setBusy(false)
    }
  }, [actOnQueue])

  const entries = queue?.entries ?? []

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>Queue — {targetName}</DialogTitle>

      <DialogBody>
        {actionError && <Text className="mb-3 text-error">{actionError}</Text>}

        {queueError ? (
          <Text className="text-error">{queueError}</Text>
        ) : queueLoading && !queue ? (
          <Text className="text-muted">Reading the queue…</Text>
        ) : queue?.mode === 'stream' ? (
          // A radio stream is not an empty queue, and saying "nothing queued"
          // would be wrong: the room is playing, just not from a queue.
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <SpeakerWaveIcon className="size-8 text-muted" aria-hidden="true" />
            <Text className="text-subtle">
              A radio stream is playing. Radio has no queue — anything below it is
              left over from earlier.
            </Text>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Text className="text-subtle">
              Nothing queued. Choose music in the Sonos app and it will appear here.
            </Text>
          </div>
        ) : (
          <ul className="pretty-scroll max-h-[60vh] divide-y divide-default/60 overflow-y-auto dark:divide-white/5">
            {entries.map(entry => (
              <li
                key={entry.index}
                className={`flex items-center gap-2 py-2 ${entry.isCurrent ? 'bg-accent-soft/40 rounded-lg px-2' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => run('play', entry.index)}
                  disabled={busy}
                  aria-label={`Play ${entry.title}`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-40"
                >
                  <PlayIcon
                    className={`size-4 shrink-0 ${entry.isCurrent ? 'text-accent-strong' : 'text-muted'}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-text">{entry.title}</span>
                    {entry.artist && (
                      <span className="block truncate text-xs text-subtle">{entry.artist}</span>
                    )}
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => run('move', entry.index, entry.index - 1)}
                    disabled={busy || entry.index === 1}
                    aria-label={`Move ${entry.title} up`}
                    className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-text disabled:opacity-30"
                  >
                    <ChevronUpIcon className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => run('move', entry.index, entry.index + 1)}
                    disabled={busy || entry.index === entries.length}
                    aria-label={`Move ${entry.title} down`}
                    className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-text disabled:opacity-30"
                  >
                    <ChevronDownIcon className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => run('remove', entry.index)}
                    disabled={busy}
                    aria-label={`Remove ${entry.title}`}
                    className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-error disabled:opacity-30"
                  >
                    <TrashIcon className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogBody>

      <DialogActions>
        {/*
          A link, never a frame: play.sonos.com is authentication-gated, so an
          embed would depend on a third-party session inside a cross-origin
          frame served from a private hostname.
        */}
        <a
          href={SONOS_WEB_APP}
          target="_blank"
          rel="noreferrer"
          className="mr-auto inline-flex items-center gap-1.5 text-sm text-accent-strong underline"
        >
          Choose music in Sonos
          <ArrowTopRightOnSquareIcon className="size-3.5" aria-hidden="true" />
        </a>
        <Button plain onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
