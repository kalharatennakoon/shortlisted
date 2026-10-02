// Ready-to-edit emails about an application: a follow-up, a thank-you after an interview, a check-in.
// Pure functions. The app never sends anything: the draft opens in the user's own mail app or Gmail,
// where they can still change it before pressing send.

import { daysBetween, fromKey, todayKey } from './dates'
import type { Application } from './types'

export type TemplateId = 'follow-up' | 'thank-you' | 'check-in'

/** The fields a draft is built from (the form passes its unsaved values, so no id is needed) */
export type EmailApp = Pick<Application, 'name' | 'company' | 'applied_on' | 'platform' | 'status' | 'next_step' | 'next_date'>

export interface EmailSender {
  /** Signs the email; empty leaves the line after "Kind regards," for the user to fill in */
  name: string
  linkedinUrl?: string
}

export interface EmailDraft {
  subject: string
  body: string
}

export const EMAIL_TEMPLATES: { id: TemplateId; label: string; when: string; tip: string }[] = [
  {
    id: 'follow-up',
    label: 'Follow up',
    when: 'No reply to your application yet',
    tip: 'One follow-up after a week or two is normal. Keep it short.',
  },
  {
    id: 'thank-you',
    label: 'Thank you',
    when: 'Within a day of an interview',
    tip: 'Add a line about something specific you discussed before you send it.',
  },
  {
    id: 'check-in',
    label: 'Check in',
    when: 'No news after an interview',
    tip: 'Best sent once the date they gave you for a decision has passed.',
  },
]

/** The draft to open with: a thank-you once there has been an interview, otherwise a follow-up. */
export function defaultTemplate(app: EmailApp, today = todayKey()): TemplateId {
  const interviewHeld = app.next_step === 'Interview' && Boolean(app.next_date) && app.next_date! <= today
  return app.status === 'Interviewed' || interviewHeld ? 'thank-you' : 'follow-up'
}

/** "12 September 2026". Emails are written in English, so the format doesn't follow the device. */
const longDate = (key: string) =>
  fromKey(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

const VIA: Partial<Record<NonNullable<Application['platform']>, string>> = {
  LinkedIn: 'through LinkedIn',
  'Company Website': 'through your website',
  Email: 'by email',
}

/** " today", " yesterday", " on 30 September 2026", or '' when the interview date isn't known (or hasn't come yet) */
function interviewWhen(app: EmailApp, today: string): string {
  if (app.next_step !== 'Interview' || !app.next_date) return ''
  const days = daysBetween(app.next_date, today)
  if (days < 0) return ''
  if (days === 0) return ' today'
  if (days === 1) return ' yesterday'
  return ` on ${longDate(app.next_date)}`
}

export function buildEmail(id: TemplateId, app: EmailApp, sender: EmailSender, today = todayKey()): EmailDraft {
  const role = app.name.trim() || 'the advertised'
  const company = app.company?.trim() || ''
  const position = `${role} position${company ? ` at ${company}` : ''}`
  const greeting = `Dear ${company ? `${company} ` : ''}Hiring Team,`
  const signature = ['Kind regards,', sender.name.trim(), sender.linkedinUrl?.trim()].filter(Boolean).join('\n')

  let subject: string
  let paragraphs: string[]
  switch (id) {
    case 'thank-you':
      subject = `Thank you for the interview: ${role}`
      paragraphs = [
        `Thank you for taking the time to interview me${interviewWhen(app, today)} for the ${position}.`,
        'I enjoyed learning more about the role and the team, and our conversation made me even more keen to join.',
        'Please let me know if you need anything further from me. I look forward to hearing about the next steps.',
      ]
      break
    case 'check-in':
      subject = `Checking in: ${role} position`
      paragraphs = [
        `Thank you again for the opportunity to interview for the ${position}.`,
        'I am writing to ask whether there is any update on your decision, or on the timeline for the next steps. I remain very interested in the role.',
        'Thank you for your time.',
      ]
      break
    default: {
      const on = app.applied_on ? ` on ${longDate(app.applied_on)}` : ''
      const via = app.platform && VIA[app.platform] ? ` ${VIA[app.platform]}` : ''
      subject = `Following up on my application: ${role}`
      paragraphs = [
        `I applied for the ${position}${on}${via}, and I am writing to ask whether there is any update on my application.`,
        'I am still very interested in the role and would be glad to send anything else you need.',
        'Thank you for your time. I look forward to hearing from you.',
      ]
    }
  }
  return { subject, body: [greeting, ...paragraphs, signature].join('\n\n') }
}

// ---------- Opening the draft ----------

/** Good enough to decide whether to put a value in a link's "to"; the mail app does the real validation. */
export const isEmail = (s: string | null | undefined): s is string => /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]+$/.test(s?.trim() ?? '')

export interface Message extends EmailDraft {
  to?: string | null
}

/** `mailto:` link: opens the device's default mail app. Line breaks must be CRLF (RFC 6068). */
export function mailtoUrl({ to, subject, body }: Message): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, '\r\n'))
  const address = isEmail(to) ? encodeURIComponent(to.trim()).replace(/%40/g, '@') : ''
  return `mailto:${address}?subject=${enc(subject)}&body=${enc(body)}`
}

/** Gmail's compose window in the browser, for people who don't have a mail app set up on their computer. */
export function gmailUrl({ to, subject, body }: Message): string {
  const q = new URLSearchParams({ view: 'cm', fs: '1' })
  if (isEmail(to)) q.set('to', to.trim())
  q.set('su', subject)
  q.set('body', body)
  return `https://mail.google.com/mail/?${q.toString()}`
}
