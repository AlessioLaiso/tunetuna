import plugin from 'tailwindcss/plugin'
import flattenColorPalette from 'tailwindcss/lib/util/flattenColorPalette'
import { parseColor } from 'tailwindcss/lib/util/color'
import withAlphaVariable from 'tailwindcss/lib/util/withAlphaVariable'

// Splits a text color into an opaque color and its alpha, e.g. text-white/60 -> white and 0.6.
// Colors that can't be parsed (CSS variables) count as opaque; inherit/currentColor are left alone.
function iconColorVars(value) {
  // Colors with <alpha-value> (the theme colors) arrive as functions; resolve them as opaque
  if (typeof value === 'function') value = value({ opacityValue: '1' })
  if (typeof value !== 'string' || /^(inherit|currentColor)$/i.test(value)) return {}
  if (value === 'transparent') return { '--icon-alpha': '0' }
  // Theme colors (see themeColor below): rgb(var(--c-fg) / 0.6)
  const themed = value.match(/^rgb\((var\(--[\w-]+(?:,[\d ]+)?\))\s*\/\s*(.+)\)$/)
  if (themed) {
    const alpha = themed[2].trim()
    return { '--icon-color': `rgb(${themed[1]})`, '--icon-alpha': alpha }
  }
  const parsed = parseColor(value)
  if (!parsed) return { '--icon-color': value, '--icon-alpha': '1' }
  return {
    '--icon-color': `${parsed.mode}(${parsed.color.join(' ')})`,
    '--icon-alpha': parsed.alpha === undefined ? '1' : String(parsed.alpha),
  }
}

// Colors set by the active theme (src/utils/themes.ts), as space-separated RGB channels
// A name may carry a fallback after a comma, e.g. 'c-red-500, 239 68 68'
const themeColor = (name) => `rgb(var(--${name}) / <alpha-value>)`

// White in solid form (knobs, white buttons) is the theme's foreground; translucent white (cards,
// borders, dividers, e.g. bg-white/10) is its overlay color, so a theme can tint surfaces apart
// from its text. Text keeps the foreground at every opacity (textColor/placeholderColor below).
function themeWhite({ opacityValue }) {
  const translucent = opacityValue !== undefined && !String(opacityValue).startsWith('var(') && Number(opacityValue) < 1
  return translucent
    ? `rgb(var(--c-overlay) / ${opacityValue})`
    : `rgb(var(--c-fg) / ${opacityValue ?? 1})`
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  corePlugins: {
    textColor: false,
  },
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        // Tailwind's status colors by default; themes with their own override them (src/utils/themes.ts)
        red: {
          200: themeColor('c-red-200, 254 202 202'),
          400: themeColor('c-red-400, 248 113 113'),
          500: themeColor('c-red-500, 239 68 68'),
          600: themeColor('c-red-600, 220 38 38'),
          700: themeColor('c-red-700, 185 28 28'),
          800: themeColor('c-red-800, 153 27 27'),
          900: themeColor('c-red-900, 127 29 29'),
        },
        green: {
          400: themeColor('c-green-400, 74 222 128'),
          800: themeColor('c-green-800, 22 101 52'),
        },
        amber: {
          400: themeColor('c-amber-400, 251 191 36'),
          500: themeColor('c-amber-500, 245 158 11'),
        },
        orange: {
          400: themeColor('c-orange-400, 251 146 60'),
        },
        // Status bar fills (sync, connection): the theme's exact green and red, or Tailwind's 800
        // shades behind light text on themes without their own (see applyTheme)
        status: {
          success: themeColor('c-status-success, 22 101 52'),
          error: themeColor('c-status-error, 153 27 27'),
        },
        white: themeWhite,
        black: themeColor('c-bg'),
        zinc: {
          800: themeColor('c-surface-2'),
          900: themeColor('c-surface'),
        },
      },
      textColor: {
        white: themeColor('c-fg'),
      },
      placeholderColor: {
        white: themeColor('c-fg'),
      },
      fontFamily: {
        handwritten: ['"Kalam"', 'cursive'],
      },
      screens: {
        '2xl': '1440px',
      },
    },
  },
  plugins: [
    // Replaces the core textColor plugin: every text color also exposes its opaque color and alpha
    // as --icon-color/--icon-alpha, so icons can draw opaque and fade as a whole (see svg.lucide in
    // index.css) instead of darkening where their strokes overlap
    plugin(function ({ matchUtilities, theme }) {
      matchUtilities(
        {
          text: (value) => ({
            ...withAlphaVariable({ color: value, property: 'color', variable: '--tw-text-opacity' }),
            ...iconColorVars(value),
          }),
        },
        { values: flattenColorPalette(theme('textColor')), type: ['color', 'any'] }
      )
    }),
    plugin(function ({ addVariant }) {
      addVariant('hover', '@media (hover: hover) and (pointer: fine) { &:hover }')
      addVariant('group-hover', '@media (hover: hover) and (pointer: fine) { :merge(.group):hover & }')
    }),
  ],
}






