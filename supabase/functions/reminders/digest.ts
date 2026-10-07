// Pure digest logic for the reminders function: no Deno/npm imports, so it can be unit-tested with Node.
// Mirrors src/lib/nextSteps.ts (same 14-day follow-up rule) so emails match the "Up next" strip in the app.

export interface AppRow {
  id: string
  name: string
  company: string | null
  status: string
  applied_on: string | null
  next_step: string | null
  next_date: string | null
  /** Time of the next step, 'HH:MM:SS' from Postgres. Null or absent (a database without the column yet) = all day */
  next_time?: string | null
}

export interface Digest {
  overdue: AppRow[]
  today: AppRow[]
  tomorrow: AppRow[]
  followUps: AppRow[] // only filled on Mondays (and in test emails)
}

export const FOLLOW_UP_AFTER_DAYS = 14

/** Local date (YYYY-MM-DD), hour and weekday (0 = Sunday) of `now` in an IANA time zone. */
export function localParts(now: Date, timeZone: string): { date: string; hour: number; weekday: number } {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(now)
  } catch {
    return localParts(now, 'Asia/Colombo') // unknown zone saved somehow: fall back to the app's home zone
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24, weekday }
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10) // safe here: the Date is built in UTC
}

export function daysBetween(a: string, b: string): number {
  const u = (k: string) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((u(b) - u(a)) / 86_400_000)
}

/** 'HH:MM' from Postgres' 'HH:MM:SS' (or 'HH:MM'); null if it isn't a time. Same rule as timeKey() in src/lib/dates.ts */
export function timeKey(t: string | null | undefined): string | null {
  const m = t?.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return null
  const h = Number(m[1])
  return h < 24 && Number(m[2]) < 60 ? `${String(h).padStart(2, '0')}:${m[2]}` : null
}

/**
 * "2:30 PM", or '' when there is no time. The app follows the device's 12/24-hour setting; an email can't know it,
 * so it always uses the 12-hour clock with AM/PM, which nobody can misread.
 */
export function fmtTime(t: string | null | undefined): string {
  const key = timeKey(t)
  if (!key) return ''
  const [h, m] = key.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** Is this user due a digest on this run? Once per local day, on the first run at or after their hour. */
export function isDue(now: Date, r: { time_zone: string; send_hour: number; last_sent_on: string | null }): boolean {
  const { date, hour } = localParts(now, r.time_zone)
  return hour >= r.send_hour && (!r.last_sent_on || r.last_sent_on < date)
}

export function buildDigest(apps: AppRow[], today: string, includeFollowUps: boolean): Digest {
  const tomorrow = addDays(today, 1)
  // Soonest first; within a day, all-day steps and then by time (as plannedSteps() does in the app)
  const key = (a: AppRow) => `${a.next_date}T${timeKey(a.next_time) ?? ''}`
  const planned = apps
    .filter((a) => a.next_step && a.next_date)
    .sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0))
  const cutoff = addDays(today, -FOLLOW_UP_AFTER_DAYS)
  return {
    overdue: planned.filter((a) => a.next_date! < today),
    today: planned.filter((a) => a.next_date === today),
    tomorrow: planned.filter((a) => a.next_date === tomorrow),
    followUps: includeFollowUps
      ? apps
          .filter((a) => a.status === 'Applied' && !a.next_step && a.applied_on && a.applied_on <= cutoff)
          .sort((x, y) => (x.applied_on! < y.applied_on! ? -1 : 1))
      : [],
  }
}

export const isEmpty = (d: Digest) => !d.overdue.length && !d.today.length && !d.tomorrow.length && !d.followUps.length

// ---------- Email rendering ----------

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const title = (a: AppRow) => (a.company ? `${a.name} at ${a.company}` : a.name)

export function subjectFor(d: Digest): string {
  const bits: string[] = []
  if (d.today.length) bits.push(`${d.today.length} today`)
  if (d.overdue.length) bits.push(`${d.overdue.length} overdue`)
  if (d.tomorrow.length) bits.push(`${d.tomorrow.length} tomorrow`)
  if (bits.length) return `Shortlistd: ${bits.join(', ')}`
  if (d.followUps.length) return `Shortlistd: ${d.followUps.length} application${d.followUps.length === 1 ? '' : 's'} to follow up`
  return 'Shortlistd: your reminders'
}

/** `time` ("2:30 PM") leads the line when the step has one; '' for all-day steps and everything else */
interface Item { time: string; line: string; note: string }
interface Section { heading: string; color: string; items: Item[] }

function sections(d: Digest, today: string): Section[] {
  const step = (a: AppRow) => a.next_step ?? 'Next step'
  const timed = (a: AppRow): Item => ({ time: fmtTime(a.next_time), line: `${step(a)}: ${title(a)}`, note: '' })
  const s: Section[] = []
  if (d.overdue.length) s.push({
    heading: 'Overdue', color: '#b91c1c',
    items: d.overdue.map((a) => {
      const n = daysBetween(a.next_date!, today)
      // No time here, as in the app: once a step is overdue, how late it is matters more than the hour
      return { time: '', line: `${step(a)}: ${title(a)}`, note: `${n} day${n === 1 ? '' : 's'} overdue` }
    }),
  })
  if (d.today.length) s.push({ heading: 'Today', color: '#1d4ed8', items: d.today.map(timed) })
  if (d.tomorrow.length) s.push({ heading: 'Tomorrow', color: '#374151', items: d.tomorrow.map(timed) })
  if (d.followUps.length) s.push({
    heading: 'Worth a follow-up', color: '#a16207',
    items: d.followUps.map((a) => {
      const n = daysBetween(a.applied_on!, today)
      return { time: '', line: title(a), note: `applied ${n} days ago, no reply yet` }
    }),
  })
  return s
}

export function renderText(d: Digest, today: string, appUrl: string, unsubscribeUrl: string, test = false): string {
  const out: string[] = []
  if (test) out.push('This is a test email. Real reminders only arrive when something is due.', '')
  const secs = sections(d, today)
  if (!secs.length) out.push('Nothing is due right now.')
  for (const s of secs) {
    out.push(s.heading.toUpperCase())
    for (const i of s.items) out.push(`- ${i.time ? `${i.time} · ` : ''}${i.line}${i.note ? ` (${i.note})` : ''}`)
    out.push('')
  }
  out.push(`Open Shortlistd: ${appUrl}`, '', `Stop these emails: ${unsubscribeUrl}`)
  return out.join('\n')
}

export function renderHtml(d: Digest, today: string, appUrl: string, unsubscribeUrl: string, test = false): string {
  const secs = sections(d, today)
  const body = secs.length
    ? secs.map((s) => `
      <tr><td style="padding:18px 0 6px;font:600 13px/1.4 Inter,Segoe UI,Arial,sans-serif;color:${s.color};text-transform:uppercase;letter-spacing:.04em">${esc(s.heading)}</td></tr>
      ${s.items.map((i) => `
      <tr><td style="padding:10px 14px;border:1px solid #e5e7eb;border-radius:10px;background:#ffffff;font:15px/1.45 Inter,Segoe UI,Arial,sans-serif;color:#111827">
        ${i.time ? `<strong style="font-weight:600;white-space:nowrap">${esc(i.time)}</strong> · ` : ''}${esc(i.line)}${i.note ? `<br><span style="font-size:13px;color:#6b7280">${esc(i.note)}</span>` : ''}
      </td></tr><tr><td style="height:6px"></td></tr>`).join('')}`).join('')
    : `<tr><td style="padding:16px 0;font:15px/1.5 Inter,Segoe UI,Arial,sans-serif;color:#374151">Nothing is due right now.</td></tr>`
  return `<!doctype html><html><body style="margin:0;background:#f7f8fa">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px">
<tr><td style="padding:24px 24px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:32px;height:32px"><img src="${esc(appUrl)}icon-192.png" width="32" height="32" alt="" style="display:block;border-radius:8px"></td>
    <td style="padding-left:10px;font:700 17px/1 Inter,Segoe UI,Arial,sans-serif;color:#111827">Shortlistd</td>
  </tr></table>
</td></tr>
<tr><td style="padding:0 24px">
  ${test ? `<p style="margin:12px 0 0;padding:10px 12px;border-radius:8px;background:#eff4ff;font:13px/1.5 Inter,Segoe UI,Arial,sans-serif;color:#1d4ed8">This is a test email. Real reminders only arrive when something is due.</p>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
</td></tr>
<tr><td style="padding:14px 24px 24px">
  <a href="${esc(appUrl)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#ffffff;text-decoration:none;font:600 14px/1 Inter,Segoe UI,Arial,sans-serif">Open Shortlistd</a>
</td></tr>
</table>
<p style="max-width:560px;margin:14px auto 0;font:12px/1.5 Inter,Segoe UI,Arial,sans-serif;color:#6b7280">
  You're getting this because you turned on email reminders in Shortlistd.
  <a href="${esc(unsubscribeUrl)}" style="color:#6b7280">Stop these emails</a> or change the time in your profile.
</p>
</td></tr></table></body></html>`
}
