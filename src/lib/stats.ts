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

// Local date helpers (avoid UTC shifts from toISOString)
const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
