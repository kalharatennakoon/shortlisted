// Local-calendar date helpers. Dates are stored as 'YYYY-MM-DD' strings; never go through
// toISOString() for "today", which is UTC and gives yesterday's date early in the morning in Sri Lanka.

export const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayKey = (now = new Date()) => toKey(now)

export const addDays = (key: string, days: number) => {
  const d = fromKey(key)
  d.setDate(d.getDate() + days)
  return toKey(d)
}

/** Whole days from a to b (b - a), ignoring time of day and DST. */
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / 86_400_000)

function ymd(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number)
  return [y, m - 1, d]
}
