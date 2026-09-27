import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { displayName } from '../lib/profile'
import { supabase } from '../lib/supabase'
import { LogOutIcon, ShieldIcon, UserIcon } from './Icons'

export default function AccountMenu() {
  const { session } = useAuth()
  const user = session?.user
  const email = user?.email ?? ''
  const name = displayName(user)
  const [open, setOpen] = useState(false)
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
        <span className="avatar">{name.charAt(0).toUpperCase()}</span>
        <span className="nav-email">{name}</span>
      </button>
      {open && (
        <div className="menu card" role="menu">
          <div className="menu-head">
            <span className="menu-email">{name}</span>
            <span className="muted small menu-sub">{email}</span>
          </div>
          <Link to="/profile" role="menuitem" className="menu-item" onClick={() => setOpen(false)}>
            <UserIcon /> Profile & settings
          </Link>
          <Link to="/privacy" role="menuitem" className="menu-item" onClick={() => setOpen(false)}>
            <ShieldIcon /> Privacy
          </Link>
          <div className="menu-sep" />
          <button role="menuitem" className="menu-item" onClick={() => supabase.auth.signOut()}>
            <LogOutIcon /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
