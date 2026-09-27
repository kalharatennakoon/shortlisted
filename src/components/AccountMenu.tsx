import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { deleteMyAccount } from '../lib/account'
import { supabase } from '../lib/supabase'
import { LogOutIcon, ShieldIcon, TrashIcon, XIcon } from './Icons'

const CONFIRM_WORD = 'DELETE'

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
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
      setError(err instanceof Error ? err.message : String(err))
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

export default function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="account" ref={ref}>
      <button className="ghost account-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar">{email.charAt(0).toUpperCase()}</span>
        <span className="nav-email">{email}</span>
      </button>
      {open && (
        <div className="menu card" role="menu">
          <div className="menu-head">
            <span className="muted small">Signed in as</span>
            <span className="menu-email">{email}</span>
          </div>
          <Link to="/privacy" role="menuitem" className="menu-item" onClick={() => setOpen(false)}>
            <ShieldIcon /> Privacy
          </Link>
          <button role="menuitem" className="menu-item" onClick={() => supabase.auth.signOut()}>
            <LogOutIcon /> Sign out
          </button>
          <div className="menu-sep" />
          <button
            role="menuitem"
            className="menu-item menu-danger"
            onClick={() => {
              setOpen(false)
              setConfirming(true)
            }}
          >
            <TrashIcon /> Delete account
          </button>
        </div>
      )}
      {/* Portal: the navbar's backdrop-filter would otherwise trap this fixed-position dialog inside the bar */}
      {confirming && createPortal(<DeleteAccountDialog onClose={() => setConfirming(false)} />, document.body)}
    </div>
  )
}
