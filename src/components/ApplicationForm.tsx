import { useState, type FormEvent } from 'react'
import { PLATFORMS, PRIORITIES, STATUSES, type Application, type ApplicationInput } from '../lib/types'

interface Props {
  initial?: Application
  onSave: (input: ApplicationInput) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

const empty: ApplicationInput = {
  name: '',
  company: '',
  applied_on: new Date().toISOString().slice(0, 10),
  platform: null,
  priority: null,
  status: 'Applied',
  job_url: '',
  notes: '',
}

export default function ApplicationForm({ initial, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<ApplicationInput>(initial ?? empty)
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
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    // store empty strings as null
    const clean = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]),
    ) as ApplicationInput
    run(() => onSave(clean))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? 'Edit application' : 'New application'}</h2>
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
        <label>
          Job posting URL
          <input type="url" value={form.job_url ?? ''} onChange={(e) => set('job_url', e.target.value)} />
        </label>
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
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
