import { describe, expect, it } from 'vitest'
import { THEME_CHOICES, getTheme, nearestThemeAccent, resolveThemeAccent, themeVariants } from './themes'

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
    expect(nearestThemeAccent(getTheme('nord'), '#ff0000')).toBeNull()
  })
})

describe('Catppuccin flavors', () => {
  it('appear as one theme choice that defaults to Mocha', () => {
    const choices = THEME_CHOICES.filter((c) => c.name === 'Catppuccin')
    expect(choices).toHaveLength(1)
    expect(choices[0].id).toBe('catppuccin-mocha')
    expect(themeVariants(mocha).map((t) => t.variant)).toEqual(['Frappé', 'Macchiato', 'Mocha'])
  })

  it('resolve a named accent to each flavor\'s own color', () => {
    expect(resolveThemeAccent(getTheme('catppuccin-frappe'), 'theme:lavender')).toBe('#babbf1')
    expect(resolveThemeAccent(getTheme('catppuccin-macchiato'), 'theme:lavender')).toBe('#b7bdf8')
    expect(resolveThemeAccent(mocha, 'theme:lavender')).toBe('#b4befe')
  })
})
