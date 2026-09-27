import { useEffect, useMemo, useState } from 'react'
import ApplicationForm from '../components/ApplicationForm'
import CalendarView from '../components/CalendarView'
import StatsView from '../components/StatsView'
import AccountMenu from '../components/AccountMenu'
import UpNext from '../components/UpNext'
import { todayKey } from '../lib/dates'
import { isStale, relativeLabel, urgencyOf } from '../lib/nextSteps'
import {
  BellIcon,
  BoardIcon,
  BuildingIcon,
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
import { STATUSES, type Application, type Status } from '../lib/types'

type View = 'board' | 'table' | 'calendar' | 'stats'
type Editing = { mode: 'new'; date?: string } | { mode: 'edit'; app: Application } | null

// "Sep 25" for this year, "Sep 25, 2025" otherwise
const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const date = new Date(d + 'T00:00:00')
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}
const statusClass = (s: Status) => `status-${s.replace(' ', '-').toLowerCase()}`

const VIEWS: { id: View; label: string; icon: typeof BoardIcon }[] = [
  { id: 'board', label: 'Board', icon: BoardIcon },
  { id: 'table', label: 'Table', icon: TableIcon },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'stats', label: 'Stats', icon: ChartIcon },
]

/** Next-step reminder on a card/row: "Interview · Thu" coloured by urgency, or a follow-up nudge. */
function NextBadge({ app }: { app: Application }) {
  if (app.next_step && app.next_date) {
    return (
      <span className={`next-badge urgency-${urgencyOf(app.next_date)}`} title={`${app.next_step}: ${relativeLabel(app.next_date)}`}>
        <BellIcon size={12} />
        {app.next_step} · {relativeLabel(app.next_date, undefined, true)}
      </span>
    )
  }
  if (isStale(app)) return <span className="next-badge nudge" title="No reply for 2+ weeks">Follow up?</span>
  return null
}

function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`pill ${statusClass(status)}`}>
      <span className="dot" />
      {status}
    </span>
  )
}

export default function Tracker() {
  const { session } = useAuth()
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('board')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const [dragOver, setDragOver] = useState<Status | null>(null)

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

  async function patch(app: Application, fields: Partial<Application>) {
    try {
      const updated = await updateApplication(app.id, fields)
      setApps((xs) => xs.map((x) => (x.id === app.id ? updated : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const moveTo = (app: Application, status: Status) => patch(app, { status })

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
          <div className="board">
            {STATUSES.map((status) => (
              <section
                key={status}
                className={`column${dragOver === status ? ' drop' : ''}${byStatus[status].length === 0 ? ' empty' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (dragOver !== status) setDragOver(status)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null)
                }}
                onDrop={(e) => {
                  setDragOver(null)
                  const app = apps.find((a) => a.id === e.dataTransfer.getData('text/plain'))
                  if (app && app.status !== status) moveTo(app, status)
                }}
              >
                <h3 className="column-head">
                  <span className={`dot ${statusClass(status)}`} />
                  {status}
                  <span className="count">{byStatus[status].length}</span>
                </h3>
                {byStatus[status].map((a) => (
                  <article
                    key={a.id}
                    className="job-card"
                    draggable
                    tabIndex={0}
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', a.id)}
                    onClick={() => setEditing({ mode: 'edit', app: a })}
                    onKeyDown={(e) => e.key === 'Enter' && setEditing({ mode: 'edit', app: a })}
                  >
                    <strong className="job-title">{a.name}</strong>
                    {a.company && (
                      <span className="job-company">
                        <BuildingIcon size={13} />
                        {a.company}
                      </span>
                    )}
                    <NextBadge app={a} />
                    <span className="job-meta">
                      <span>{fmtDate(a.applied_on)}</span>
                      {a.priority && (
                        <span className={`priority priority-${a.priority.toLowerCase()}`}>
                          <FlagIcon size={12} />
                          {a.priority}
                        </span>
                      )}
                    </span>
                  </article>
                ))}
                {byStatus[status].length === 0 && <p className="column-empty">No applications</p>}
              </section>
            ))}
          </div>
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
