// Curated color themes for light groups. Each theme drives:
//   1. The LightGroupTile UI (off-border, on-state border + gradient, glow, bulb tint).
//   2. The ACTUAL bulb colors when the group is turned on — `bulbPalette` is distributed
//      round-robin to color-capable members; each member gets one hex from the palette,
//      converted to CIE xy chromaticity for the Hue API.

export type LightThemeKey =
  | 'warmLight'
  | 'everyday'
  | 'readingLight'
  | 'nightlight'
  | 'slate'
  | 'amber'
  | 'emerald'
  | 'rose'
  | 'indigo'
  | 'teal'
  | 'plum'
  | 'terracotta'
  | 'catppuccin'
  | 'tokyoNight'
  | 'dracula'
  | 'nord'
  | 'gruvbox'

// 'palette' is the default; when omitted the theme drives bulb color round-robin
// from `bulbPalette` (the existing color-theme behaviour). 'white' presets pin a
// specific Hue mirek (color temperature) AND a brightness target.
export type BulbOutput =
  | { kind: 'palette' }
  | { kind: 'white'; mirek: number; brightness: number }

export const WHITE_PRESET_KEYS: LightThemeKey[] = ['warmLight', 'everyday', 'readingLight', 'nightlight']

export interface LightThemeSurfaceVariant {
  offBorder: string
  onBorder: string
  onGlow: string
  onGradientFrom: string
  onGradientTo: string
  mixedRingOverride?: string
}

export interface LightTheme extends LightThemeSurfaceVariant {
  key: LightThemeKey
  label: string
  swatch: string
  bulbTint: string
  toggleOnBg: string
  bulbPalette: string[]
  bulbOutput?: BulbOutput
  light?: LightThemeSurfaceVariant
}

export type ThemeMode = 'light' | 'dark'

const MIXED_DEFAULT = 'rgba(168, 85, 247, 0.45)'
const MIXED_AMBER_OVERRIDE = 'rgba(251, 191, 36, 0.55)'

export const LIGHT_THEMES: Record<LightThemeKey, LightTheme> = {
  warmLight: {
    key: 'warmLight',
    label: 'Warm Light',
    swatch: '#ffd9a8',
    offBorder: '#3a2e1f',
    onBorder: '#d4a373',
    onGlow: 'rgba(255, 217, 168, 0.45)',
    onGradientFrom: '#2a2218',
    onGradientTo: '#151825',
    bulbTint: 'rgba(255, 217, 168, 0.55)',
    toggleOnBg: '#a06a37',
    bulbOutput: { kind: 'white', mirek: 370, brightness: 60 },
    bulbPalette: ['#ffd9a8', '#ffe6c4', '#fff1de'],
    light: {
      offBorder: '#fde4c4',
      onBorder: '#a06a37',
      onGlow: 'rgba(160, 106, 55, 0.25)',
      onGradientFrom: '#fff7ee',
      onGradientTo: '#ffffff',
    },
  },
  everyday: {
    key: 'everyday',
    label: 'Everyday',
    swatch: '#fff1de',
    offBorder: '#2c2a26',
    onBorder: '#cdbfa6',
    onGlow: 'rgba(255, 241, 222, 0.4)',
    onGradientFrom: '#262421',
    onGradientTo: '#151825',
    bulbTint: 'rgba(255, 241, 222, 0.45)',
    toggleOnBg: '#857b6a',
    bulbOutput: { kind: 'white', mirek: 286, brightness: 100 },
    bulbPalette: ['#fff1de', '#fff8ec', '#ffffff'],
    light: {
      offBorder: '#e7dfd0',
      onBorder: '#857b6a',
      onGlow: 'rgba(133, 123, 106, 0.18)',
      onGradientFrom: '#faf7f2',
      onGradientTo: '#ffffff',
    },
  },
  readingLight: {
    key: 'readingLight',
    label: 'Reading Light',
    swatch: '#dce8ff',
    offBorder: '#1f2733',
    onBorder: '#9fb6e0',
    onGlow: 'rgba(220, 232, 255, 0.45)',
    onGradientFrom: '#1c2230',
    onGradientTo: '#151825',
    bulbTint: 'rgba(220, 232, 255, 0.55)',
    toggleOnBg: '#5b7bb8',
    bulbOutput: { kind: 'white', mirek: 222, brightness: 100 },
    bulbPalette: ['#dce8ff', '#eaf2ff', '#ffffff'],
    light: {
      offBorder: '#cfdbef',
      onBorder: '#5b7bb8',
      onGlow: 'rgba(91, 123, 184, 0.22)',
      onGradientFrom: '#eef3fb',
      onGradientTo: '#ffffff',
    },
  },
  nightlight: {
    key: 'nightlight',
    label: 'Nightlight',
    swatch: '#ffb98a',
    offBorder: '#241a14',
    onBorder: '#7a4f30',
    onGlow: 'rgba(255, 185, 138, 0.18)',
    onGradientFrom: '#1d1814',
    onGradientTo: '#151215',
    bulbTint: 'rgba(255, 185, 138, 0.30)',
    toggleOnBg: '#5a3820',
    bulbOutput: { kind: 'white', mirek: 454, brightness: 10 },
    bulbPalette: ['#ffb98a', '#ffcca8', '#ffe2c8'],
    light: {
      offBorder: '#e8d5c2',
      onBorder: '#7a4f30',
      onGlow: 'rgba(122, 79, 48, 0.18)',
      onGradientFrom: '#fbf2e8',
      onGradientTo: '#ffffff',
    },
  },
  slate: {
    key: 'slate',
    label: 'Slate',
    swatch: '#6b8cc7',
    offBorder: '#2a2f45',
    onBorder: '#4a6fa5',
    onGlow: 'rgba(160, 196, 255, 0.4)',
    onGradientFrom: '#1d2238',
    onGradientTo: '#151825',
    bulbTint: 'rgba(160, 196, 255, 0.45)',
    toggleOnBg: '#4a6fa5',
    bulbPalette: ['#a0c4ff', '#6b8cc7', '#cbd5e1', '#4a6fa5'],
    light: {
      offBorder: '#cbd5e1',
      onBorder: '#3b6db5',
      onGlow: 'rgba(74, 111, 165, 0.25)',
      onGradientFrom: '#eef2f7',
      onGradientTo: '#ffffff',
    },
  },
  catppuccin: {
    key: 'catppuccin',
    label: 'Catppuccin',
    swatch: '#cba6f7',
    offBorder: '#2c2440',
    onBorder: '#cba6f7',
    onGlow: 'rgba(203, 166, 247, 0.4)',
    onGradientFrom: '#221f3a',
    onGradientTo: '#151825',
    bulbTint: 'rgba(203, 166, 247, 0.45)',
    toggleOnBg: '#5b21b6',
    mixedRingOverride: MIXED_AMBER_OVERRIDE,
    bulbPalette: ['#f5c2e7', '#cba6f7', '#94e2d5', '#f9e2af', '#a6e3a1'],
    light: {
      offBorder: '#e9d8fd',
      onBorder: '#9d6df1',
      onGlow: 'rgba(157, 109, 241, 0.25)',
      onGradientFrom: '#f4eafd',
      onGradientTo: '#ffffff',
      mixedRingOverride: MIXED_AMBER_OVERRIDE,
    },
  },
  tokyoNight: {
    key: 'tokyoNight',
    label: 'Tokyo Night',
    swatch: '#7aa2f7',
    offBorder: '#1f2238',
    onBorder: '#7aa2f7',
    onGlow: 'rgba(122, 162, 247, 0.4)',
    onGradientFrom: '#1d2237',
    onGradientTo: '#151825',
    bulbTint: 'rgba(122, 162, 247, 0.45)',
    toggleOnBg: '#1e3a8a',
    bulbPalette: ['#7aa2f7', '#bb9af7', '#7dcfff', '#9ece6a', '#f7768e'],
    light: {
      offBorder: '#cbd5e1',
      onBorder: '#4f7fd6',
      onGlow: 'rgba(122, 162, 247, 0.25)',
      onGradientFrom: '#e8eef7',
      onGradientTo: '#ffffff',
    },
  },
  dracula: {
    key: 'dracula',
    label: 'Dracula',
    swatch: '#bd93f9',
    offBorder: '#221d3a',
    onBorder: '#bd93f9',
    onGlow: 'rgba(189, 147, 249, 0.4)',
    onGradientFrom: '#221d3a',
    onGradientTo: '#151825',
    bulbTint: 'rgba(189, 147, 249, 0.45)',
    toggleOnBg: '#6d28d9',
    mixedRingOverride: MIXED_AMBER_OVERRIDE,
    bulbPalette: ['#bd93f9', '#ff79c6', '#8be9fd', '#50fa7b', '#ffb86c'],
    light: {
      offBorder: '#e9d8fd',
      onBorder: '#7c3aed',
      onGlow: 'rgba(124, 58, 237, 0.25)',
      onGradientFrom: '#f1eafd',
      onGradientTo: '#ffffff',
      mixedRingOverride: MIXED_AMBER_OVERRIDE,
    },
  },
  nord: {
    key: 'nord',
    label: 'Nord',
    swatch: '#88c0d0',
    offBorder: '#1d2533',
    onBorder: '#88c0d0',
    onGlow: 'rgba(136, 192, 208, 0.4)',
    onGradientFrom: '#1d2533',
    onGradientTo: '#151825',
    bulbTint: 'rgba(136, 192, 208, 0.45)',
    toggleOnBg: '#5e81ac',
    bulbPalette: ['#8fbcbb', '#88c0d0', '#81a1c1', '#5e81ac', '#b48ead'],
    light: {
      offBorder: '#bae6fd',
      onBorder: '#5e81ac',
      onGlow: 'rgba(94, 129, 172, 0.25)',
      onGradientFrom: '#eaf3f8',
      onGradientTo: '#ffffff',
    },
  },
  gruvbox: {
    key: 'gruvbox',
    label: 'Gruvbox',
    swatch: '#fabd2f',
    offBorder: '#2c2418',
    onBorder: '#fabd2f',
    onGlow: 'rgba(250, 189, 47, 0.4)',
    onGradientFrom: '#2c2418',
    onGradientTo: '#151825',
    bulbTint: 'rgba(250, 189, 47, 0.45)',
    toggleOnBg: '#d65d0e',
    bulbPalette: ['#fb4934', '#fabd2f', '#b8bb26', '#83a598', '#d3869b'],
    light: {
      offBorder: '#fde68a',
      onBorder: '#d97706',
      onGlow: 'rgba(217, 119, 6, 0.3)',
      onGradientFrom: '#fef3c7',
      onGradientTo: '#ffffff',
    },
  },
  amber: {
    key: 'amber',
    label: 'Amber',
    swatch: '#f59e0b',
    offBorder: '#322a1f',
    onBorder: '#b45309',
    onGlow: 'rgba(251, 191, 36, 0.4)',
    onGradientFrom: '#2a2218',
    onGradientTo: '#151825',
    bulbTint: 'rgba(251, 191, 36, 0.5)',
    toggleOnBg: '#b45309',
    bulbPalette: ['#fde68a', '#fcd34d', '#fbbf24', '#f59e0b'],
    light: {
      offBorder: '#fde68a',
      onBorder: '#b45309',
      onGlow: 'rgba(180, 83, 9, 0.3)',
      onGradientFrom: '#fef3c7',
      onGradientTo: '#ffffff',
    },
  },
  emerald: {
    key: 'emerald',
    label: 'Emerald',
    swatch: '#10b981',
    offBorder: '#1f2d29',
    onBorder: '#047857',
    onGlow: 'rgba(52, 211, 153, 0.4)',
    onGradientFrom: '#1a2a23',
    onGradientTo: '#151825',
    bulbTint: 'rgba(52, 211, 153, 0.45)',
    toggleOnBg: '#047857',
    bulbPalette: ['#a7f3d0', '#6ee7b7', '#34d399', '#10b981'],
    light: {
      offBorder: '#a7f3d0',
      onBorder: '#047857',
      onGlow: 'rgba(4, 120, 87, 0.25)',
      onGradientFrom: '#d1fae5',
      onGradientTo: '#ffffff',
    },
  },
  rose: {
    key: 'rose',
    label: 'Rose',
    swatch: '#ec4899',
    offBorder: '#2f242c',
    onBorder: '#be185d',
    onGlow: 'rgba(244, 114, 182, 0.4)',
    onGradientFrom: '#2a1d28',
    onGradientTo: '#151825',
    bulbTint: 'rgba(244, 114, 182, 0.45)',
    toggleOnBg: '#be185d',
    bulbPalette: ['#fbcfe8', '#fda4af', '#f472b6', '#ec4899'],
    light: {
      offBorder: '#fbcfe8',
      onBorder: '#be185d',
      onGlow: 'rgba(190, 24, 93, 0.25)',
      onGradientFrom: '#fce7f3',
      onGradientTo: '#ffffff',
    },
  },
  indigo: {
    key: 'indigo',
    label: 'Indigo',
    swatch: '#6366f1',
    offBorder: '#2a2942',
    onBorder: '#4338ca',
    onGlow: 'rgba(129, 140, 248, 0.4)',
    onGradientFrom: '#1f1f3a',
    onGradientTo: '#151825',
    bulbTint: 'rgba(129, 140, 248, 0.45)',
    toggleOnBg: '#4338ca',
    mixedRingOverride: MIXED_AMBER_OVERRIDE,
    bulbPalette: ['#a5b4fc', '#818cf8', '#6366f1', '#4338ca'],
    light: {
      offBorder: '#c7d2fe',
      onBorder: '#4338ca',
      onGlow: 'rgba(67, 56, 202, 0.25)',
      onGradientFrom: '#e0e7ff',
      onGradientTo: '#ffffff',
      mixedRingOverride: MIXED_AMBER_OVERRIDE,
    },
  },
  teal: {
    key: 'teal',
    label: 'Teal',
    swatch: '#14b8a6',
    offBorder: '#1f2e30',
    onBorder: '#0f766e',
    onGlow: 'rgba(45, 212, 191, 0.4)',
    onGradientFrom: '#1a2c2e',
    onGradientTo: '#151825',
    bulbTint: 'rgba(45, 212, 191, 0.45)',
    toggleOnBg: '#0f766e',
    bulbPalette: ['#5eead4', '#2dd4bf', '#14b8a6', '#0f766e'],
    light: {
      offBorder: '#99f6e4',
      onBorder: '#0f766e',
      onGlow: 'rgba(15, 118, 110, 0.25)',
      onGradientFrom: '#ccfbf1',
      onGradientTo: '#ffffff',
    },
  },
  plum: {
    key: 'plum',
    label: 'Plum',
    swatch: '#a855f7',
    offBorder: '#2c2440',
    onBorder: '#7e22ce',
    onGlow: 'rgba(192, 132, 252, 0.4)',
    onGradientFrom: '#271d3a',
    onGradientTo: '#151825',
    bulbTint: 'rgba(192, 132, 252, 0.45)',
    toggleOnBg: '#7e22ce',
    mixedRingOverride: MIXED_AMBER_OVERRIDE,
    bulbPalette: ['#d8b4fe', '#c084fc', '#a855f7', '#7e22ce'],
    light: {
      offBorder: '#e9d5ff',
      onBorder: '#7e22ce',
      onGlow: 'rgba(126, 34, 206, 0.25)',
      onGradientFrom: '#f3e8ff',
      onGradientTo: '#ffffff',
      mixedRingOverride: MIXED_AMBER_OVERRIDE,
    },
  },
  terracotta: {
    key: 'terracotta',
    label: 'Terracotta',
    swatch: '#ea580c',
    offBorder: '#322821',
    onBorder: '#9a3412',
    onGlow: 'rgba(251, 146, 60, 0.4)',
    onGradientFrom: '#2c2118',
    onGradientTo: '#151825',
    bulbTint: 'rgba(251, 146, 60, 0.45)',
    toggleOnBg: '#9a3412',
    bulbPalette: ['#fdba74', '#fb923c', '#ea580c', '#9a3412'],
    light: {
      offBorder: '#fed7aa',
      onBorder: '#9a3412',
      onGlow: 'rgba(154, 52, 18, 0.3)',
      onGradientFrom: '#fff7ed',
      onGradientTo: '#ffffff',
    },
  },
}

export const DEFAULT_LIGHT_THEME: LightThemeKey = 'slate'

export const MIXED_RING_DEFAULT = MIXED_DEFAULT

export function resolveLightTheme(
  key: string | null | undefined,
  mode: ThemeMode = 'dark',
): LightTheme {
  const base = (key && key in LIGHT_THEMES)
    ? LIGHT_THEMES[key as LightThemeKey]
    : LIGHT_THEMES[DEFAULT_LIGHT_THEME]
  if (mode !== 'light' || !base.light) return base
  return { ...base, ...base.light }
}

export function isValidLightThemeKey(key: unknown): key is LightThemeKey {
  return typeof key === 'string' && key in LIGHT_THEMES
}

// Convert hex color → CIE 1931 xy chromaticity. Uses sRGB→D65 XYZ matrix; matches the
// Philips Hue reference implementation. Returned as a [x, y] tuple, both in 0–1.
export function hexToXy(hex: string): [number, number] {
  const h = hex.replace(/^#/, '')
  if (h.length !== 6) return [0, 0]
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255

  const lin = (c: number) => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92)
  const cr = lin(r)
  const cg = lin(g)
  const cb = lin(b)

  const X = cr * 0.664511 + cg * 0.154324 + cb * 0.162028
  const Y = cr * 0.283881 + cg * 0.668433 + cb * 0.047685
  const Z = cr * 0.000088 + cg * 0.072310 + cb * 0.986039

  const sum = X + Y + Z
  if (sum === 0) return [0, 0]
  const x = +(X / sum).toFixed(4)
  const y = +(Y / sum).toFixed(4)
  return [x, y]
}

export function paletteColorFor(theme: LightTheme, index: number): string {
  if (theme.bulbPalette.length === 0) return '#ffffff'
  return theme.bulbPalette[index % theme.bulbPalette.length]!
}

// White-preset themes return their pinned mirek + brightness; palette themes return null.
export function whitePresetPayload(theme: LightTheme): { mirek: number; brightness: number } | null {
  return theme.bulbOutput?.kind === 'white' ? theme.bulbOutput : null
}

// 1 mirek = 1,000,000 / kelvin. Used for picker labels ("2700K · 60%").
export function kelvinFromMirek(mirek: number): number {
  return Math.round(1_000_000 / mirek)
}
