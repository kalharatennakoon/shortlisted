import { addDays, daysBetween, fromKey, todayKey } from './dates'
import type { Application } from './types'

/** An "Applied" application with no reply and no planned step after this many days gets a follow-up nudge. */
export const FOLLOW_UP_AFTER_DAYS = 14

export type Urgency = 'overdue' | 'today' | 'soon' | 'later'

export interface PlannedStep {
  app: Application
  date: string
  urgency: Urgency
  label: string // "Overdue · 3 days", "Today", "Tomorrow", "Thu", "Oct 3"
}

export function urgencyOf(date: string, today = todayKey()): Urgency {
  const d = daysBetween(today, date)
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  if (d <= 6) return 'soon'
  return 'later'
}

/** Human label for a step date. `compact` drops the day count on overdue items (for small badges). */
export function relativeLabel(date: string, today = todayKey(), compact = false): string {
  const d = daysBetween(today, date)
  if (d < 0) return compact ? 'Overdue' : `Overdue · ${-d} day${d === -1 ? '' : 's'}`
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  const dt = fromKey(date)
  if (d <= 6) return dt.toLocaleDateString(undefined, { weekday: 'short' })
  const sameYear = dt.getFullYear() === fromKey(today).getFullYear()
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** Applications with a dated next step, soonest (most overdue) first. */
export function plannedSteps(apps: Application[], today = todayKey()): PlannedStep[] {
  return apps
    .filter((a) => a.next_step && a.next_date)
    .map((a) => ({ app: a, date: a.next_date!, urgency: urgencyOf(a.next_date!, today), label: relativeLabel(a.next_date!, today) }))
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
}

/** Still "Applied", nothing planned, applied at least FOLLOW_UP_AFTER_DAYS ago. Oldest first. */
export function needsFollowUp(apps: Application[], today = todayKey()): Application[] {
  const cutoff = addDays(today, -FOLLOW_UP_AFTER_DAYS)
  return apps
    .filter((a) => a.status === 'Applied' && !a.next_step && a.applied_on && a.applied_on <= cutoff)
    .sort((x, y) => (x.applied_on! < y.applied_on! ? -1 : 1))
}

export const isStale = (a: Application, today = todayKey()) => needsFollowUp([a], today).length === 1
