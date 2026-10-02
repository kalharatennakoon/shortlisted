// "Add to calendar" for a dated next step: a Google Calendar link and an .ics file (Apple Calendar, Outlook).
// Pure functions. Nothing is synced: the user adds one event, in their own calendar, when they press the button.

import { fromKey, timeKey } from './dates'
import { fmtTime } from './format'
import { postingUrl } from './posting'
import type { Application, NextStep } from './types'

/** The fields an event is built from (the form passes its unsaved values) */
export type CalendarApp = Pick<Application, 'name' | 'company' | 'next_step' | 'next_date' | 'next_time' | 'job_url' | 'contact_email'> & {
  id?: string
}

export interface CalendarEvent {
  uid: string
  title: string
  /** YYYY-MM-DD */
  date: string
  /** 'HH:MM', or null for an all-day event */
  time: string | null
  /** Length of a timed event */
  minutes: number
  description: string
}

/** How long to block out when the step has a time */
const MINUTES: Record<NextStep, number> = { Interview: 60, Assessment: 60, Call: 30, 'Follow up': 15, Other: 30 }

/** The calendar event for an application's next step, or null when it has no dated step. */
export function eventFor(app: CalendarApp, appLink?: string): CalendarEvent | null {
  if (!app.next_step || !app.next_date || !/^\d{4}-\d{2}-\d{2}$/.test(app.next_date)) return null
  const role = app.name.trim() || 'Job application'
  const company = app.company?.trim() || ''
  const what = `${role}${company ? ` at ${company}` : ''}`
  const posting = postingUrl(app)
  const contact = app.contact_email?.trim()
  const description = [
    `Role: ${role}`,
    company ? `Company: ${company}` : null,
    posting ? `Job posting: ${posting}` : null,
    contact ? `Contact: ${contact}` : null,
    '',
    appLink ? `From Job Tracker: ${appLink}` : 'From Job Tracker',
  ]
    .filter((line) => line !== null)
    .join('\n')
  return {
    // a new date is a new event (a second interview shouldn't replace the first in the calendar); a new time updates it
    uid: `${app.id ?? 'new'}-${app.next_date}-${app.next_step.toLowerCase().replace(/\s+/g, '-')}@job-tracker`,
    title: `${app.next_step === 'Other' ? 'Next step' : app.next_step}: ${what}`,
    date: app.next_date,
    time: timeKey(app.next_time),
    minutes: MINUTES[app.next_step],
    description,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayStamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
const localStamp = (d: Date) => `${dayStamp(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`
const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`

/** Start and end as local Dates. All-day events end on the next day (the end is exclusive in both formats). */
function span(ev: CalendarEvent): { start: Date; end: Date } {
  const start = fromKey(ev.date)
  if (!ev.time) return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) }
  const [h, m] = ev.time.split(':').map(Number)
  start.setHours(h, m, 0, 0)
  return { start, end: new Date(start.getTime() + ev.minutes * 60_000) }
}

/** "Mon, 5 Oct · 2:30 PM – 3:30 PM" or "Mon, 5 Oct · All day" */
export function eventWhen(ev: CalendarEvent): string {
  const { start, end } = span(ev)
  const day = start.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(start.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  })
  if (!ev.time) return `${day} · All day`
  return `${day} · ${fmtTime(ev.time)} – ${fmtTime(`${pad(end.getHours())}:${pad(end.getMinutes())}`)}`
}

/**
 * Opens Google Calendar's "new event" screen with everything filled in; the user still presses Save there.
 * Timed events are given as local wall-clock time plus the device's time zone, so 14:30 stays 14:30.
 */
export function googleCalendarUrl(ev: CalendarEvent, timeZone = deviceTimeZone()): string {
  const { start, end } = span(ev)
  const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.title })
  q.set('dates', ev.time ? `${localStamp(start)}/${localStamp(end)}` : `${dayStamp(start)}/${dayStamp(end)}`)
  q.set('details', ev.description)
  if (ev.time && timeZone) q.set('ctz', timeZone)
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

// ---------- .ics (RFC 5545) ----------

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Lines longer than 75 bytes continue on the next line after a space; never split inside a character. */
function fold(line: string): string {
  const bytes = (ch: string) => new TextEncoder().encode(ch).length
  const out: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const b = bytes(ch)
    if (size + b > 75) {
      out.push(current)
      current = ' '
      size = 1
    }
    current += ch
    size += b
  }
  out.push(current)
  return out.join('\r\n')
}

/** A one-event calendar file. Timed events are written in UTC and get a reminder an hour before. */
export function icsFile(ev: CalendarEvent, now = new Date()): string {
  const { start, end } = span(ev)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Job Tracker//Next steps//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    ...(ev.time
      ? [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`]
      : [`DTSTART;VALUE=DATE:${dayStamp(start)}`, `DTEND;VALUE=DATE:${dayStamp(end)}`]),
    `SUMMARY:${icsText(ev.title)}`,
    `DESCRIPTION:${icsText(ev.description)}`,
    ...(ev.time ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(ev.title)}`, 'TRIGGER:-PT1H', 'END:VALARM'] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** "interview-staff-nurse-2026-10-05.ics" */
export function icsFileName(ev: CalendarEvent): string {
  const slug = ev.title
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return `${slug || 'next-step'}-${ev.date}.ics`
}

/** Hands the file to the browser. On phones this opens the calendar app's "add event" screen. */
export function downloadIcs(ev: CalendarEvent): void {
  const url = URL.createObjectURL(new Blob([icsFile(ev)], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = icsFileName(ev)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
