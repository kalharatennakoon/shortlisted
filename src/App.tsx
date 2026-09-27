import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import Login from './pages/Login'
import Tracker from './pages/Tracker'

function Routed() {
  const { session, loading } = useAuth()
  if (loading) return <p className="muted center">Loading…</p>
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={session ? <Tracker /> : <Navigate to="/login" replace />} />
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
