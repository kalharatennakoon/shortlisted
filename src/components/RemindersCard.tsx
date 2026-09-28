import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { CONTACT_EMAIL } from '../lib/config'
import { errorMessage } from '../lib/errors'
import {
  DEFAULT_REMINDERS,
  deviceTimeZone,
  getReminderSettings,
  hourLabel,
  saveReminderSettings,
  sendTestEmail,
  type ReminderSettings,
} from '../lib/reminders'
import { BellIcon } from './Icons'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
type Status = { kind: 'ok' | 'error'; text: string } | null

export default function RemindersCard() {
  const { session } = useAuth()
  const [saved, setSaved] = useState<ReminderSettings | null>(null)
  const [form, setForm] = useState<ReminderSettings>(DEFAULT_REMINDERS)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [status, setStatus] = useState<Status>(null)

  useEffect(() => {
    getReminderSettings()
      .then((s) => {
        setSaved(s)
        // Keep the zone current if they've moved (or first set it on another device)
        setForm(s ? { ...s, time_zone: deviceTimeZone() } : DEFAULT_REMINDERS)
      })
      .catch(() => setUnavailable(true)) // table not created yet
      .finally(() => setLoading(false))
  }, [])

  const base = saved ?? DEFAULT_REMINDERS
  const dirty =
    form.enabled !== base.enabled ||
    form.send_hour !== base.send_hour ||
    form.include_follow_ups !== base.include_follow_ups ||
    (form.enabled && form.time_zone !== base.time_zone)

  const set = <K extends keyof ReminderSettings>(k: K, v: ReminderSettings[K]) => {
    setStatus(null)
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy('save')
    setStatus(null)
    try {
      await saveReminderSettings(form)
      setSaved(form)
      setStatus({
        kind: 'ok',
        text: form.enabled ? `Saved. Reminders will arrive around ${hourLabel(form.send_hour)} on days something is due.` : 'Saved. Email reminders are off.',
      })
    } catch (err) {
      setStatus({ kind: 'error', text: errorMessage(err) })
    }
    setBusy(null)
  }

  async function onTest() {
    setBusy('test')
    setStatus(null)
    try {
      const to = await sendTestEmail()
      setStatus({ kind: 'ok', text: `Test email sent to ${to}. If it's not in your inbox in a minute, check Spam.` })
    } catch (err) {
      setStatus({ kind: 'error', text: errorMessage(err) })
    }
    setBusy(null)
  }

  return (
    <form className="card settings-card" onSubmit={onSubmit}>
      <header className="settings-head">
        <span className="settings-icon"><BellIcon size={18} /></span>
        <div>
          <h2>Email reminders</h2>
          <p className="muted small">
            A morning email with your overdue, today's and tomorrow's next steps. Only sent when something is due.
          </p>
        </div>
      </header>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : unavailable ? (
        <p className="muted">Email reminders aren't available yet. Please check back soon.</p>
      ) : (
        <>
          <label className="check switch-row">
            <input type="checkbox" role="switch" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            <span>
              <strong>Email me reminders</strong>
              <span className="muted small block">To {session?.user.email}</span>
            </span>
          </label>

          <fieldset className="reminder-options" disabled={!form.enabled}>
            <div className="grid-2">
              <label>
                Send around
                <select value={form.send_hour} onChange={(e) => set('send_hour', Number(e.target.value))}>
                  {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </select>
              </label>
              <div className="field">
                Time zone
                <span className="tz-value">{form.time_zone}</span>
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={form.include_follow_ups} onChange={(e) => set('include_follow_ups', e.target.checked)} />
              <span>
                On Mondays, also list applications with no reply after 14 days
              </span>
            </label>
          </fieldset>

          <p className="muted small">
            Emails come from {CONTACT_EMAIL}. The first one may land in Spam: mark it “Not spam” so the rest arrive
            in your inbox. Every email has a one-click unsubscribe link.
          </p>

          <div className="settings-actions">
            {status && <p className={status.kind === 'ok' ? 'success' : 'error'} role="status">{status.text}</p>}
            <span className="spacer" />
            <button type="button" className="secondary" disabled={busy !== null} onClick={onTest}>
              {busy === 'test' ? 'Sending…' : 'Send a test email'}
            </button>
            <button type="submit" className="primary" disabled={!dirty || busy !== null}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}
