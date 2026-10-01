import type { Status } from './types'

/** "Sep 25" for this year, "Sep 25, 2025" otherwise */
export const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const date = new Date(d + 'T00:00:00')
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

export const statusClass = (s: Status) => `status-${s.replace(' ', '-').toLowerCase()}`

/** "Acme Labs" -> "AL", "IFS" -> "IF" (first letters of the first two words, or first two letters) */
export const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const s = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)
  return s.toUpperCase()
}

/** Stable hue (0-359) for a name, so the same company always gets the same monogram colour */
export const hueOf = (name: string) => {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}
