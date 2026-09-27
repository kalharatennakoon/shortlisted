import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import Landing from './pages/Landing'
import Login from './pages/Login'
import { accountJustDeleted } from './lib/account'
import Privacy from './pages/Privacy'
import Profile from './pages/Profile'
import ResetPassword from './pages/ResetPassword'
import Tracker from './pages/Tracker'

function Routed() {
  const { session, loading, recovery, notice, linkError } = useAuth()
  // Signed out with something to tell them (session expired, email confirmed, link problem, account deleted):
  // show the sign-in page, where those messages appear, instead of the landing page
  const hasMessage = Boolean(notice || linkError || accountJustDeleted())
  if (loading) return <p className="muted center">Loading…</p>
  if (session && recovery) return <ResetPassword />
  return (
    <Routes>
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/profile" element={session ? <Profile /> : <Navigate to="/login" replace />} />
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={session ? <Tracker /> : hasMessage ? <Navigate to="/login" replace /> : <Landing />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  if (!isConfigured) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card">
          <h1>Setup needed</h1>
          <p>
            Copy <code>.env.example</code> to <code>.env</code> and add your Supabase URL and anon key, then restart
            the dev server.
          </p>
        </div>
      </div>
    )
  }
  // HashRouter: GitHub Pages has no server-side rewrites, so routes live after the #.
  return (
    <AuthProvider>
      <HashRouter>
        <Routed />
      </HashRouter>
    </AuthProvider>
  )
}
