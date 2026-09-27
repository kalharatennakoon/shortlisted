import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthState {
  session: Session | null
  loading: boolean
  /** True after the user arrives from a password-reset email; show the "set new password" screen. */
  recovery: boolean
  /** Problem with an email/OAuth link the user just followed (expired, other browser, cancelled…). */
  linkError: string | null
}

interface AuthContextValue extends AuthState {
  finishRecovery: () => void
  clearLinkError: () => void
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  recovery: false,
  linkError: null,
  finishRecovery: () => {},
  clearLinkError: () => {},
})

/** Reads ?error_description=… (Supabase redirect errors) and a leftover ?code=… (exchange failed). */
function readLinkProblem(hadSession: boolean): string | null {
  const params = new URLSearchParams(window.location.search)
  const description = params.get('error_description')
  const leftoverCode = params.has('code') && !hadSession
  if (!description && !leftoverCode) return null

  const url = new URL(window.location.href)
  ;['error', 'error_code', 'error_description', 'code', 'sb_flow_id'].forEach((k) => url.searchParams.delete(k))
  window.history.replaceState(window.history.state, '', url.toString())

  if (description) return description.replace(/\+/g, ' ')
  return 'That link could not be used. Open it in the same browser you requested it from, or request a new one.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true, recovery: false, linkError: null })

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) =>
      setState((s) => ({
        ...s,
        session,
        loading: false,
        recovery: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : s.recovery,
      })),
    )
    // getSession waits for the library to finish handling any ?code= in the URL
    supabase.auth.getSession().then(({ data }) => {
      // Read (and clean) the URL outside the state updater, which must stay side-effect free.
      // Keep any earlier result: StrictMode runs this effect twice in dev and the URL is already clean.
      const problem = readLinkProblem(Boolean(data.session))
      setState((s) => ({ ...s, session: data.session, loading: false, linkError: problem ?? s.linkError }))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        finishRecovery: () => setState((s) => ({ ...s, recovery: false })),
        clearLinkError: () => setState((s) => ({ ...s, linkError: null })),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
