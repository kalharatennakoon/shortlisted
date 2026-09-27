import { useEffect, useMemo, useState } from 'react'
import ApplicationForm from '../components/ApplicationForm'
import {
  createApplication,
  deleteApplication,
  listApplications,
  updateApplication,
} from '../lib/applications'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { STATUSES, type Application, type Status } from '../lib/types'

type View = 'board' | 'table'
type Editing = { mode: 'new' } | { mode: 'edit'; app: Application } | null

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function Tracker() {
  const { session } = useAuth()
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('board')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing>(null)

  useEffect(() => {
    listApplications()
      .then(setApps)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return apps
    return apps.filter((a) => `${a.name} ${a.company ?? ''}`.toLowerCase().includes(q))
  }, [apps, query])

  const byStatus = useMemo(() => {
    const groups = Object.fromEntries(STATUSES.map((s) => [s, [] as Application[]])) as Record<Status, Application[]>
    filtered.forEach((a) => groups[a.status].push(a))
    return groups
  }, [filtered])

  async function moveTo(app: Application, status: Status) {
    const updated = await updateApplication(app.id, { status })
    setApps((xs) => xs.map((x) => (x.id === app.id ? updated : x)))
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>🏢 Jobs</h1>
        <span className="spacer" />
        <span className="muted small">{session?.user.email}</span>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <div className="toolbar">
        <div className="tabs">
          <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>Board</button>
          <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>Table</button>
        </div>
        <input className="search" placeholder="Search role or company" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="spacer" />
        <button className="primary" onClick={() => setEditing({ mode: 'new' })}>+ New application</button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : view === 'board' ? (
        <div className="board">
          {STATUSES.map((status) => (
            <section
              key={status}
              className="column"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const app = apps.find((a) => a.id === e.dataTransfer.getData('text/plain'))
                if (app && app.status !== status) moveTo(app, status).catch((err) => setError(err.message))
              }}
            >
              <h3>
                <span className={`pill status-${status.replace(' ', '-').toLowerCase()}`}>{status}</span>
                <span className="muted small">{byStatus[status].length}</span>
              </h3>
              {byStatus[status].map((a) => (
                <article
                  key={a.id}
                  className="card job-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', a.id)}
                  onClick={() => setEditing({ mode: 'edit', app: a })}
                >
                  <strong>{a.name}</strong>
                  {a.company && <span>{a.company}</span>}
                  <span className="muted small">{fmtDate(a.applied_on)}</span>
                </article>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Role</th><th>Company</th><th>Applied on</th><th>Platform</th><th>Priority</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} onClick={() => setEditing({ mode: 'edit', app: a })}>
                  <td>{a.name}</td>
                  <td>{a.company ?? '—'}</td>
                  <td>{fmtDate(a.applied_on)}</td>
                  <td>{a.platform ?? '—'}</td>
                  <td>{a.priority ?? '—'}</td>
                  <td><span className={`pill status-${a.status.replace(' ', '-').toLowerCase()}`}>{a.status}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="muted">No applications yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ApplicationForm
          initial={editing.mode === 'edit' ? editing.app : undefined}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            if (editing.mode === 'edit') {
              const updated = await updateApplication(editing.app.id, input)
              setApps((xs) => xs.map((x) => (x.id === updated.id ? updated : x)))
            } else {
              const created = await createApplication(input)
              setApps((xs) => [created, ...xs])
            }
          }}
          onDelete={
            editing.mode === 'edit'
              ? async () => {
                  await deleteApplication(editing.app.id)
                  setApps((xs) => xs.filter((x) => x.id !== editing.app.id))
                }
              : undefined
          }
        />
      )}
    </div>
  )
}
