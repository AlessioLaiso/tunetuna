import { describe, expect, it } from 'vitest'
import { CUSTOM_THEME, customColorsFrom, THEMES, THEME_CHOICES, getTheme, parseCustomColors, nearestThemeAccent, resolveThemeAccent, themeAccentColors, themeVariants } from './themes'
import { srgbToOklab } from './artAccent'

const lightness = (hex: string) => srgbToOklab(...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number])).L

const mocha = getTheme('catppuccin-mocha')

describe('nearestThemeAccent', () => {
  it('snaps art accents to the closest Catppuccin accent', () => {
    expect(nearestThemeAccent(mocha, '#ff4d6d')?.name).toBe('red')
    expect(nearestThemeAccent(mocha, '#ffa64d')?.name).toBe('peach')
    expect(nearestThemeAccent(mocha, '#7ee081')?.name).toBe('green')
    expect(nearestThemeAccent(mocha, '#6aa0ff')?.name).toBe('blue')
    expect(nearestThemeAccent(mocha, '#c08cff')?.name).toBe('mauve')
  })

  it('is null for themes without named accents', () => {
    expect(nearestThemeAccent(getTheme('default'), '#ff0000')).toBeNull()
  })

  it('snaps to every non-default theme\'s own palette', () => {
    expect(nearestThemeAccent(getTheme('nord'), '#ff4d6d')?.name).toBe('red')
    expect(nearestThemeAccent(getTheme('rose-pine'), '#6aa0ff')?.name).toMatch(/foam|pine/)
    for (const theme of THEMES.filter((t) => t.family?.id !== 'default')) {
      expect(theme.accents?.length, theme.id).toBeGreaterThan(0)
      expect(theme.accents!.some((a) => a.hex === theme.accent), theme.id).toBe(true)
    }
  })
})

describe('Catppuccin flavors', () => {
  it('appear as one theme choice that defaults to Mocha', () => {
    const choices = THEME_CHOICES.filter((c) => c.name === 'Catppuccin')
    expect(choices).toHaveLength(1)
    expect(choices[0].id).toBe('catppuccin-mocha')
    expect(themeVariants(mocha).map((t) => t.variant)).toEqual(['Latte', 'Frappé', 'Macchiato', 'Mocha'])
  })

  it('resolve a named accent to each flavor\'s own color', () => {
    expect(resolveThemeAccent(getTheme('catppuccin-frappe'), 'theme:lavender')).toBe('#babbf1')
    expect(resolveThemeAccent(getTheme('catppuccin-macchiato'), 'theme:lavender')).toBe('#b7bdf8')
    expect(resolveThemeAccent(mocha, 'theme:lavender')).toBe('#b4befe')
  })
})

describe('variant families', () => {
  it('offer the default theme in light and dark, defaulting to dark', () => {
    const choice = THEME_CHOICES.find((c) => c.name === 'Default')!
    expect(choice.id).toBe('default')
    expect(themeVariants(getTheme('default')).map((t) => t.variant)).toEqual(['Light', 'Dark'])
  })

  it('offer Ayu in three variants, defaulting to dark', () => {
    const choice = THEME_CHOICES.find((c) => c.name === 'Ayu')!
    expect(choice.id).toBe('ayu-dark')
    expect(themeVariants(getTheme('ayu-dark')).map((t) => t.variant)).toEqual(['Light', 'Mirage', 'Dark'])
  })
})

describe('themeAccentColors', () => {
  it('darkens light accents for text on light themes', () => {
    const { text, fill } = themeAccentColors(getTheme('ayu-light'), '#f2ae49')
    expect(lightness(text)).toBeLessThanOrEqual(0.59)
    expect(lightness(fill)).toBeLessThanOrEqual(0.61)
  })

  it('lightens dark accents for text on dark themes', () => {
    expect(lightness(themeAccentColors(getTheme('rose-pine'), '#31748f').text)).toBeGreaterThanOrEqual(0.71)
  })
})

describe('default accents', () => {
  it('are each theme\'s best-known accent', () => {
    expect(resolveThemeAccent(mocha, 'theme')).toBe('#cba6f7')
    expect(getTheme('everforest-dark').accent).toBe('#a7c080')
    expect(getTheme('monokai').accent).toBe('#f92672')
    expect(getTheme('solarized-light').accent).toBe('#268bd2')
    expect(getTheme('one-dark').accent).toBe('#61afef')
  })
})

describe('custom theme', () => {
  it('parses background, text and accents, with or without # and in short form', () => {
    expect(parseCustomColors('#1E1E2E, cdd6f4,#89b4fa  f38ba8')).toEqual({
      colors: ['#1e1e2e', '#cdd6f4', '#89b4fa', '#f38ba8'],
    })
    expect(parseCustomColors('#fff, #000, #f00')).toEqual({ colors: ['#ffffff', '#000000', '#ff0000'] })
  })

  it('rejects too few colors or invalid ones', () => {
    expect(parseCustomColors('#000000, #ffffff')).toHaveProperty('error')
    expect(parseCustomColors('#000000, #ffffff, blue')).toHaveProperty('error')
  })

  it('builds a theme from the colors, light when the background is', () => {
    const dark = getTheme(CUSTOM_THEME, '#101010, #eeeeee, #ff8800, #00aaff')
    expect(dark).toMatchObject({ background: '#101010', foreground: '#eeeeee', accent: '#ff8800', light: false })
    expect(dark.accents?.map((a) => a.hex)).toEqual(['#ff8800', '#00aaff'])
    expect(getTheme(CUSTOM_THEME, '#fafafa, #222222, #0066cc').light).toBe(true)
  })

  it('falls back to the default theme when the colors don\'t parse', () => {
    expect(getTheme(CUSTOM_THEME, 'nope').id).toBe('default')
  })
})

describe('theme picker', () => {
  it('lists the default theme first and the rest alphabetically', () => {
    const names = THEME_CHOICES.map((c) => c.name)
    expect(names[0]).toBe('Default')
    expect(names.slice(1)).toEqual([...names.slice(1)].sort((a, b) => a.localeCompare(b)))
    expect(names).toContain('Gruvbox')
  })

  it('keeps the ids themes had before they had variants as their defaults', () => {
    for (const id of ['tokyo-night', 'rose-pine', 'dracula', 'gruvbox-dark', 'kanagawa-wave', 'one-dark']) {
      expect(getTheme(id).id).toBe(id)
      expect(THEME_CHOICES.some((c) => c.id === id)).toBe(true)
    }
  })

  it('offers each theme\'s official variants', () => {
    expect(themeVariants(getTheme('tokyo-night')).map((t) => t.variant)).toEqual(['Day', 'Storm', 'Moon', 'Night'])
    expect(themeVariants(getTheme('rose-pine')).map((t) => t.variant)).toEqual(['Dawn', 'Moon', 'Main'])
    expect(themeVariants(getTheme('kanagawa-wave')).map((t) => t.variant)).toEqual(['Lotus', 'Wave', 'Dragon'])
  })
})

describe('customColorsFrom', () => {
  it('copies a theme\'s colors with its default accent first, so the copy looks the same', () => {
    const copy = getTheme(CUSTOM_THEME, customColorsFrom(getTheme('nord')))
    expect(copy).toMatchObject({ background: '#2e3440', foreground: '#d8dee9', accent: '#81a1c1' })
    expect(copy.accents).toHaveLength(getTheme('nord').accents!.length)
  })

  it('gives the default themes the default blue accent', () => {
    expect(customColorsFrom(getTheme('default-light'))).toBe('#ffffff, #000000, #3b82f6')
  })
})
