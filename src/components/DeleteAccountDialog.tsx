import { useState, type FormEvent } from 'react'
import { deleteMyAccount } from '../lib/account'
import { errorMessage } from '../lib/errors'
import { XIcon } from './Icons'

const CONFIRM_WORD = 'DELETE'

export default function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await deleteMyAccount() // signs out; the app then shows the sign-in screen with a confirmation
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <form className="card modal modal-sm" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Delete account?</h2>
          <button type="button" className="ghost icon-only" onClick={onClose} disabled={busy} aria-label="Close">
            <XIcon size={18} />
          </button>
        </header>
        <p className="muted">
          This permanently deletes your account and <strong>all your applications</strong>. It can't be undone.
        </p>
        <label>
          Type {CONFIRM_WORD} to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <span className="spacer" />
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="danger-solid" disabled={busy || typed.trim().toUpperCase() !== CONFIRM_WORD}>
            {busy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </form>
    </div>
  )
}
