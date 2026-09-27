import type { Status } from './types'

/** "Sep 25" for this year, "Sep 25, 2025" otherwise */
export const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const date = new Date(d + 'T00:00:00')
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

export const statusClass = (s: Status) => `status-${s.replace(' ', '-').toLowerCase()}`
