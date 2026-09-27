import { useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/errors'
import { XIcon } from './Icons'
import AttachedDocuments from './AttachedDocuments'
import { addDays, todayKey } from '../lib/dates'
import { NEXT_STEPS, PLATFORMS, PRIORITIES, STATUSES, type Application, type ApplicationInput, type JobDocument } from '../lib/types'

interface Props {
  initial?: Application
  initialDate?: string
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
  initial, initialDate, onSave, onDelete, onClose, docs, initialDocIds = [], onDocUploaded,
}: Props) {
  const [form, setForm] = useState<ApplicationInput>(
    initial ?? { ...empty, applied_on: initialDate ?? empty.applied_on },
  )
  const [docIds, setDocIds] = useState<string[]>(initialDocIds)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

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
        <label>
          Job posting URL
          <input type="url" value={form.job_url ?? ''} onChange={(e) => set('job_url', e.target.value)} />
        </label>
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
