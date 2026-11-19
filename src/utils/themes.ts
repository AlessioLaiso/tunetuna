// App color themes. The app is styled with Tailwind's white/black/zinc colors; tailwind.config.js
// points those at the CSS variables set here, so a theme recolors every existing class.
// Every theme but the default offers its own named accents in the accent picker instead of the
// standard presets, defaults to the accent it's best known for, and snaps the album art accent to
// the closest of its accents. Variants of one theme (Catppuccin's flavors, light and dark) form a
// family: one theme choice plus a variant picker. The custom theme is built from colors the user pastes.

import { oklchToHex, srgbToOklab } from './artAccent'

export const DEFAULT_THEME = 'default'
/** Theme id of the user's own colors (customThemeColors in the settings store) */
export const CUSTOM_THEME = 'custom'

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
  /** Accent used when the accent setting is the theme's default; null keeps the preset accents */
  accent: string | null
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
  /** Replace Tailwind's greens, ambers and oranges (status text and bars), like red */
  green?: string
  amber?: string
  orange?: string
  /** Light background with dark text: sets color-scheme so native controls and scrollbars match */
  light?: boolean
}

function family(id: string, name: string, defaultTheme: string, variantLabel = 'Variant'): ThemeFamily {
  return { id, name, variantLabel, defaultTheme }
}

const DEFAULT_FAMILY = family('default', 'Default', DEFAULT_THEME)
const AYU = family('ayu', 'Ayu', 'ayu-dark')
const CATPPUCCIN = family('catppuccin', 'Catppuccin', 'catppuccin-mocha', 'Flavor')
const DRACULA = family('dracula', 'Dracula', 'dracula')
const EVERFOREST = family('everforest', 'Everforest', 'everforest-dark')
const GRUVBOX = family('gruvbox', 'Gruvbox', 'gruvbox-dark')
const KANAGAWA = family('kanagawa', 'Kanagawa', 'kanagawa-wave')
const ONE = family('one', 'One', 'one-dark')
const ROSE_PINE = family('rose-pine', 'Rosé Pine', 'rose-pine')
const SOLARIZED = family('solarized', 'Solarized', 'solarized-dark')
const TOKYO_NIGHT = family('tokyo-night', 'Tokyo Night', 'tokyo-night')

/**
 * Named accents from [name, hex] pairs, with the fields that come with them: the theme's default
 * accent, and the status colors taken from the accents named red, green, yellow and orange unless given
 */
function palette(pairs: [string, string][], defaultAccent: string, status: Partial<Pick<Theme, 'red' | 'green' | 'amber' | 'orange'>> = {}) {
  const accents = pairs.map(([name, hex]) => ({ name, hex }))
  const byName = (name: string) => accents.find((a) => a.name === name)?.hex
  return {
    accent: byName(defaultAccent)!,
    accents,
    red: byName('red'),
    green: byName('green'),
    amber: byName('yellow'),
    orange: byName('orange'),
    ...status,
  }
}

const CATPPUCCIN_ACCENT_NAMES = [
  'rosewater', 'flamingo', 'pink', 'mauve', 'red', 'maroon', 'peach',
  'yellow', 'green', 'teal', 'sky', 'sapphire', 'blue', 'lavender',
] as const

/**
 * A Catppuccin flavor (https://catppuccin.com/palette/), from its id suffix, name, base, text and accents in
 * CATPPUCCIN_ACCENT_NAMES order
 */
function catppuccin(
  id: string, variant: string, base: string, text: string, accentHexes: string[], extra: Partial<Theme> = {},
): Theme {
  const pairs = CATPPUCCIN_ACCENT_NAMES.map((name, i): [string, string] => [name, accentHexes[i]])
  return {
    id: `catppuccin-${id}`,
    name: `Catppuccin ${variant}`,
    family: CATPPUCCIN,
    variant,
    background: base,
    foreground: text,
    ...palette(pairs, 'mauve', { amber: accentHexes[7], orange: accentHexes[6] }),
    pastel: true,
    ...extra,
  }
}

/**
 * An Ayu variant, with accents in AYU_ACCENT_NAMES order: Ayu's UI accent (common.accent.tint) and
 * palette orange from https://github.com/ayu-theme/ayu-colors (themes/*.yaml), the rest the terminal
 * palette from https://terminalcolors.com/themes/ayu/ (bright ANSI colors). Reds are Ayu's error color.
 */
const AYU_ACCENT_NAMES = ['accent', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'] as const

function ayu(
  id: string, variant: string, background: string, foreground: string, error: string, accentHexes: string[], extra: Partial<Theme> = {},
): Theme {
  const pairs = AYU_ACCENT_NAMES.map((name, i): [string, string] => [name, accentHexes[i]])
  return {
    id: `ayu-${id}`,
    name: `Ayu ${variant}`,
    family: AYU,
    variant,
    background,
    foreground,
    ...palette(pairs, 'accent', { red: error }),
    ...extra,
  }
}

function solarized(id: string, variant: string, background: string, foreground: string, extra: Partial<Theme>): Theme {
  return {
    id: `solarized-${id}`,
    name: `Solarized ${variant}`,
    family: SOLARIZED,
    variant,
    background,
    foreground,
    ...palette([
      ['red', '#dc322f'], ['orange', '#cb4b16'], ['yellow', '#b58900'], ['green', '#859900'],
      ['cyan', '#2aa198'], ['blue', '#268bd2'], ['violet', '#6c71c4'], ['magenta', '#d33682'],
    ], 'blue'),
    ...extra,
  }
}

/** Tailwind's 600 shades as status colors, legible on light backgrounds */
const LIGHT_STATUS = { red: '#dc2626', green: '#16a34a', amber: '#d97706', orange: '#ea580c' }

export const THEMES: Theme[] = [
  // Light keeps the preset accents too, with Tailwind's 600 shades as status colors so they read on white
  {
    id: 'default-light', name: 'Default Light', family: DEFAULT_FAMILY, variant: 'Light',
    background: '#ffffff', foreground: '#000000', surface: '#f4f4f5', surface2: '#e4e4e7', accent: null,
    ...LIGHT_STATUS, light: true,
  },
  { id: DEFAULT_THEME, name: 'Default', family: DEFAULT_FAMILY, variant: 'Dark', background: '#000000', foreground: '#ffffff', accent: null },
  // Light: filled controls carry the light base on the saturated accents (the pastel rule), and the
  // raised surfaces are Latte's mantle/crust rather than mixed toward the dark text
  catppuccin('latte', 'Latte', '#eff1f5', '#4c4f69', [
    '#dc8a78', '#dd7878', '#ea76cb', '#8839ef', '#d20f39', '#e64553', '#fe640b',
    '#df8e1d', '#40a02b', '#179299', '#04a5e5', '#209fb5', '#1e66f5', '#7287fd',
  ], { light: true, surface: '#e6e9ef', surface2: '#dce0e8' }),
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
  ayu('light', 'Light', '#f8f9fa', '#5c6166', '#e65050',
    ['#f29718', '#f07171', '#fa8532', '#f2ae49', '#86b300', '#4cbf99', '#399ee6', '#a37acc'], { light: true }),
  ayu('mirage', 'Mirage', '#1f2430', '#cccac2', '#ff6666',
    ['#ffcc66', '#f28779', '#ffa659', '#ffd173', '#d5ff80', '#95e6cb', '#73d0ff', '#dfbfff']),
  ayu('dark', 'Dark', '#0b0e14', '#bfbdb6', '#d95757',
    ['#e6b450', '#f07178', '#ff8f40', '#ffb454', '#aad94c', '#95e6cb', '#59c2ff', '#d2a6ff']),
  // https://github.com/sainnhe/everforest (palette.md, medium contrast)
  {
    id: 'everforest-light', name: 'Everforest Light', family: EVERFOREST, variant: 'Light',
    background: '#fdf6e3', foreground: '#5c6a72', surface: '#f4f0d9', surface2: '#efebd4', light: true,
    ...palette([
      ['red', '#f85552'], ['orange', '#f57d26'], ['yellow', '#dfa000'], ['green', '#8da101'],
      ['aqua', '#35a77c'], ['blue', '#3a94c5'], ['purple', '#df69ba'],
    ], 'green'),
  },
  {
    id: 'everforest-dark', name: 'Everforest Dark', family: EVERFOREST, variant: 'Dark',
    background: '#2d353b', foreground: '#d3c6aa', surface: '#343f44', surface2: '#3d484d',
    ...palette([
      ['red', '#e67e80'], ['orange', '#e69875'], ['yellow', '#dbbc7f'], ['green', '#a7c080'],
      ['aqua', '#83c092'], ['blue', '#7fbbb3'], ['purple', '#d699b6'],
    ], 'green'),
  },
  // https://github.com/atom/atom (packages/one-light-syntax and one-dark-syntax, colors.less), its HSL
  // values as hex; yellow is the "orange 2" hue
  {
    id: 'one-light', name: 'One Light', family: ONE, variant: 'Light', background: '#fafafa', foreground: '#383a42', light: true,
    ...palette([
      ['red', '#e45649'], ['orange', '#b76b01'], ['yellow', '#cb7701'], ['green', '#50a14f'],
      ['cyan', '#0184bc'], ['blue', '#4078f2'], ['purple', '#a626a4'],
    ], 'blue'),
  },
  {
    id: 'one-dark', name: 'One Dark', family: ONE, variant: 'Dark', background: '#282c34', foreground: '#abb2bf',
    ...palette([
      ['red', '#e06c75'], ['orange', '#d19a66'], ['yellow', '#e5c07b'], ['green', '#98c379'],
      ['cyan', '#56b6c2'], ['blue', '#61afef'], ['purple', '#c678dd'],
    ], 'blue'),
  },
  // Classic Monokai (Wimer Hazenberg's Monokai.tmTheme): its pink keyword color is the signature accent and its red
  {
    id: 'monokai', name: 'Monokai', background: '#272822', foreground: '#f8f8f2',
    ...palette([
      ['pink', '#f92672'], ['orange', '#fd971f'], ['yellow', '#e6db74'], ['green', '#a6e22e'],
      ['blue', '#66d9ef'], ['purple', '#ae81ff'],
    ], 'pink', { red: '#f92672' }),
  },
  // https://ethanschoonover.com/solarized/: shared accents; the raised surface is base02 (dark) or
  // base2 (light), the second one is mixed as Solarized has no further background shade
  solarized('light', 'Light', '#fdf6e3', '#657b83', { light: true, surface: '#eee8d5' }),
  solarized('dark', 'Dark', '#002b36', '#839496', { surface: '#073642' }),
  // https://github.com/rebelot/kanagawa.nvim (lua/kanagawa/colors.lua, themes.lua)
  // Wave: sumiInk3 background, fujiWhite text, crystalBlue accent, samuraiRed (its error color) for reds.
  // Its surfaces are a cool sumiInk ramp, not the warm text color: the overlay continues that ramp
  // so bg-white/10 on the background lands on sumiInk4, and the surfaces are sumiInk4/5.
  // Accents: waveRed, surimiOrange, carpYellow, springGreen, waveAqua2, springBlue, crystalBlue,
  // oniViolet, sakuraPink; Dragon and Lotus use their own counterparts. Errors are samuraiRed, or
  // lotusRed3 (the same color) in Lotus.
  {
    id: 'kanagawa-lotus', name: 'Kanagawa Lotus', family: KANAGAWA, variant: 'Lotus',
    background: '#f2ecbc', foreground: '#545464', surface: '#e5ddb0', surface2: '#dcd5ac', light: true,
    ...palette([
      ['red', '#c84053'], ['orange', '#cc6d00'], ['yellow', '#77713f'], ['green', '#6f894e'],
      ['aqua', '#597b75'], ['sky', '#4e8ca2'], ['blue', '#4d699b'], ['violet', '#624c83'], ['pink', '#b35b79'],
    ], 'blue', { red: '#e82424' }),
  },
  {
    id: 'kanagawa-wave', name: 'Kanagawa Wave', family: KANAGAWA, variant: 'Wave',
    background: '#1f1f28',
    foreground: '#dcd7ba',
    overlay: '#8d8dbe',
    surface: '#2a2a37',
    surface2: '#363646',
    ...palette([
      ['red', '#e46876'], ['orange', '#ffa066'], ['yellow', '#e6c384'], ['green', '#98bb6c'],
      ['aqua', '#7aa89f'], ['sky', '#7fb4ca'], ['blue', '#7e9cd8'], ['violet', '#957fb8'], ['pink', '#d27e99'],
    ], 'blue', { red: '#e82424' }),
  },
  {
    id: 'kanagawa-dragon', name: 'Kanagawa Dragon', family: KANAGAWA, variant: 'Dragon',
    background: '#181616', foreground: '#c5c9c5', surface: '#282727', surface2: '#393836',
    ...palette([
      ['red', '#c4746e'], ['orange', '#b6927b'], ['yellow', '#c4b28a'], ['green', '#8a9a7b'],
      ['aqua', '#8ea4a2'], ['sky', '#949fb5'], ['blue', '#8ba4b0'], ['violet', '#8992a7'], ['pink', '#a292a3'],
    ], 'blue', { red: '#e82424' }),
  },
  // https://github.com/folke/tokyonight.nvim (extras/lua/tokyonight_*.lua): Storm and Night share a palette;
  // Day is generated from it, so its colors come from the generated extras
  ...([
    ['day', 'Day', '#e1e2e7', '#3760bf', ['#f52a65', '#b15c00', '#8c6c3e', '#587539', '#118c74', '#007197', '#2e7de9', '#7847bd', '#9854f1']],
    ['storm', 'Storm', '#24283b', '#c0caf5', ['#f7768e', '#ff9e64', '#e0af68', '#9ece6a', '#1abc9c', '#7dcfff', '#7aa2f7', '#9d7cd8', '#bb9af7']],
    ['moon', 'Moon', '#222436', '#c8d3f5', ['#ff757f', '#ff966c', '#ffc777', '#c3e88d', '#4fd6be', '#86e1fc', '#82aaff', '#fca7ea', '#c099ff']],
    ['night', 'Night', '#1a1b26', '#c0caf5', ['#f7768e', '#ff9e64', '#e0af68', '#9ece6a', '#1abc9c', '#7dcfff', '#7aa2f7', '#9d7cd8', '#bb9af7']],
  ] as const).map(([id, variant, background, foreground, hexes]): Theme => ({
    // Night keeps the plain id it had before Tokyo Night had variants
    id: id === 'night' ? 'tokyo-night' : `tokyo-night-${id}`,
    name: `Tokyo Night ${variant}`,
    family: TOKYO_NIGHT,
    variant,
    background,
    foreground,
    light: id === 'day',
    ...palette(
      ['red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'blue', 'purple', 'magenta'].map((name, i): [string, string] => [name, hexes[i]]),
      'blue',
    ),
  })),
  // https://www.nordtheme.com/docs/colors-and-palettes: Aurora and Frost
  {
    id: 'nord', name: 'Nord', background: '#2e3440', foreground: '#d8dee9',
    ...palette([
      ['red', '#bf616a'], ['orange', '#d08770'], ['yellow', '#ebcb8b'], ['green', '#a3be8c'], ['teal', '#8fbcbb'],
      ['cyan', '#88c0d0'], ['blue', '#81a1c1'], ['deep blue', '#5e81ac'], ['purple', '#b48ead'],
    ], 'blue'),
  },
  // https://draculatheme.com/spec: Dracula and its light counterpart Alucard
  {
    id: 'dracula-alucard', name: 'Alucard', family: DRACULA, variant: 'Alucard',
    background: '#fffbeb', foreground: '#1f1f1f', light: true,
    ...palette([
      ['red', '#cb3a2a'], ['orange', '#a34d14'], ['yellow', '#846e15'], ['green', '#14710a'],
      ['cyan', '#036a96'], ['purple', '#644ac9'], ['pink', '#a3144d'],
    ], 'purple'),
  },
  {
    id: 'dracula', name: 'Dracula', family: DRACULA, variant: 'Dracula', background: '#282a36', foreground: '#f8f8f2',
    ...palette([
      ['red', '#ff5555'], ['orange', '#ffb86c'], ['yellow', '#f1fa8c'], ['green', '#50fa7b'],
      ['cyan', '#8be9fd'], ['purple', '#bd93f9'], ['pink', '#ff79c6'],
    ], 'purple'),
  },
  // https://github.com/morhetz/gruvbox: the light mode's faded colors and the dark mode's bright ones
  {
    id: 'gruvbox-light', name: 'Gruvbox Light', family: GRUVBOX, variant: 'Light',
    background: '#fbf1c7', foreground: '#3c3836', surface: '#f2e5bc', surface2: '#ebdbb2', light: true,
    ...palette([
      ['red', '#9d0006'], ['orange', '#af3a03'], ['yellow', '#b57614'], ['green', '#79740e'],
      ['aqua', '#427b58'], ['blue', '#076678'], ['purple', '#8f3f71'],
    ], 'blue'),
  },
  {
    id: 'gruvbox-dark', name: 'Gruvbox Dark', family: GRUVBOX, variant: 'Dark',
    background: '#282828', foreground: '#ebdbb2', surface: '#32302f', surface2: '#3c3836',
    ...palette([
      ['red', '#fb4934'], ['orange', '#fe8019'], ['yellow', '#fabd2f'], ['green', '#b8bb26'],
      ['aqua', '#8ec07c'], ['blue', '#83a598'], ['purple', '#d3869b'],
    ], 'blue'),
  },
  // https://github.com/rose-pine/palette (palette.json), base and text, under its own color names
  ...([
    ['dawn', 'Dawn', '#faf4ed', '#464261', ['#b4637a', '#ea9d34', '#d7827e', '#286983', '#56949f', '#907aa9']],
    ['moon', 'Moon', '#232136', '#e0def4', ['#eb6f92', '#f6c177', '#ea9a97', '#3e8fb0', '#9ccfd8', '#c4a7e7']],
    ['main', 'Main', '#191724', '#e0def4', ['#eb6f92', '#f6c177', '#ebbcba', '#31748f', '#9ccfd8', '#c4a7e7']],
  ] as const).map(([id, variant, background, foreground, hexes]): Theme => ({
    // Main keeps the plain id it had before Rosé Pine had variants
    id: id === 'main' ? 'rose-pine' : `rose-pine-${id}`,
    name: id === 'main' ? 'Rosé Pine' : `Rosé Pine ${variant}`,
    family: ROSE_PINE,
    variant,
    background,
    foreground,
    light: id === 'dawn',
    ...palette(
      ['love', 'gold', 'rose', 'pine', 'foam', 'iris'].map((name, i): [string, string] => [name, hexes[i]]),
      'foam',
      { red: hexes[0], amber: hexes[1] },
    ),
  })),
]

export interface ThemeChoice {
  /** Theme id to pick: the theme itself, or a family's default variant */
  id: string
  name: string
  /** Theme shown in the choice's preview */
  preview: Theme
  family?: ThemeFamily
}

/**
 * The theme picker's rows: each family collapses into one, previewed by its default variant. The
 * default theme comes first, the rest alphabetically.
 */
export const THEME_CHOICES: ThemeChoice[] = THEMES.flatMap((theme): ThemeChoice[] => {
  if (!theme.family) return [{ id: theme.id, name: theme.name, preview: theme }]
  if (theme.id !== theme.family.defaultTheme) return []
  return [{ id: theme.id, name: theme.family.name, preview: theme, family: theme.family }]
}).sort((a, b) => (a.id === DEFAULT_THEME ? -1 : b.id === DEFAULT_THEME ? 1 : a.name.localeCompare(b.name)))

/** Display name for the theme's row in the picker */
export function themeChoiceName(theme: Theme) {
  return theme.family?.name ?? theme.name
}

/** The other variants of the theme's family, in order; empty when it has none */
export function themeVariants(theme: Theme): Theme[] {
  return theme.family ? THEMES.filter((t) => t.family === theme.family) : []
}

/** The theme with an id; the custom theme is built from the user's colors, the default if they don't parse */
export function getTheme(id: string, customColors = ''): Theme {
  if (id === CUSTOM_THEME) {
    const parsed = parseCustomColors(customColors)
    return 'colors' in parsed ? customTheme(parsed.colors) : getTheme(DEFAULT_THEME)
  }
  return THEMES.find((t) => t.id === id) ?? getTheme(DEFAULT_THEME)
}

/** What each pasted custom color is used for, in order; any further colors are more accents */
export const CUSTOM_COLOR_ROLES = ['background', 'text', 'accent'] as const

/**
 * Colors from the custom theme's text: hex values (# optional, 3 or 6 digits) separated by commas or
 * spaces, at least one per role in CUSTOM_COLOR_ROLES
 */
export function parseCustomColors(text: string): { colors: string[] } | { error: string } {
  const tokens = text.split(/[\s,]+/).filter(Boolean)
  const colors: string[] = []
  for (const token of tokens) {
    const match = token.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (!match) return { error: `"${token}" isn't a hex color` }
    const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1]
    colors.push(`#${digits.toLowerCase()}`)
  }
  if (colors.length < CUSTOM_COLOR_ROLES.length) {
    return { error: `Needs ${CUSTOM_COLOR_ROLES.length} colors: ${CUSTOM_COLOR_ROLES.join(', ')}` }
  }
  return { colors }
}

/** Background lightness (OKLCH) above which a custom theme counts as light */
const LIGHT_BACKGROUND = 0.6

function customTheme([background, foreground, ...accentHexes]: string[]): Theme {
  const light = srgbToOklab(...hexToRgb(background)).L > LIGHT_BACKGROUND
  return {
    id: CUSTOM_THEME,
    name: 'Custom',
    background,
    foreground,
    accent: accentHexes[0],
    accents: accentHexes.map((hex, i) => ({ name: `accent ${i + 1}`, hex })),
    light,
    ...(light ? LIGHT_STATUS : {}),
  }
}

/** Custom theme colors copied from another theme: its background, text, default accent, then its other accents */
export function customColorsFrom(theme: Theme) {
  const accent = theme.accent ?? '#3b82f6'
  const others = (theme.accents ?? []).map((a) => a.hex).filter((hex) => hex !== accent)
  return [theme.background, theme.foreground, accent, ...others].join(', ')
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

/** Lowest lightness (OKLCH) for accent text on a dark theme background */
const MIN_TEXT_LIGHTNESS = 0.72
/** Highest lightness for accent text on a light theme background */
const MAX_TEXT_LIGHTNESS_LIGHT = 0.58
/** Highest lightness for filled accent controls, so their content (foreground, or the light background) stays legible */
const MAX_FILL_LIGHTNESS = 0.6

/**
 * Text and fill accents from an accent color, following the artwork accent's split: on dark themes
 * text is lightened and fills darkened, on light themes both are darkened. Pastel themes use the
 * accent as is for both.
 */
export function themeAccentColors(theme: Theme, hex: string) {
  if (theme.pastel) return { text: hex, fill: hex }
  const { L, a, b } = srgbToOklab(...hexToRgb(hex))
  const C = Math.hypot(a, b)
  const h = Math.atan2(b, a)
  const text = theme.light
    ? (L > MAX_TEXT_LIGHTNESS_LIGHT ? oklchToHex(MAX_TEXT_LIGHTNESS_LIGHT, C, h) : hex)
    : (L < MIN_TEXT_LIGHTNESS ? oklchToHex(MIN_TEXT_LIGHTNESS, C, h) : hex)
  return {
    text,
    fill: L > MAX_FILL_LIGHTNESS ? oklchToHex(MAX_FILL_LIGHTNESS, C, h) : hex,
  }
}

/**
 * Tailwind status color shades the app uses (see tailwind.config.js), with how much of the theme's
 * color each gets over the background: bright shades take it as is, dark ones are tinted backgrounds
 */
const STATUS_SHADES: Record<'red' | 'green' | 'amber' | 'orange', [number, number][]> = {
  red: [[200, 1], [400, 1], [500, 1], [600, 1], [700, 0.6], [800, 0.45], [900, 0.3]],
  green: [[400, 1], [800, 0.45]],
  amber: [[400, 1], [500, 1]],
  orange: [[400, 1]],
}

/** Sets the theme's color variables on the document root */
export function applyTheme(id: string, customColors = '') {
  const theme = getTheme(id, customColors)
  const root = document.documentElement
  // The default dark theme keeps Tailwind's exact zinc surfaces and its lighter art tint
  const isDefault = theme.id === DEFAULT_THEME
  root.style.setProperty('--c-bg', channels(hexToRgb(theme.background)))
  root.style.setProperty('--c-fg', channels(hexToRgb(theme.foreground)))
  // Toggle knobs stay the theme's light color whether the toggle is on or off (filled controls
  // otherwise switch their white content to the background on pastel and light themes)
  root.style.setProperty('--c-knob', channels(hexToRgb(theme.light ? theme.background : theme.foreground)))
  const overlay = theme.overlay ?? theme.foreground
  root.style.setProperty('--c-overlay', channels(hexToRgb(overlay)))
  // Raised surfaces (Tailwind zinc-900/800); the default theme keeps Tailwind's exact zinc
  const surface = (own: string | undefined, zinc: string, amount: number) =>
    own ? channels(hexToRgb(own)) : isDefault ? zinc : channels(mixRgb(theme.background, overlay, amount))
  root.style.setProperty('--c-surface', surface(theme.surface, '24 24 27', 0.06))
  root.style.setProperty('--c-surface-2', surface(theme.surface2, '39 39 42', 0.12))
  // Status colors: bright shades take the theme's color, dark ones (backgrounds behind foreground
  // text) are tinted backgrounds. Without a theme color the Tailwind defaults in tailwind.config.js apply.
  for (const [name, shades] of Object.entries(STATUS_SHADES) as [keyof typeof STATUS_SHADES, [number, number][]][]) {
    const color = theme[name]
    for (const [shade, amount] of shades) {
      if (color) {
        root.style.setProperty(`--c-${name}-${shade}`, channels(amount === 1 ? hexToRgb(color) : mixRgb(theme.background, color, amount)))
      } else {
        root.style.removeProperty(`--c-${name}-${shade}`)
      }
    }
  }
  // Overlay on the blurred album art background: themed backgrounds tint the art with their own
  // color, which reads as muddy unless it covers the art much more than the default black does
  root.style.setProperty('--art-tint', isDefault ? '0.65' : '0.88')
  root.style.setProperty('--art-tint-bar', isDefault ? '0.75' : '0.92')
  root.style.colorScheme = theme.light ? 'light' : 'dark'
  root.dataset.theme = theme.id
  // Filled controls carry the background color as content: on pastel themes (light fills) and on
  // light themes (whose foreground is dark)
  if (theme.pastel || theme.light) root.dataset.fillOnBg = ''
  else delete root.dataset.fillOnBg
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.background)
}
