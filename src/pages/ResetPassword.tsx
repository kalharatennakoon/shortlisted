import { useState, type FormEvent } from 'react'
import { Logo } from '../components/Icons'
import PasswordInput from '../components/PasswordInput'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

/** Shown after following a password-reset email link (the user is signed in with a recovery session). */
export default function ResetPassword() {
  const { finishRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('The two passwords don’t match.')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else setDone(true)
  }

  return (
    <div className="auth-wrap">
      {done ? (
        <div className="card auth-card">
          <Logo size={40} />
          <h1>Password updated</h1>
          <p className="muted">You’re signed in with your new password.</p>
          <button className="primary" onClick={finishRecovery}>Go to my applications</button>
        </div>
      ) : (
        <form className="card auth-card" onSubmit={onSubmit}>
          <Logo size={40} />
          <h1>Set a new password</h1>
          <label>
            New password
            <PasswordInput required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            Confirm new password
            <PasswordInput required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
          <button type="button" className="link" onClick={() => supabase.auth.signOut({ scope: 'local' })}>Cancel</button>
        </form>
      )}
    </div>
  )
}
