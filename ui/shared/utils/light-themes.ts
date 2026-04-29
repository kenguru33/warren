// Curated color themes for light groups. Each theme drives:
//   1. The LightGroupTile UI (off-border, on-state border + gradient, glow, bulb tint).
//   2. The ACTUAL bulb colors when the group is turned on — `bulbPalette` is distributed
//      round-robin to color-capable members; each member gets one hex from the palette,
//      converted to CIE xy chromaticity for the Hue API.
//
// The catalog is shared (not in app/composables) so the server can validate keys and look up
// palettes from the same source the client renders from. Imported via Nuxt 4's `shared/utils/`
// auto-import in Vue components, and explicitly in server utils.
//
// Adding a theme:
// - `swatch` + `onBorder` should be in the same hue at mid-brightness.
// - `toggleOnBg` is the deep, saturated end (the toggle button is small and washes pastels out).
// - `onGlow`, `bulbTint` are lighter rgba alphas of the same hue.
// - `onGradientFrom` should be a desaturated 8–12% mix of the theme color into #1d2238.
// - Themes whose hue lies in the 260–310° purple band should set `mixedRingOverride` to amber
//   so the existing purple "mixed" cue remains distinguishable.
// - `bulbPalette` should be 3–5 hex colors capturing the theme's actual bulb-color identity.

export type LightThemeKey =
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

export interface LightTheme {
  key: LightThemeKey
  label: string
  swatch: string
  offBorder: string
  onBorder: string
  onGlow: string
  onGradientFrom: string
  onGradientTo: string
  bulbTint: string
  toggleOnBg: string
  mixedRingOverride?: string
  bulbPalette: string[]
}

const MIXED_DEFAULT = 'rgba(168, 85, 247, 0.45)'
const MIXED_AMBER_OVERRIDE = 'rgba(251, 191, 36, 0.55)'

// Order matters: Object.values(LIGHT_THEMES) drives the dropdown's render order. Default
// (slate) first, then the popular palette themes, then the solid-color themes.
export const LIGHT_THEMES: Record<LightThemeKey, LightTheme> = {
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
  },
  // Popular palette themes — each picks colors directly from the upstream scheme.
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
    // Mocha accents: pink, mauve, teal, yellow, green
    bulbPalette: ['#f5c2e7', '#cba6f7', '#94e2d5', '#f9e2af', '#a6e3a1'],
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
  },
  // Solid single-hue themes — picker colors plus a tonal palette per theme.
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
  },
}

export const DEFAULT_LIGHT_THEME: LightThemeKey = 'slate'

export const MIXED_RING_DEFAULT = MIXED_DEFAULT

export function resolveLightTheme(key: string | null | undefined): LightTheme {
  if (key && key in LIGHT_THEMES) return LIGHT_THEMES[key as LightThemeKey]
  return LIGHT_THEMES[DEFAULT_LIGHT_THEME]
}

export function isValidLightThemeKey(key: unknown): key is LightThemeKey {
  return typeof key === 'string' && key in LIGHT_THEMES
}

// Convert hex color → CIE 1931 xy chromaticity. Uses sRGB→D65 XYZ matrix; matches the
// Philips Hue reference implementation. Returned as a [x, y] tuple, both in 0–1.
// Returns [0, 0] for pure black (which the bulb interprets as default white anyway).
export function hexToXy(hex: string): [number, number] {
  const h = hex.replace(/^#/, '')
  if (h.length !== 6) return [0, 0]
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255

  // sRGB gamma → linear
  const lin = (c: number) => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92)
  const cr = lin(r)
  const cg = lin(g)
  const cb = lin(b)

  // Wide-gamut sRGB → D65 XYZ (Philips Hue reference matrix)
  const X = cr * 0.664511 + cg * 0.154324 + cb * 0.162028
  const Y = cr * 0.283881 + cg * 0.668433 + cb * 0.047685
  const Z = cr * 0.000088 + cg * 0.072310 + cb * 0.986039

  const sum = X + Y + Z
  if (sum === 0) return [0, 0]
  const x = +(X / sum).toFixed(4)
  const y = +(Y / sum).toFixed(4)
  return [x, y]
}

// Stable round-robin pick: member at `index` gets palette[index % palette.length].
export function paletteColorFor(theme: LightTheme, index: number): string {
  if (theme.bulbPalette.length === 0) return '#ffffff'
  return theme.bulbPalette[index % theme.bulbPalette.length]!
}
