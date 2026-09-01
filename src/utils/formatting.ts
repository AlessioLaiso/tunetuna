export function capitalizeFirst(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function formatDuration(ticks: number): string {
  const seconds = Math.floor(ticks / 10000000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Normalizes quotes and apostrophes to straight versions for flexible search matching.
 * Converts smart quotes (curly quotes) to straight quotes and apostrophes.
 * This allows searching with smart quotes to match items with straight quotes and vice versa.
 */
export function normalizeQuotes(text: string): string {
  if (!text) return text

  return text
    // Smart single quotes (left U+2018 and right U+2019) → straight apostrophe
    .replace(/[\u2018\u2019]/g, "'")
    // Smart double quotes (left U+201C and right U+201D) → straight double quote
    .replace(/[\u201C\u201D]/g, '"')
    // Also handle prime and double prime marks that might be used as quotes
    .replace(/[\u2032\u2033]/g, "'")
}

/**
 * Normalizes text for search matching by stripping diacritics and removing
 * apostrophes. This allows searching "scattero" to match "scatterò", "dont"
 * to match "don't", "cant" to match "can't", etc.
 * First normalizes quotes, then strips accents (so precomposed and decomposed
 * Unicode forms compare equal), then removes apostrophes for flexible matching.
 */
export function normalizeForSearch(text: string): string {
  if (!text) return text

  return normalizeQuotes(text)
    // Strip diacritics/accents: decompose to base char + combining mark, then
    // drop the combining marks (U+0300–U+036F). Handles ò à è ì ù ñ ü ç etc.
    // so that a query typed with or without accents matches text stored either
    // way, and precomposed vs decomposed Unicode forms compare equal.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Remove apostrophes for search matching
    .replace(/'/g, '')
}

/**
 * Detects if the current device is running iOS (iPhone, iPad, iPod)
 * iOS Safari doesn't allow programmatic volume control in web apps/PWAs
 */
export function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ) && !('MSStream' in window)
}

/**
 * Parses a grouping tag string into category and value.
 * Tags can be either:
 * - prefix_value format: "language_eng" -> { category: "language", value: "eng" }
 * - single word format: "instrumental" -> { category: "instrumental", value: null }
 */
/**
 * Extracts grouping tags from Jellyfin Tags field.
 * MusicTags plugin stores grouping data as "grouping:mood_party", "grouping:language_eng" etc.
 */
export function extractGroupingFromTags(tags: string[] | undefined): string[] {
  if (!tags || !Array.isArray(tags)) return []
  return tags
    .filter(tag => tag.startsWith('grouping:'))
    .map(tag => tag.replace('grouping:', ''))
}

export function extractBpmFromTags(tags: string[] | undefined): number | undefined {
  if (!tags || !Array.isArray(tags)) return undefined
  const bpmTag = tags.find(tag => tag.startsWith('BPM:'))
  if (!bpmTag) return undefined
  const value = parseInt(bpmTag.replace('BPM:', ''), 10)
  return isNaN(value) ? undefined : value
}

export function parseGroupingTag(tag: string): { category: string; value: string | null } | null {
  if (!tag || tag.trim() === '') return null
  const trimmed = tag.trim().toLowerCase()
  const underscoreIndex = trimmed.indexOf('_')
  if (underscoreIndex === -1) {
    return { category: trimmed, value: null }
  }
  return {
    category: trimmed.substring(0, underscoreIndex),
    value: trimmed.substring(underscoreIndex + 1)
  }
}

/**
 * Release grouping category. Tagged on songs (e.g. "release_ep",
 * "release_single", "release_live-album") to classify the release an album
 * belongs to. Used only by the artist detail page for sectioning; hidden
 * from filters, smart playlists, and search everywhere else.
 */
export const RELEASE_GROUPING_CATEGORY = 'release'

/**
 * Parses a release grouping tag ("release_live-album") into its value
 * ("live-album"). Returns null for non-release tags.
 */
export function parseReleaseTag(tag: string): string | null {
  const parsed = parseGroupingTag(tag)
  if (!parsed || parsed.category !== RELEASE_GROUPING_CATEGORY) return null
  return parsed.value
}

/**
 * Extracts the release type from a song's grouping tags.
 * Accepts both parsed Grouping entries ("release_ep") and raw Tags entries
 * ("grouping:release_ep", as stored by the MusicTags plugin).
 * If multiple release tags exist on one song, the first wins.
 * Returns null for untagged songs (treated as regular albums).
 */
export function getSongReleaseType(tags: string[] | undefined): string | null {
  if (!tags || !Array.isArray(tags)) return null
  for (const tag of tags) {
    const value = parseReleaseTag(tag.replace(/^grouping:/, ''))
    if (value) return value
  }
  return null
}

/**
 * Formats a release type value for display: "live-album" -> "Live Albums".
 * The value is capitalized and hyphens become spaces; plural "s" is appended
 * unless the value already ends in "s".
 */
export function formatReleaseTypeLabel(value: string): string {
  const words = value.replace(/-/g, ' ').split(' ')
  const label = words.map(w => capitalizeFirst(w)).join(' ')
  return /s$/i.test(label) ? label : `${label}s`
}


