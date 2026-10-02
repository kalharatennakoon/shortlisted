// Job posting checks: is the saved posting (job_url) still up, and when did the user last look?
// Checks are manual. The app can't fetch other sites from the browser, and job sites block automated visits.

import { daysBetween, todayKey } from './dates'
import { fmtDate } from './format'
import type { Application } from './types'

/** Suggest another look once a posting hasn't been checked for this long */
export const POSTING_RECHECK_DAYS = 7

type HasUrl = Pick<Application, 'job_url'>
type Checkable = Pick<Application, 'job_url' | 'posting_checked_on' | 'posting_closed'>

/**
 * The saved URL as something safe to put in a link, or null.
 * Only http(s): the value is typed or imported by the user and must never become a `javascript:` link.
 * "www.example.com/jobs/1" (no scheme, common in spreadsheets) is treated as https.
 */
export function postingUrl(app: HasUrl): string | null {
  const raw = app.job_url?.trim()
  if (!raw) return null
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? u.href : null
  } catch {
    return null
  }
}

export type PostingState = 'none' | 'closed' | 'unchecked' | 'due' | 'checked'

/** none = no link saved · closed = taken down · unchecked = never looked · due = a week or more since the last look */
export function postingState(app: Checkable, today = todayKey()): PostingState {
  if (app.posting_closed) return 'closed'
  if (!postingUrl(app)) return 'none'
  if (!app.posting_checked_on) return 'unchecked'
  return daysBetween(app.posting_checked_on, today) >= POSTING_RECHECK_DAYS ? 'due' : 'checked'
}

/** "today", "yesterday", "5 days ago", then a date */
export function checkedAgo(date: string, today = todayKey()): string {
  const days = daysBetween(date, today)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return days < 14 ? `${days} days ago` : `on ${fmtDate(date)}`
}

/** One line describing the posting, for the form and the follow-up list */
export function postingSummary(app: Checkable, today = todayKey()): string {
  const when = app.posting_checked_on ? checkedAgo(app.posting_checked_on, today) : null
  switch (postingState(app, today)) {
    case 'none': return ''
    case 'closed': return when ? `Posting closed, checked ${when}` : 'Posting closed'
    case 'unchecked': return 'Posting not checked yet'
    default: return `Posting still open, checked ${when}`
  }
}
