/**
 * Runtime color scheme switcher.
 *
 * A "scheme" is a (neutral ramp + accent color) preset defined in
 * `app/assets/css/main.css` via `:root[data-scheme="..."]` /
 * `.dark[data-scheme="..."]` blocks. We apply the current scheme by setting
 * `document.documentElement.dataset.scheme = key`.
 *
 * Orthogonal to dark/light mode — `useTheme()` controls that via the `.dark`
 * class. Both axes persist independently in localStorage.
 */

export type ColorSchemeKey =
  | 'zinc-indigo'
  | 'slate-sky'
  | 'stone-amber'
  | 'neutral-emerald'
  | 'gray-rose'
  | 'zinc-violet'

export const COLOR_SCHEME_KEYS: readonly ColorSchemeKey[] = [
  'zinc-indigo',
  'slate-sky',
  'stone-amber',
  'neutral-emerald',
  'gray-rose',
  'zinc-violet',
] as const

const STORAGE_KEY = 'warren:scheme'
const DEFAULT_SCHEME: ColorSchemeKey = 'zinc-indigo'

function isValidScheme(v: unknown): v is ColorSchemeKey {
  return typeof v === 'string' && (COLOR_SCHEME_KEYS as readonly string[]).includes(v)
}

function readStored(): ColorSchemeKey {
  if (typeof window === 'undefined') return DEFAULT_SCHEME
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return isValidScheme(v) ? v : DEFAULT_SCHEME
  } catch {
    return DEFAULT_SCHEME
  }
}

function applyToDocument(key: ColorSchemeKey) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.scheme = key
}

function persist(key: ColorSchemeKey) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, key)
  } catch {
    // private mode etc — silently ignore
  }
}

export function useColorScheme() {
  const colorScheme = useState<ColorSchemeKey>('warren:scheme', () => DEFAULT_SCHEME)

  function setColorScheme(key: ColorSchemeKey) {
    if (!isValidScheme(key)) return
    colorScheme.value = key
    applyToDocument(key)
    persist(key)
  }

  function cycleColorScheme() {
    const idx = COLOR_SCHEME_KEYS.indexOf(colorScheme.value)
    const next = COLOR_SCHEME_KEYS[(idx + 1) % COLOR_SCHEME_KEYS.length]!
    setColorScheme(next)
  }

  function syncFromStorage() {
    const stored = readStored()
    colorScheme.value = stored
    applyToDocument(stored)
  }

  return { colorScheme, setColorScheme, cycleColorScheme, syncFromStorage }
}
