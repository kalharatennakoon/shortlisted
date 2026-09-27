import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { SESSION_LOST_EVENT } from './sessionLost'
import { supabase } from './supabase'

interface AuthState {
  session: Session | null
  loading: boolean
  /** True after the user arrives from a password-reset email; show the "set new password" screen. */
  recovery: boolean
  /** Problem with an email/OAuth link the user just followed (expired, other browser, cancelled…). */
  linkError: string | null
  /** One-off success message for the sign-in screen (e.g. after confirming a sign-up email). */
  notice: string | null
}

interface AuthContextValue extends AuthState {
  finishRecovery: () => void
  /** Clears both the link error and the notice (called when the user starts doing something else). */
  clearLinkError: () => void
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  recovery: false,
  linkError: null,
  notice: null,
  finishRecovery: () => {},
  clearLinkError: () => {},
})

/**
 * Sign-up confirmation emails link back to `appUrl()?confirmed=1` (see Login.tsx). Supabase has already
 * confirmed the address by then; the library would also sign the user straight in, but we want them to
 * land on the sign-in screen instead. This runs once per page load, before the UI reads the session.
 */
export const CONFIRM_PARAM = 'confirmed'
const initialParams = new URLSearchParams(window.location.search)
const CONFIRMING = initialParams.has(CONFIRM_PARAM) && !initialParams.has('error_description')
let confirmFinished = !CONFIRMING
const CONFIRMED_NOTICE = 'Your email is confirmed. Please sign in.'

const signupConfirmation: Promise<boolean> = (async () => {
  if (!CONFIRMING) return false
  try {
    const { data } = await supabase.auth.getSession() // waits for the ?code= exchange
    if (data.session) await supabase.auth.signOut({ scope: 'local' })
  } finally {
    // Clean the URL whether or not the exchange worked: opened in another browser (no PKCE verifier)
    // the exchange fails, but the email IS confirmed, so the message is still true.
    const url = new URL(window.location.href)
    ;[CONFIRM_PARAM, 'code', 'sb_flow_id'].forEach((k) => url.searchParams.delete(k))
    window.history.replaceState(window.history.state, '', url.toString())
    confirmFinished = true
  }
  return true
})()

/** Reads ?error_description=… (Supabase redirect errors) and a leftover ?code=… (exchange failed). */
function readLinkProblem(hadSession: boolean): string | null {
  const params = new URLSearchParams(window.location.search)
  const description = params.get('error_description')
  const leftoverCode = params.has('code') && !hadSession
  if (!description && !leftoverCode) return null

  const url = new URL(window.location.href)
  ;['error', 'error_code', 'error_description', 'code', 'sb_flow_id', CONFIRM_PARAM].forEach((k) =>
    url.searchParams.delete(k),
  )
  window.history.replaceState(window.history.state, '', url.toString())

  if (description) return description.replace(/\+/g, ' ')
  return 'That link could not be used. Open it in the same browser you requested it from, or request a new one.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: true,
    recovery: false,
    linkError: null,
    notice: null,
  })

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // While a sign-up confirmation is being turned into "please sign in", ignore the brief
      // SIGNED_IN / SIGNED_OUT pair so the tracker never flashes on screen.
      if (!confirmFinished) return
      setState((s) => ({
        ...s,
        session,
        loading: false,
        recovery: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : s.recovery,
      }))
    })
    signupConfirmation.then(async (confirmed) => {
      // getSession waits for the library to finish handling any ?code= in the URL
      const { data } = await supabase.auth.getSession()
      // Read (and clean) the URL outside the state updater, which must stay side-effect free.
      // Keep any earlier result: StrictMode runs this effect twice in dev and the URL is already clean.
      const problem = readLinkProblem(Boolean(data.session))
      setState((s) => ({
        ...s,
        session: data.session,
        loading: false,
        linkError: problem ?? s.linkError,
        notice: confirmed ? CONFIRMED_NOTICE : s.notice,
      }))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Keep the UI in step with the stored login. The library can clear it without an event (e.g. a failed
  // background token refresh); without this the page looks signed in but every save fails.
  const signedIn = Boolean(state.session)
  useEffect(() => {
    if (!signedIn) return
    const expire = async () => {
      await supabase.auth.signOut({ scope: 'local' }) // emits SIGNED_OUT -> sign-in screen
      setState((s) => ({ ...s, session: null, notice: 'Your session expired. Please sign in again.' }))
    }
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      const { data } = await supabase.auth.getSession()
      if (!data.session) expire()
    }
    window.addEventListener(SESSION_LOST_EVENT, expire)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      window.removeEventListener(SESSION_LOST_EVENT, expire)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [signedIn])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        finishRecovery: () => setState((s) => ({ ...s, recovery: false })),
        clearLinkError: () => setState((s) => ({ ...s, linkError: null, notice: null })),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
