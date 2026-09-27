import { useEffect, useMemo, useState } from 'react'
import { errorMessage } from '../lib/errors'
import ApplicationForm from '../components/ApplicationForm'
import CalendarView from '../components/CalendarView'
import StatsView from '../components/StatsView'
import AccountMenu from '../components/AccountMenu'
import UpNext from '../components/UpNext'
import Board from '../components/Board'
import Footer from '../components/Footer'
import { NextBadge, StatusPill } from '../components/Badges'
import { fmtDate } from '../lib/format'
import { todayKey } from '../lib/dates'
import {
  BoardIcon,
  CalendarIcon,
  ChartIcon,
  FlagIcon,
  Logo,
  PlusIcon,
  SearchIcon,
  TableIcon,
} from '../components/Icons'
import {
  createApplication,
  deleteApplication,
  listApplications,
  updateApplication,
} from '../lib/applications'
import { useAuth } from '../lib/auth'
import type { Application, Status } from '../lib/types'

type View = 'board' | 'table' | 'calendar' | 'stats'
type Editing = { mode: 'new'; date?: string } | { mode: 'edit'; app: Application } | null

const VIEWS: { id: View; label: string; icon: typeof BoardIcon }[] = [
  { id: 'board', label: 'Board', icon: BoardIcon },
  { id: 'table', label: 'Table', icon: TableIcon },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'stats', label: 'Stats', icon: ChartIcon },
]

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
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return apps
    return apps.filter((a) => `${a.name} ${a.company ?? ''}`.toLowerCase().includes(q))
  }, [apps, query])

  async function patch(app: Application, fields: Partial<Application>) {
    try {
      const updated = await updateApplication(app.id, fields)
      setApps((xs) => xs.map((x) => (x.id === app.id ? updated : x)))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  // Optimistic: move the card immediately, save in the background, undo if the save fails
  async function moveTo(app: Application, status: Status) {
    const previous = app.status
    setApps((xs) => xs.map((x) => (x.id === app.id ? { ...x, status } : x)))
    try {
      const updated = await updateApplication(app.id, { status })
      setApps((xs) => xs.map((x) => (x.id === app.id ? updated : x)))
    } catch (e) {
      setApps((xs) => xs.map((x) => (x.id === app.id ? { ...x, status: previous } : x)))
      setError(`Couldn't move "${app.name}": ${errorMessage(e)}`)
    }
  }

  const email = session?.user.email ?? ''
  const active = apps.filter((a) => ['Applied', 'Interviewed', 'Offered'].includes(a.status)).length

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="brand">
            <Logo size={30} />
            <span>Job Tracker</span>
          </div>
          <span className="spacer" />
          <AccountMenu email={email} />
        </div>
      </nav>

      <main className="page">
        <header className="page-head">
          <div>
            <h1>Applications</h1>
            {!loading && (
              <p className="muted">
                {apps.length} total · {active} active
              </p>
            )}
          </div>
          <button className="primary" onClick={() => setEditing({ mode: 'new' })}>
            <PlusIcon />
            <span>New<span className="hide-sm"> application</span></span>
          </button>
        </header>

        <div className="toolbar">
          <div className="segmented" role="tablist">
            {VIEWS.map(({ id, label, icon: I }) => (
              <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
                <I />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {view !== 'stats' && (
            <label className="search">
              <SearchIcon />
              <input placeholder="Search role or company" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        {!loading && view !== 'stats' && (
          <UpNext
            apps={apps}
            onOpen={(app) => setEditing({ mode: 'edit', app })}
            onDone={(app) => patch(app, { next_step: null, next_date: null })}
            onPlanFollowUp={(app) => patch(app, { next_step: 'Follow up', next_date: todayKey() })}
            onNoResponse={(app) => patch(app, { status: 'No Response' })}
          />
        )}
        {loading ? (
          <p className="muted">Loading…</p>
        ) : view === 'stats' ? (
          <StatsView apps={apps} />
        ) : view === 'calendar' ? (
          <CalendarView
            apps={filtered}
            onOpen={(app) => setEditing({ mode: 'edit', app })}
            onNew={(date) => setEditing({ mode: 'new', date })}
          />
        ) : view === 'board' ? (
          <Board apps={filtered} onOpen={(app) => setEditing({ mode: 'edit', app })} onMove={moveTo} />
        ) : (
          <div className="table-card">
            <table className="apps-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th className="hide-md">Company</th>
                  <th>Applied</th>
                  <th className="hide-md">Platform</th>
                  <th className="hide-md">Priority</th>
                  <th className="hide-md">Next step</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} onClick={() => setEditing({ mode: 'edit', app: a })}>
                    <td>
                      <span className="cell-title">{a.name}</span>
                      {a.company && <span className="cell-sub show-md">{a.company}</span>}
                    </td>
                    <td className="hide-md">{a.company ?? '—'}</td>
                    <td className="nowrap">{fmtDate(a.applied_on)}</td>
                    <td className="hide-md">{a.platform ?? '—'}</td>
                    <td className="hide-md">
                      {a.priority ? (
                        <span className={`priority priority-${a.priority.toLowerCase()}`}>
                          <FlagIcon size={12} />
                          {a.priority}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="hide-md"><NextBadge app={a} /></td>
                    <td><StatusPill status={a.status} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="muted">No applications yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <Footer />

      {editing && (
        <ApplicationForm
          initial={editing.mode === 'edit' ? editing.app : undefined}
          initialDate={editing.mode === 'new' ? editing.date : undefined}
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
