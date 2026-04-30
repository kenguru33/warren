import type { ThemeMode } from '../../shared/utils/light-themes'

const STORAGE_KEY = 'warren:theme'

function readStored(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyToDocument(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (mode === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

function persist(mode: ThemeMode) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Private mode etc. — silently ignore; the in-memory state still works
    // for the current session.
  }
}

export function useTheme() {
  // useState gives us a single shared ref across components.
  const theme = useState<ThemeMode>('warren:theme', () => 'dark')

  function setTheme(mode: ThemeMode) {
    theme.value = mode
    applyToDocument(mode)
    persist(mode)
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function syncFromStorage() {
    const stored = readStored()
    theme.value = stored
    applyToDocument(stored)
  }

  return { theme, setTheme, toggleTheme, syncFromStorage }
}
