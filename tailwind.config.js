import plugin from 'tailwindcss/plugin'
import flattenColorPalette from 'tailwindcss/lib/util/flattenColorPalette'
import { parseColor } from 'tailwindcss/lib/util/color'
import withAlphaVariable from 'tailwindcss/lib/util/withAlphaVariable'

// Splits a text color into an opaque color and its alpha, e.g. text-white/60 -> white and 0.6.
// Colors that can't be parsed (CSS variables) count as opaque; inherit/currentColor are left alone.
function iconColorVars(value) {
  if (typeof value !== 'string' || /^(inherit|currentColor)$/i.test(value)) return {}
  if (value === 'transparent') return { '--icon-alpha': '0' }
  const parsed = parseColor(value)
  if (!parsed) return { '--icon-color': value, '--icon-alpha': '1' }
  return {
    '--icon-color': `${parsed.mode}(${parsed.color.join(' ')})`,
    '--icon-alpha': parsed.alpha === undefined ? '1' : String(parsed.alpha),
  }
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
        zinc: {
          900: '#18181b',
        },
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






