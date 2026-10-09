import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/errors'
import { ExternalIcon, MailIcon, SparkleIcon, XIcon } from './Icons'
import AttachedDocuments from './AttachedDocuments'
import { CalendarButtons } from './AddToCalendar'
import TimePicker from './TimePicker'
import EmailDialog, { type EmailUse } from './EmailDialog'
import CvCheckDialog from './CvCheckDialog'
import QuickAdd from './QuickAdd'
import { CV_ANALYZER_NAME } from '../lib/cvCheck'
import { eventFor } from '../lib/calendarLinks'
import { fillForm, fillNote, type FilledField, type JobLinkAnswer, type LastFill } from '../lib/jobLink'
import { addDays, timeKey, todayKey } from '../lib/dates'
import { appUrl } from '../lib/supabase'
import { postingState, postingSummary, postingUrl } from '../lib/posting'
import { NEXT_STEPS, PLATFORMS, PRIORITIES, STATUSES, type Application, type ApplicationInput, type JobDocument } from '../lib/types'

interface Props {
  initial?: Application
  initialDate?: string
  /** Status for a new application (e.g. added from a board column) */
  initialStatus?: ApplicationInput['status']
  /** Saves the application and makes its attached documents match `documentIds` */
  onSave: (input: ApplicationInput, documentIds: string[]) => Promise<void>
  docs: JobDocument[]
  initialDocIds?: string[]
  onDocUploaded: (doc: JobDocument) => void
  onDelete?: () => Promise<void>
  onClose: () => void
}

const QUICK_DATES: [string, number][] = [
  ['Tomorrow', 1],
  ['In 3 days', 3],
  ['Next week', 7],
]

const empty: ApplicationInput = {
  name: '',
  company: '',
  applied_on: todayKey(), // local date (toISOString would be UTC: yesterday before 05:30 in Sri Lanka)
  platform: null,
  priority: null,
  status: 'Applied',
  job_url: '',
  notes: '',
  next_step: null,
  next_date: null,
}

export default function ApplicationForm({
  initial, initialDate, initialStatus, onSave, onDelete, onClose, docs, initialDocIds = [], onDocUploaded,
}: Props) {
  const [form, setForm] = useState<ApplicationInput>(
    // todayKey() here, not in `empty`: a tab left open overnight would otherwise default to yesterday
    initial ?? { ...empty, applied_on: initialDate ?? todayKey(), status: initialStatus ?? empty.status },
  )
  const [docIds, setDocIds] = useState<string[]>(initialDocIds)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)
  const [cvCheckOpen, setCvCheckOpen] = useState(false)

  // Escape closes the form, like the other dialogs. Not while saving, and not while the email draft or the CV check
  // is open on top (they close themselves). The time picker stops its own Escape before it gets here.
  useEffect(() => {
    if (busy || emailOpen || cvCheckOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, emailOpen, cvCheckOpen, onClose])

  const set = <K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // Quick add (new applications only): what it last put in each field, so a second link can replace its own
  // values but never something typed by hand, and which fields to light up for a moment
  const formNow = useRef(form)
  useEffect(() => {
    formNow.current = form
  })
  const lastFill = useRef<LastFill>({})
  const [justFilled, setJustFilled] = useState<FilledField[]>([])
  useEffect(() => {
    if (!justFilled.length) return
    const timer = setTimeout(() => setJustFilled([]), 2400)
    return () => clearTimeout(timer)
  }, [justFilled])
  const lit = (field: FilledField) => (justFilled.includes(field) ? 'just-filled' : undefined)

  function onLinkRead(answer: JobLinkAnswer) {
    const fill = fillForm(formNow.current, answer, lastFill.current)
    lastFill.current = fill.last
    setForm(fill.form)
    setJustFilled(fill.filled)
    return fillNote(answer, fill.filled)
  }

  const url = postingUrl(form)
  /** Record that the posting was looked at today, and whether it was still up */
  const checkPosting = (closed: boolean) =>
    setForm((f) => ({ ...f, posting_checked_on: todayKey(), posting_closed: closed }))
  /** A different link is a different posting: the old check no longer says anything about it */
  const setJobUrl = (value: string) =>
    setForm((f) => ({
      ...f,
      job_url: value,
      ...(f.posting_checked_on || f.posting_closed ? { posting_checked_on: null, posting_closed: false } : {}),
    }))

  // The next step as a calendar event, from what's in the form right now (saved or not)
  const calendarEvent = eventFor({ ...form, id: initial?.id }, appUrl())
  /** No date, no time: a time only means something on a day */
  const setNextDate = (value: string | null) =>
    setForm((f) => ({ ...f, next_date: value, ...(!value && f.next_time ? { next_time: null } : {}) }))
  /** The email draft was opened: keep the address, and plan the check for a reply if asked */
  const onEmailUsed = ({ contactEmail, remindOn }: EmailUse) =>
    setForm((f) => ({
      ...f,
      ...(contactEmail ? { contact_email: contactEmail } : {}),
      ...(remindOn ? { next_step: 'Follow up' as const, next_date: remindOn, ...(f.next_time ? { next_time: null } : {}) } : {}),
    }))

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    // store empty strings as null
    const clean = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]),
    ) as ApplicationInput
    // Columns from a later migration (see types.ts): leave them out unless there is something to save or
    // the row already has them, so saving still works on a database that hasn't had the migration yet
    for (const key of ['next_time', 'contact_email'] as const) {
      if (clean[key] == null && initial?.[key] === undefined) delete clean[key]
    }
    if ('next_time' in clean) clean.next_time = clean.next_date ? timeKey(clean.next_time) : null
    run(() => onSave(clean, docIds))
  }

  return (
    <>
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal app-form" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{initial ? 'Edit application' : 'New application'}</h2>
          <button type="button" className="ghost icon-only" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </header>

        {!initial && <QuickAdd onAnswer={onLinkRead} disabled={busy} />}

        <section className="form-section" aria-labelledby="sec-job">
          <h3 id="sec-job">The job</h3>
          <label>
            Role
            <input required className={lit('name')} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. DevOps Engineer" />
          </label>
          <label>
            Company
            <input className={lit('company')} value={form.company ?? ''} onChange={(e) => set('company', e.target.value)} />
          </label>
        </section>

        <section className="form-section" aria-labelledby="sec-application">
          <h3 id="sec-application">Your application</h3>
          <div className="grid-2">
            <label>
              Applied on
              <input type="date" value={form.applied_on ?? ''} onChange={(e) => set('applied_on', e.target.value)} />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(e) => set('status', e.target.value as ApplicationInput['status'])}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>
              Platform
              <select className={lit('platform')} value={form.platform ?? ''} onChange={(e) => set('platform', (e.target.value || null) as ApplicationInput['platform'])}>
                <option value="">—</option>
                {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label>
              Priority
              <select value={form.priority ?? ''} onChange={(e) => set('priority', (e.target.value || null) as ApplicationInput['priority'])}>
                <option value="">—</option>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="form-section" aria-labelledby="sec-next">
          <h3 id="sec-next">
            Next step <span className="muted">optional</span>
          </h3>
          <div className="next-grid">
            <label>
              What
              <select
                value={form.next_step ?? ''}
                // a date needs a step to go with it
                required={Boolean(form.next_date)}
                onChange={(e) => set('next_step', (e.target.value || null) as ApplicationInput['next_step'])}
              >
                <option value="">—</option>
                {NEXT_STEPS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                value={form.next_date ?? ''}
                // a step needs a date so it can show up in "Up next"
                required={Boolean(form.next_step)}
                onChange={(e) => setNextDate(e.target.value || null)}
              />
            </label>
            {/* Not a <label> wrapper: the picker holds several buttons (see CLAUDE.md, UI) */}
            <div className="field">
              <span id="next-time-label">Time</span>
              <TimePicker
                labelledBy="next-time-label"
                value={form.next_time}
                disabled={!form.next_date}
                disabledHint="Choose a date first"
                onChange={(t) => set('next_time', t)}
              />
            </div>
          </div>
          <div className="quick-dates">
            {QUICK_DATES.map(([label, days]) => (
              <button key={label} type="button" className="chip" onClick={() => setNextDate(addDays(todayKey(), days))}>
                {label}
              </button>
            ))}
            {(form.next_step || form.next_date) && (
              <button
                type="button"
                className="link small"
                onClick={() => setForm((f) => ({ ...f, next_step: null, next_date: null, ...(f.next_time ? { next_time: null } : {}) }))}
              >
                Clear
              </button>
            )}
          </div>
          {calendarEvent && (
            <div className="cal-add-row">
              <span className="muted small">Add to calendar</span>
              <CalendarButtons event={calendarEvent} chips />
            </div>
          )}
        </section>

        <section className="form-section" aria-labelledby="sec-posting">
          <h3 id="sec-posting">
            Job posting <span className="muted">optional</span>
          </h3>
          {/* Not a <label> wrapper: it also holds a link and buttons (see CLAUDE.md, UI) */}
          <div className="field">
            <label htmlFor="job-url">Link</label>
            <div className="posting-row">
              <input
                id="job-url"
                type="url"
                placeholder="https://…"
                className={lit('job_url')}
                value={form.job_url ?? ''}
                onChange={(e) => setJobUrl(e.target.value)}
              />
              {url && (
                <a className="btn secondary" href={url} target="_blank" rel="noopener noreferrer">
                  Open <ExternalIcon size={14} />
                </a>
              )}
            </div>
            {url && (
              <div className="posting-check">
                <span className={`posting-state ${postingState(form)}`}>{postingSummary(form)}</span>
                <span className="spacer" />
                <button type="button" className="chip" onClick={() => checkPosting(false)}>
                  {form.posting_closed ? 'Mark as open' : 'Still open today'}
                </button>
                {!form.posting_closed && (
                  <button type="button" className="chip" onClick={() => checkPosting(true)}>
                    Posting closed
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="form-section" aria-labelledby="sec-contact">
          <h3 id="sec-contact">
            Contact <span className="muted">optional</span>
          </h3>
          <div className="field">
            <label htmlFor="contact-email">Email of the recruiter or hiring contact</label>
            <div className="posting-row">
              <input
                id="contact-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                maxLength={254}
                placeholder="name@company.com"
                value={form.contact_email ?? ''}
                onChange={(e) => set('contact_email', e.target.value)}
              />
              <button type="button" className="secondary" onClick={() => setEmailOpen(true)} title="Draft a follow-up or thank-you email">
                <MailIcon size={15} /> Draft email
              </button>
            </div>
          </div>
        </section>

        <AttachedDocuments docs={docs} selected={docIds} onChange={setDocIds} onUploaded={onDocUploaded}>
          <div className="cv-check-row">
            <button type="button" className="chip" onClick={() => setCvCheckOpen(true)}>
              <SparkleIcon size={13} />
              {url ? 'Check my CV against this posting' : 'Check my CV for this role'}
            </button>
            <span className="muted small">with {CV_ANALYZER_NAME}</span>
          </div>
        </AttachedDocuments>

        <section className="form-section" aria-labelledby="sec-notes">
          <h3 id="sec-notes">
            <label htmlFor="app-notes">Notes</label> <span className="muted">optional</span>
          </h3>
          <textarea id="app-notes" rows={4} className={lit('notes')} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </section>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {onDelete && (
            <button type="button" className="danger" disabled={busy} onClick={() => run(onDelete)}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
    {/* Outside the form on purpose: it has its own buttons and inputs, and must not submit this one */}
    {emailOpen && <EmailDialog app={form} onUsed={onEmailUsed} onClose={() => setEmailOpen(false)} />}
    {cvCheckOpen && (
      <CvCheckDialog
        role={form.name}
        company={form.company}
        jobUrl={url}
        docs={docs}
        attachedIds={docIds}
        onClose={() => setCvCheckOpen(false)}
      />
    )}
    </>
  )
}
