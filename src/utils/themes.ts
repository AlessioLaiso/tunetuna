// App color themes. The app is styled with Tailwind's white/black/zinc colors; tailwind.config.js
// points those at the CSS variables set here, so a theme recolors every existing class.
// Palettes come from the Ghostty/iTerm2 color schemes bundled by herdr-theme-picker; the default
// accent is ANSI palette 4 (blue), as in that project's mapping. Themes with a named accent palette
// (Catppuccin) offer those accents in the accent picker instead of the standard presets.
// Catppuccin's flavors are one family: one theme choice plus a flavor picker.

import { oklchToHex, srgbToOklab } from './artAccent'

export const DEFAULT_THEME = 'default'

/** accentColor value that derives the accent from the current album art */
export const ARTWORK_ACCENT = 'artwork'
/** accentColor value that uses the current theme's default accent; "theme:<name>" picks a named one */
export const THEME_ACCENT = 'theme'

export interface ThemeAccent {
  name: string
  hex: string
}

/** Themes offered as one choice with variants picked separately, e.g. Catppuccin's flavors */
export interface ThemeFamily {
  id: string
  name: string
  /** What the variants are called in the picker */
  variantLabel: string
  /** Theme id picked when the family is chosen */
  defaultTheme: string
}

export interface Theme {
  id: string
  name: string
  family?: ThemeFamily
  /** Name within the family, e.g. "Mocha" */
  variant?: string
  /** App background (replaces black) */
  background: string
  /** Text and solid white (replaces white) */
  foreground: string
  /** Translucent overlays: cards, borders, dividers (bg-white/10 etc.); the foreground if unset */
  overlay?: string
  /** Raised surfaces (sheets, menus; Tailwind zinc-900/800); mixed from background and overlay if unset */
  surface?: string
  surface2?: string
  /** Accent used when the accent setting is the theme's default; null keeps the preset accent */
  accent: string | null
  /** accentColor setting applied when switching to this theme; the theme's accent if unset */
  defaultAccentSetting?: string
  /**
   * Named accents the theme offers in place of the standard presets. Themes in a family share the
   * names, so a picked accent carries over between variants.
   */
  accents?: ThemeAccent[]
  /**
   * Pastel palette: accents are used exactly as given, also for filled controls, which then carry
   * dark content (the background color) instead of light
   */
  pastel?: boolean
  /** Replaces Tailwind's reds (errors, destructive buttons); darker shades are mixed into the background */
  red?: string
}

const CATPPUCCIN: ThemeFamily = {
  id: 'catppuccin',
  name: 'Catppuccin',
  variantLabel: 'Flavor',
  defaultTheme: 'catppuccin-mocha',
}

const CATPPUCCIN_ACCENT_NAMES = [
  'rosewater', 'flamingo', 'pink', 'mauve', 'red', 'maroon', 'peach',
  'yellow', 'green', 'teal', 'sky', 'sapphire', 'blue', 'lavender',
] as const

/**
 * A Catppuccin flavor (https://catppuccin.com/palette/), from its id suffix, name, base, text and accents in
 * CATPPUCCIN_ACCENT_NAMES order. Light Latte is left out: the app's styling assumes a dark theme.
 */
function catppuccin(id: string, variant: string, base: string, text: string, accentHexes: string[]): Theme {
  const accents = CATPPUCCIN_ACCENT_NAMES.map((name, i) => ({ name, hex: accentHexes[i] }))
  const byName = (name: string) => accents.find((a) => a.name === name)!.hex
  return {
    id: `catppuccin-${id}`,
    name: `Catppuccin ${variant}`,
    family: CATPPUCCIN,
    variant,
    background: base,
    foreground: text,
    accent: byName('blue'),
    accents,
    // The album art accent, snapped to the closest of the flavor's accents
    defaultAccentSetting: ARTWORK_ACCENT,
    pastel: true,
    red: byName('red'),
  }
}

export const THEMES: Theme[] = [
  { id: DEFAULT_THEME, name: 'Default', background: '#000000', foreground: '#ffffff', accent: null },
  catppuccin('frappe', 'Frappé', '#303446', '#c6d0f5', [
    '#f2d5cf', '#eebebe', '#f4b8e4', '#ca9ee6', '#e78284', '#ea999c', '#ef9f76',
    '#e5c890', '#a6d189', '#81c8be', '#99d1db', '#85c1dc', '#8caaee', '#babbf1',
  ]),
  catppuccin('macchiato', 'Macchiato', '#24273a', '#cad3f5', [
    '#f4dbd6', '#f0c6c6', '#f5bde6', '#c6a0f6', '#ed8796', '#ee99a0', '#f5a97f',
    '#eed49f', '#a6da95', '#8bd5ca', '#91d7e3', '#7dc4e4', '#8aadf4', '#b7bdf8',
  ]),
  catppuccin('mocha', 'Mocha', '#1e1e2e', '#cdd6f4', [
    '#f5e0dc', '#f2cdcd', '#f5c2e7', '#cba6f7', '#f38ba8', '#eba0ac', '#fab387',
    '#f9e2af', '#a6e3a1', '#94e2d5', '#89dceb', '#74c7ec', '#89b4fa', '#b4befe',
  ]),
  // https://github.com/rebelot/kanagawa.nvim (lua/kanagawa/colors.lua, themes.lua "wave"):
  // sumiInk3 background, fujiWhite text, crystalBlue accent, samuraiRed (its error color) for reds.
  // Its surfaces are a cool sumiInk ramp, not the warm text color: the overlay continues that ramp
  // so bg-white/10 on the background lands on sumiInk4, and the surfaces are sumiInk4/5.
  {
    id: 'kanagawa-wave',
    name: 'Kanagawa Wave',
    background: '#1f1f28',
    foreground: '#dcd7ba',
    overlay: '#8d8dbe',
    surface: '#2a2a37',
    surface2: '#363646',
    accent: '#7e9cd8',
    red: '#e82424',
  },
  { id: 'tokyo-night', name: 'Tokyo Night', background: '#1a1b26', foreground: '#c0caf5', accent: '#7aa2f7' },
  { id: 'nord', name: 'Nord', background: '#2e3440', foreground: '#d8dee9', accent: '#81a1c1' },
  { id: 'dracula', name: 'Dracula', background: '#282a36', foreground: '#f8f8f2', accent: '#bd93f9' },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', background: '#282828', foreground: '#ebdbb2', accent: '#458588' },
  { id: 'rose-pine', name: 'Rosé Pine', background: '#191724', foreground: '#e0def4', accent: '#9ccfd8' },
]

export interface ThemeChoice {
  /** Theme id to pick: the theme itself, or a family's default variant */
  id: string
  name: string
  /** Theme shown in the choice's preview */
  preview: Theme
  family?: ThemeFamily
}

/** The theme picker's rows: each family collapses into one, previewed by its default variant */
export const THEME_CHOICES: ThemeChoice[] = THEMES.flatMap((theme) => {
  if (!theme.family) return [{ id: theme.id, name: theme.name, preview: theme }]
  if (theme.id !== theme.family.defaultTheme) return []
  return [{ id: theme.id, name: theme.family.name, preview: theme, family: theme.family }]
})

/** Display name for the theme's row in the picker */
export function themeChoiceName(theme: Theme) {
  return theme.family?.name ?? theme.name
}

/** The other variants of the theme's family, in order; empty when it has none */
export function themeVariants(theme: Theme): Theme[] {
  return theme.family ? THEMES.filter((t) => t.family === theme.family) : []
}

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/**
 * The theme accent an accentColor setting refers to: "theme" is the theme's default accent and
 * "theme:<name>" one of its named accents. Null for other settings, or when the theme has none.
 */
export function resolveThemeAccent(theme: Theme, accentColor: string): string | null {
  if (accentColor !== THEME_ACCENT && !accentColor.startsWith(`${THEME_ACCENT}:`)) return null
  const named = theme.accents?.find((a) => `${THEME_ACCENT}:${a.name}` === accentColor)
  return named?.hex ?? theme.accent
}

/**
 * The theme's named accent closest to a color, comparing hue and chroma (OKLab a/b) and ignoring
 * lightness, which the artwork accent fixes rather than taking from the art. Null without accents.
 */
export function nearestThemeAccent(theme: Theme, hex: string): ThemeAccent | null {
  if (!theme.accents?.length) return null
  const target = srgbToOklab(...hexToRgb(hex))
  let best: ThemeAccent | null = null
  let bestDistance = Infinity
  for (const accent of theme.accents) {
    const { a, b } = srgbToOklab(...hexToRgb(accent.hex))
    const distance = Math.hypot(a - target.a, b - target.b)
    if (distance < bestDistance) {
      bestDistance = distance
      best = accent
    }
  }
  return best
}

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

/** Space-separated channels, for rgb(var(--x) / alpha) */
function channels(rgb: [number, number, number]) {
  return rgb.map(Math.round).join(' ')
}

function mixRgb(from: string, to: string, t: number): [number, number, number] {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as [number, number, number]
}

/** Lowest lightness (OKLCH) for accent text on the theme background */
const MIN_TEXT_LIGHTNESS = 0.72
/** Highest lightness for filled accent controls, so their foreground-colored content stays legible */
const MAX_FILL_LIGHTNESS = 0.6

/**
 * Text and fill accents from a theme accent, following the artwork accent's split; pastel themes
 * use the accent as is for both
 */
export function themeAccentColors(theme: Theme, hex: string) {
  if (theme.pastel) return { text: hex, fill: hex }
  const { L, a, b } = srgbToOklab(...hexToRgb(hex))
  const C = Math.hypot(a, b)
  const h = Math.atan2(b, a)
  return {
    text: L < MIN_TEXT_LIGHTNESS ? oklchToHex(MIN_TEXT_LIGHTNESS, C, h) : hex,
    fill: L > MAX_FILL_LIGHTNESS ? oklchToHex(MAX_FILL_LIGHTNESS, C, h) : hex,
  }
}

/** Tailwind red shades the app uses, with how much of the theme red each gets over the background */
const RED_SHADES: [number, number][] = [[200, 1], [400, 1], [500, 1], [600, 1], [700, 0.6], [800, 0.45], [900, 0.3]]

/** Sets the theme's color variables on the document root */
export function applyTheme(id: string) {
  const theme = getTheme(id)
  const root = document.documentElement
  const isDefault = theme.id === DEFAULT_THEME
  root.style.setProperty('--c-bg', channels(hexToRgb(theme.background)))
  root.style.setProperty('--c-fg', channels(hexToRgb(theme.foreground)))
  const overlay = theme.overlay ?? theme.foreground
  root.style.setProperty('--c-overlay', channels(hexToRgb(overlay)))
  // Raised surfaces (Tailwind zinc-900/800); the default theme keeps Tailwind's exact zinc
  const surface = (own: string | undefined, zinc: string, amount: number) =>
    own ? channels(hexToRgb(own)) : isDefault ? zinc : channels(mixRgb(theme.background, overlay, amount))
  root.style.setProperty('--c-surface', surface(theme.surface, '24 24 27', 0.06))
  root.style.setProperty('--c-surface-2', surface(theme.surface2, '39 39 42', 0.12))
  // Reds: bright shades take the theme red, dark ones (backgrounds behind light text) are tinted
  // backgrounds. Without a theme red the Tailwind defaults in tailwind.config.js apply.
  for (const [shade, amount] of RED_SHADES) {
    if (theme.red) {
      root.style.setProperty(`--c-red-${shade}`, channels(amount === 1 ? hexToRgb(theme.red) : mixRgb(theme.background, theme.red, amount)))
    } else {
      root.style.removeProperty(`--c-red-${shade}`)
    }
  }
  // Overlay on the blurred album art background: themed backgrounds tint the art with their own
  // color, which reads as muddy unless it covers the art much more than the default black does
  root.style.setProperty('--art-tint', isDefault ? '0.65' : '0.88')
  root.style.setProperty('--art-tint-bar', isDefault ? '0.75' : '0.92')
  root.dataset.theme = theme.id
  if (theme.pastel) root.dataset.pastel = ''
  else delete root.dataset.pastel
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.background)
}
