import { useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/errors'
import { ExternalIcon, XIcon } from './Icons'
import AttachedDocuments from './AttachedDocuments'
import { addDays, todayKey } from '../lib/dates'
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

  const set = <K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

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
    run(() => onSave(clean, docIds))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{initial ? 'Edit application' : 'New application'}</h2>
          <button type="button" className="ghost icon-only" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </header>
        <label>
          Role
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. DevOps Engineer" />
        </label>
        <label>
          Company
          <input value={form.company ?? ''} onChange={(e) => set('company', e.target.value)} />
        </label>
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
            <select value={form.platform ?? ''} onChange={(e) => set('platform', (e.target.value || null) as ApplicationInput['platform'])}>
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
        <fieldset className="next-fields">
          <legend>
            Next step <span className="muted">optional</span>
          </legend>
          <div className="grid-2">
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
              When
              <input
                type="date"
                value={form.next_date ?? ''}
                // a step needs a date so it can show up in "Up next"
                required={Boolean(form.next_step)}
                onChange={(e) => set('next_date', e.target.value || null)}
              />
            </label>
          </div>
          <div className="quick-dates">
            {QUICK_DATES.map(([label, days]) => (
              <button key={label} type="button" className="chip" onClick={() => set('next_date', addDays(todayKey(), days))}>
                {label}
              </button>
            ))}
            {(form.next_step || form.next_date) && (
              <button
                type="button"
                className="link small"
                onClick={() => setForm((f) => ({ ...f, next_step: null, next_date: null }))}
              >
                Clear
              </button>
            )}
          </div>
        </fieldset>
        {/* Not a <label> wrapper: it also holds a link and buttons (see CLAUDE.md, UI) */}
        <div className="field">
          <label htmlFor="job-url">Job posting URL</label>
          <div className="posting-row">
            <input
              id="job-url"
              type="url"
              placeholder="https://…"
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
        <AttachedDocuments docs={docs} selected={docIds} onChange={setDocIds} onUploaded={onDocUploaded} />
        <label>
          Notes
          <textarea rows={4} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </label>
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
  )
}
