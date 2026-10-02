import { addDays, daysBetween, fromKey, timeKey, todayKey } from './dates'
import { fmtTime } from './format'
import type { Application } from './types'

/** An "Applied" application with no reply and no planned step after this many days gets a follow-up nudge. */
export const FOLLOW_UP_AFTER_DAYS = 14

export type Urgency = 'overdue' | 'today' | 'soon' | 'later'

export interface PlannedStep {
  app: Application
  date: string
  urgency: Urgency
  label: string // "Overdue · 3 days", "Today", "Tomorrow · 2:30 PM", "Thu", "Oct 3"
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

/** The step's time as 'HH:MM', or null for an all-day step (also when the row has no date to go with it). */
export const stepTime = (a: Pick<Application, 'next_date' | 'next_time'>) => (a.next_date ? timeKey(a.next_time) : null)

/** "Tomorrow · 2:30 PM". Overdue steps keep the plain label: how late matters more than the hour. */
export function stepLabel(a: Pick<Application, 'next_date' | 'next_time'>, today = todayKey(), compact = false): string {
  const label = relativeLabel(a.next_date!, today, compact)
  const time = stepTime(a)
  return time && a.next_date! >= today ? `${label} · ${fmtTime(time)}` : label
}

/** Applications with a dated next step, soonest (most overdue) first; within a day, all-day steps then by time. */
export function plannedSteps(apps: Application[], today = todayKey()): PlannedStep[] {
  const key = (a: Application) => `${a.next_date}T${stepTime(a) ?? ''}`
  return apps
    .filter((a) => a.next_step && a.next_date)
    .map((a) => ({ app: a, date: a.next_date!, urgency: urgencyOf(a.next_date!, today), label: stepLabel(a, today) }))
    .sort((x, y) => (key(x.app) < key(y.app) ? -1 : key(x.app) > key(y.app) ? 1 : 0))
}

/** Still "Applied", nothing planned, applied at least FOLLOW_UP_AFTER_DAYS ago. Oldest first. */
export function needsFollowUp(apps: Application[], today = todayKey()): Application[] {
  const cutoff = addDays(today, -FOLLOW_UP_AFTER_DAYS)
  return apps
    .filter((a) => a.status === 'Applied' && !a.next_step && a.applied_on && a.applied_on <= cutoff)
    .sort((x, y) => (x.applied_on! < y.applied_on! ? -1 : 1))
}

export const isStale = (a: Application, today = todayKey()) => needsFollowUp([a], today).length === 1
