import { timeKey } from './dates'
import type { Status } from './types'

/** "Sep 25" for this year, "Sep 25, 2025" otherwise */
export const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const date = new Date(d + 'T00:00:00')
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** "2:30 PM" (or "14:30", following the device) from 'HH:MM' / 'HH:MM:SS'; '' when there is no time */
export const fmtTime = (t: string | null | undefined) => {
  const key = timeKey(t)
  if (!key) return ''
  const [h, m] = key.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export const statusClass = (s: Status) => `status-${s.replace(' ', '-').toLowerCase()}`

