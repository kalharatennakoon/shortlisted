import { addDays, fromKey, toKey } from './dates'
import { PLATFORMS, STATUSES, type Application, type Platform, type Status } from './types'

// "Heard back" = the company responded in some way (including a rejection).
const RESPONDED: Status[] = ['Interviewed', 'Offered', 'Accepted', 'Rejected']
const INTERVIEWED: Status[] = ['Interviewed', 'Offered', 'Accepted']
const ACTIVE: Status[] = ['Applied', 'Interviewed', 'Offered']

export interface Summary {
  total: number
  active: number
  responded: number
  responseRate: number | null // 0..1, null when no applications
  interviews: number
  offers: number
}

export function summarize(apps: Application[]): Summary {
  const count = (set: Status[]) => apps.filter((a) => set.includes(a.status)).length
  const responded = count(RESPONDED)
  return {
    total: apps.length,
    active: count(ACTIVE),
    responded,
    responseRate: apps.length ? responded / apps.length : null,
    interviews: count(INTERVIEWED),
    offers: count(['Offered', 'Accepted']),
  }
}

export function byStatus(apps: Application[]): { status: Status; count: number }[] {
  return STATUSES.map((status) => ({ status, count: apps.filter((a) => a.status === status).length }))
}

export interface PlatformRate {
  platform: Platform | 'Not set'
  total: number
  responded: number
  rate: number // 0..1
}

export function responseByPlatform(apps: Application[]): PlatformRate[] {
  const keys: (Platform | 'Not set')[] = [...PLATFORMS, 'Not set']
  return keys
    .map((platform) => {
      const group = apps.filter((a) => (a.platform ?? 'Not set') === platform)
      const responded = group.filter((a) => RESPONDED.includes(a.status)).length
      return { platform, total: group.length, responded, rate: group.length ? responded / group.length : 0 }
    })
    .filter((r) => r.total > 0)
}

// Local dates only (toISOString is UTC and shifts the day)
const mondayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))

export interface WeekCount {
  weekStart: string // YYYY-MM-DD (Monday)
  count: number
}

/** Applications per week (Mon-Sun) for the last `weeks` weeks, oldest first, including empty weeks. */
export function perWeek(apps: Application[], weeks = 12, today = new Date()): WeekCount[] {
  const thisMonday = mondayOf(today)
  const buckets: WeekCount[] = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7 * (weeks - 1 - i))
    return { weekStart: toKey(d), count: 0 }
  })
  const index = new Map(buckets.map((b, i) => [b.weekStart, i]))
  apps.forEach((a) => {
    if (!a.applied_on) return
    const [y, m, d] = a.applied_on.split('-').map(Number)
    const i = index.get(toKey(mondayOf(new Date(y, m - 1, d))))
    if (i !== undefined) buckets[i].count++
  })
  return buckets
}

// ---------- Range filter ----------

export type RangeId = '30d' | '90d' | 'all'
export const RANGES: { id: RangeId; label: string; days: number | null }[] = [
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
]

/**
 * Applications whose Applied On falls in the `days` days ending `endOffset` days before today
 * (endOffset 0 = the window ends today). `days` null = everything, including undated rows.
 */
export function inRange(apps: Application[], days: number | null, today = new Date(), endOffset = 0): Application[] {
  if (days === null) return apps
  const end = addDays(toKey(today), -endOffset)
  const start = addDays(end, -(days - 1))
  return apps.filter((a) => a.applied_on !== null && a.applied_on >= start && a.applied_on <= end)
}

/** How many weeks the weekly chart shows for a range. "All time" spans from the first application (4..26 weeks). */
export function weeksFor(apps: Application[], days: number | null, today = new Date()): number {
  if (days !== null) return Math.ceil(days / 7) + 1
  const first = apps.reduce<string | null>((m, a) => (a.applied_on && (!m || a.applied_on < m) ? a.applied_on : m), null)
  if (!first) return 12
  const span = Math.floor((mondayOf(today).getTime() - mondayOf(fromKey(first)).getTime()) / (7 * 86_400_000)) + 1
  return Math.min(26, Math.max(4, span))
}

// ---------- Funnel ----------

export interface FunnelStep {
  label: string
  hint: string
  count: number
  ofTotal: number | null // 0..1
  ofPrev: number | null // 0..1, conversion from the step above
}

/** Hiring funnel from each application's current status (a rejection after an interview counts as heard back only). */
export function funnel(apps: Application[]): FunnelStep[] {
  const count = (set: Status[]) => apps.filter((a) => set.includes(a.status)).length
  const raw = [
    { label: 'Applied', hint: 'Every application', count: apps.length },
    { label: 'Heard back', hint: 'Interviewed, offered, accepted or rejected', count: count(RESPONDED) },
    { label: 'Interviewed', hint: 'Interviewed, offered or accepted', count: count(INTERVIEWED) },
    { label: 'Offered', hint: 'Offered or accepted', count: count(['Offered', 'Accepted']) },
    { label: 'Accepted', hint: 'Accepted an offer', count: count(['Accepted']) },
  ]
  return raw.map((r, i) => ({
    ...r,
    ofTotal: apps.length ? r.count / apps.length : null,
    ofPrev: i === 0 ? null : raw[i - 1].count ? r.count / raw[i - 1].count : null,
  }))
}

// ---------- Highlights ----------

/** Platform with the best response rate, among platforms with at least `minApps` applications. */
export function bestPlatform(rates: PlatformRate[], minApps = 3): PlatformRate | null {
  return rates
    .filter((r) => r.platform !== 'Not set' && r.total >= minApps)
    .reduce<PlatformRate | null>((best, r) => (!best || r.rate > best.rate ? r : best), null)
}

/** Weeks in a row with at least one application, ending this week (or last week if this week has none yet). */
export function weekStreak(weeks: WeekCount[]): number {
  let i = weeks.length - 1
  if (i >= 0 && weeks[i].count === 0) i--
  let n = 0
  while (i >= 0 && weeks[i].count > 0) {
    n++
    i--
  }
  return n
}

export function busiestWeek(weeks: WeekCount[]): WeekCount | null {
  return weeks.reduce<WeekCount | null>((b, w) => (w.count > 0 && (!b || w.count >= b.count) ? w : b), null)
}
