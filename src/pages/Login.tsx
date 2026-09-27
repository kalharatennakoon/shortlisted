import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { accountJustDeleted, clearAccountDeletedNotice } from '../lib/account'
import { ArrowLeftIcon, Logo } from '../components/Icons'
import PasswordInput from '../components/PasswordInput'
import { CONFIRM_PARAM, useAuth } from '../lib/auth'
import { appUrl, enabledOAuthProviders, supabase, type OAuthProvider } from '../lib/supabase'

type Mode = 'signin' | 'signup' | 'forgot'

const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: 'Google', github: 'GitHub' }

function ProviderIcon({ provider }: { provider: OAuthProvider }) {
  if (provider === 'google')
    return (
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    )
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

export default function Login() {
  const { linkError, notice, clearLinkError } = useAuth()
  const [accountDeleted, setAccountDeleted] = useState(accountJustDeleted)
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [providers, setProviders] = useState<OAuthProvider[]>([])

  useEffect(() => {
    enabledOAuthProviders().then(setProviders)
    clearAccountDeletedNotice() // show the "account deleted" note only once
  }, [])

  const shownError = error ?? linkError

  function switchMode(next: Mode) {
    setMode(next)
    setAccountDeleted(false)
    clearLinkError()
    setError(null)
    setMessage(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    clearLinkError()
    setError(null)
    setMessage(null)
    let err: { message: string } | null = null
    if (mode === 'signin') {
      ;({ error: err } = await supabase.auth.signInWithPassword({ email, password }))
    } else if (mode === 'signup') {
      ;({ error: err } = await supabase.auth.signUp({
        email,
        password,
        // marker so the app sends them to sign in after confirming (see lib/auth.tsx)
        options: { emailRedirectTo: `${appUrl()}?${CONFIRM_PARAM}=1` },
      }))
      if (!err) {
        // Clear the credentials and flip to sign-in so the form can't be resubmitted by accident;
        // name the address in the message so they still know where to look.
        setMessage(`We've sent a confirmation link to ${email}. Open it to activate your account, then sign in here.`)
        setEmail('')
        setPassword('')
        setMode('signin')
      }
    } else {
      ;({ error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() }))
      // Same message whether or not the address has an account, so it can't be used to probe emails.
      if (!err)
        setMessage('If an account exists for that email, a reset link is on its way. Open it in this browser.')
    }
    setBusy(false)
    if (err) setError(err.message)
  }

  async function oauth(provider: OAuthProvider) {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: appUrl() } })
    if (error) setError(error.message)
  }

  const title = { signin: 'Sign in to your applications', signup: 'Create your account', forgot: 'Reset your password' }[mode]
  const submitLabel = { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link' }[mode]

  return (
    <div className="auth-wrap">
      <Link to="/" className="back-link auth-home">
        <ArrowLeftIcon size={15} /> Home
      </Link>
      <form className="card auth-card" onSubmit={onSubmit}>
        <div className="auth-brand">
          <Logo size={40} />
          <h1>Job Tracker</h1>
          <p className="muted">{title}</p>
        </div>

        {mode !== 'forgot' && providers.length > 0 && (
          <>
            {providers.map((p) => (
              <button key={p} type="button" className="secondary oauth" onClick={() => oauth(p)}>
                <ProviderIcon provider={p} />
                Continue with {PROVIDER_LABEL[p]}
              </button>
            ))}
            <div className="divider"><span>or</span></div>
          </>
        )}

        <label>
          Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'forgot' && (
          // Not a wrapping <label>: it would contain the "Forgot password?" button, and clicks on the
          // label (or the eye toggle) would activate that button.
          <div className="field">
            <span className="label-row">
              <label htmlFor="password">Password</label>
              {mode === 'signin' && (
                <button type="button" className="link small" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
              )}
            </span>
            <PasswordInput
              key={mode} // fresh field (hidden again) when switching sign in / sign up
              id="password"
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        {accountDeleted && !message && !shownError && (
          <p className="success">Your account and all your applications have been deleted.</p>
        )}
        {notice && !message && !shownError && <p className="success">{notice}</p>}
        {shownError && <p className="error">{shownError}</p>}
        {message && <p className="success">{message}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Please wait…' : submitLabel}
        </button>
        {mode === 'signin' && (
          <button type="button" className="link" onClick={() => switchMode('signup')}>
            Don't have an account? Sign up
          </button>
        )}
        {mode !== 'signin' && (
          <button type="button" className="link" onClick={() => switchMode('signin')}>
            {mode === 'signup' ? 'Already have an account? Sign in' : 'Back to sign in'}
          </button>
        )}
        <p className="auth-foot">
          {mode === 'signup' ? (
            <>
              Only you can see your applications. Your password is never visible to anyone.{' '}
              <Link to="/privacy">How your data is handled</Link>
            </>
          ) : (
            <Link to="/privacy">Privacy</Link>
          )}
        </p>
      </form>
    </div>
  )
}
