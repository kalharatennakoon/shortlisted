import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../components/AppShell'
import DeleteAccountDialog from '../components/DeleteAccountDialog'
import { ArrowLeftIcon, KeyIcon, TrashIcon, UserIcon } from '../components/Icons'
import PasswordInput from '../components/PasswordInput'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import {
  changePassword,
  displayName,
  hasPassword,
  readProfile,
  signInMethods,
  updateProfile,
  type Profile as ProfileData,
} from '../lib/profile'

type Status = { kind: 'ok' | 'error'; text: string } | null

function DetailsCard() {
  const { session } = useAuth()
  const saved = readProfile(session?.user)
  const [form, setForm] = useState<ProfileData>(saved)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const dirty = (Object.keys(form) as (keyof ProfileData)[]).some((k) => form[k].trim() !== saved[k])

  // Pick up changes made elsewhere (e.g. first load of Google name) while nothing is being edited
  const savedKey = JSON.stringify(saved)
  useEffect(() => {
    if (!dirty) setForm(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])

  const set = (k: keyof ProfileData) => (e: ChangeEvent<HTMLInputElement>) => {
    setStatus(null)
    setForm((f) => ({ ...f, [k]: e.target.value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      await updateProfile(form)
      setStatus({ kind: 'ok', text: 'Profile saved.' })
    } catch (err) {
      setStatus({ kind: 'error', text: errorMessage(err) })
    }
    setBusy(false)
  }

  return (
    <form className="card settings-card" onSubmit={onSubmit}>
      <header className="settings-head">
        <span className="settings-icon"><UserIcon size={18} /></span>
        <div>
          <h2>Basic details</h2>
          <p className="muted small">Shown only to you, in the app.</p>
        </div>
      </header>
      <div className="grid-2">
        <label>
          Full name
          <input value={form.display_name} onChange={set('display_name')} autoComplete="name" maxLength={80} />
        </label>
        <label>
          Target role
          <input value={form.target_role} onChange={set('target_role')} placeholder="e.g. DevOps Engineer" maxLength={80} />
        </label>
        <label>
          Location
          <input value={form.location} onChange={set('location')} placeholder="e.g. Colombo, Sri Lanka" autoComplete="address-level2" maxLength={80} />
        </label>
        <label>
          LinkedIn profile
          <input type="url" value={form.linkedin_url} onChange={set('linkedin_url')} placeholder="https://www.linkedin.com/in/…" maxLength={200} />
        </label>
      </div>
      <div className="settings-actions">
        {status && <p className={status.kind === 'ok' ? 'success' : 'error'} role="status">{status.text}</p>}
        <span className="spacer" />
        <button type="button" className="secondary" disabled={!dirty || busy} onClick={() => setForm(saved)}>
          Reset
        </button>
        <button type="submit" className="primary" disabled={!dirty || busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

function PasswordCard() {
  const { session } = useAuth()
  const user = session?.user
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [formKey, setFormKey] = useState(0) // remount inputs (hide revealed passwords) after success

  const head = (
    <header className="settings-head">
      <span className="settings-icon"><KeyIcon size={18} /></span>
      <div>
        <h2>Password</h2>
        <p className="muted small">Change the password you use to sign in.</p>
      </div>
    </header>
  )

  if (!hasPassword(user)) {
    return (
      <section className="card settings-card">
        {head}
        <p className="muted">
          You sign in with <strong>{signInMethods(user)}</strong>, so there's no password to change here. Your Google
          account's security settings control access.
        </p>
      </section>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus(null)
    if (next !== confirm) return setStatus({ kind: 'error', text: "The new passwords don't match." })
    if (next === current) return setStatus({ kind: 'error', text: 'Choose a password different from your current one.' })
    setBusy(true)
    try {
      await changePassword(user!.email!, current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setFormKey((k) => k + 1)
      setStatus({ kind: 'ok', text: 'Password changed. Use it next time you sign in.' })
    } catch (err) {
      setStatus({ kind: 'error', text: errorMessage(err) })
    }
    setBusy(false)
  }

  return (
    <form className="card settings-card" onSubmit={onSubmit} key={formKey}>
      {head}
      {/* lets password managers pair the new password with this account */}
      <input type="email" value={user?.email ?? ''} autoComplete="username" readOnly hidden />
      <div className="field">
        <label htmlFor="current-password">Current password</label>
        <PasswordInput id="current-password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <PasswordInput id="new-password" required minLength={6} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="confirm-password">Confirm new password</label>
          <PasswordInput id="confirm-password" required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
      </div>
      <div className="settings-actions">
        {status && <p className={status.kind === 'ok' ? 'success' : 'error'} role="status">{status.text}</p>}
        <span className="spacer" />
        <button type="submit" className="primary" disabled={busy || !current || !next || !confirm}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </form>
  )
}

export default function Profile() {
  const { session } = useAuth()
  const user = session?.user
  const [deleting, setDeleting] = useState(false)
  const name = displayName(user)
  const role = readProfile(user).target_role
  const since = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null

  return (
    <AppShell>
      <div className="settings">
        <Link to="/" className="back-link">
          <ArrowLeftIcon size={15} /> Back to applications
        </Link>

        <section className="profile-hero card">
          <span className="avatar avatar-lg">{name.charAt(0).toUpperCase()}</span>
          <div className="profile-hero-text">
            <h1>{name}</h1>
            {role && <p className="profile-role">{role}</p>}
            <p className="muted small">
              {user?.email} · Signs in with {signInMethods(user)}
              {since && <> · Member since {since}</>}
            </p>
          </div>
        </section>

        <DetailsCard />
        <PasswordCard />

        <section className="card settings-card danger-zone">
          <header className="settings-head">
            <span className="settings-icon danger"><TrashIcon size={18} /></span>
            <div>
              <h2>Delete account</h2>
              <p className="muted small">Permanently delete your account and all your applications. This can't be undone.</p>
            </div>
            <span className="spacer" />
            <button className="danger" onClick={() => setDeleting(true)}>Delete account</button>
          </header>
        </section>
      </div>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </AppShell>
  )
}
