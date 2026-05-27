export function getAccentColorRgba(opacity: number): string {
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color')?.trim() || '#3b82f6'
  const hex = accentColor.startsWith('#') ? accentColor : `#${accentColor}`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}
