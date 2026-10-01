import { useEffect, useMemo, useState } from 'react'
import { errorMessage } from '../lib/errors'
import ApplicationForm from '../components/ApplicationForm'
import CalendarView from '../components/CalendarView'
import StatsView from '../components/StatsView'
import AppShell from '../components/AppShell'
import UpNext from '../components/UpNext'
import ImportExportDialog from '../components/ImportExportDialog'
import { DocCounts } from '../lib/docCounts'
import { listDocuments, listLinks, setApplicationDocuments } from '../lib/documents'
import Board from '../components/Board'
import AppTable from '../components/AppTable'
import { todayKey } from '../lib/dates'
import {
  BoardIcon,
  CalendarIcon,
  ChartIcon,
  PlusIcon,
  SearchIcon,
  TableIcon,
  UploadIcon,
} from '../components/Icons'
import {
  createApplication,
  deleteApplication,
  listApplications,
  updateApplication,
} from '../lib/applications'
import type { Application, DocumentLink, JobDocument, Status } from '../lib/types'

type View = 'board' | 'table' | 'calendar' | 'stats'
type Editing = { mode: 'new'; date?: string; status?: Status } | { mode: 'edit'; app: Application } | null

const VIEWS: { id: View; label: string; icon: typeof BoardIcon }[] = [
  { id: 'board', label: 'Board', icon: BoardIcon },
  { id: 'table', label: 'Table', icon: TableIcon },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'stats', label: 'Stats', icon: ChartIcon },
]

export default function Tracker() {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('board')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const [ioOpen, setIoOpen] = useState(false)
  const [docs, setDocs] = useState<JobDocument[]>([])
  const [links, setLinks] = useState<DocumentLink[]>([])

  useEffect(() => {
    listApplications()
      .then(setApps)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
    // Documents are secondary: if they fail to load (e.g. migration not run yet), the tracker still works
    Promise.all([listDocuments(), listLinks()])
      .then(([d, l]) => {
        setDocs(d)
        setLinks(l)
      })
      .catch(() => {})
  }, [])

  const docCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of links) m.set(l.application_id, (m.get(l.application_id) ?? 0) + 1)
    return m
  }, [links])
  const docIdsFor = (appId: string) => links.filter((l) => l.application_id === appId).map((l) => l.document_id)

  async function saveDocuments(appId: string, next: string[]) {
    const current = docIdsFor(appId)
    await setApplicationDocuments(appId, current, next)
    setLinks((ls) => [
      ...ls.filter((l) => l.application_id !== appId),
      ...next.map((document_id) => ({ application_id: appId, document_id })),
    ])
  }

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

  const active = apps.filter((a) => ['Applied', 'Interviewed', 'Offered'].includes(a.status)).length

  return (
    <AppShell>
      <DocCounts.Provider value={docCounts}>
        <header className="page-head">
          <div>
            <h1>Applications</h1>
            {!loading && (
              <p className="muted">
                {apps.length} total · {active} active
              </p>
            )}
          </div>
          <div className="head-actions">
            <button className="secondary" onClick={() => setIoOpen(true)} aria-label="Import or export CSV" title="Import or export CSV">
              <UploadIcon />
              <span className="hide-sm">Import / export</span>
            </button>
            <button className="primary" onClick={() => setEditing({ mode: 'new' })}>
              <PlusIcon />
              <span>New<span className="hide-sm"> application</span></span>
            </button>
          </div>
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
        {!loading && apps.length === 0 && (
          <div className="card empty-hint">
            <p>
              <strong>Already tracking applications somewhere else?</strong>{' '}
              <span className="muted">Bring them in from Notion, Excel or Google Sheets as a CSV.</span>
            </p>
            <button className="secondary" onClick={() => setIoOpen(true)}>
              <UploadIcon />
              Import CSV
            </button>
          </div>
        )}
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
          <Board
            apps={filtered}
            onOpen={(app) => setEditing({ mode: 'edit', app })}
            onMove={moveTo}
            onNew={(status) => setEditing({ mode: 'new', status })}
          />
        ) : (
          <AppTable apps={filtered} total={apps.length} onOpen={(app) => setEditing({ mode: 'edit', app })} />
        )}


      {editing && (
        <ApplicationForm
          initial={editing.mode === 'edit' ? editing.app : undefined}
          initialDate={editing.mode === 'new' ? editing.date : undefined}
          initialStatus={editing.mode === 'new' ? editing.status : undefined}
          onClose={() => setEditing(null)}
          docs={docs}
          initialDocIds={editing.mode === 'edit' ? docIdsFor(editing.app.id) : []}
          onDocUploaded={(doc) => setDocs((ds) => [doc, ...ds])}
          onSave={async (input, documentIds) => {
            if (editing.mode === 'edit') {
              const updated = await updateApplication(editing.app.id, input)
              setApps((xs) => xs.map((x) => (x.id === updated.id ? updated : x)))
              await saveDocuments(updated.id, documentIds)
            } else {
              const created = await createApplication(input)
              setApps((xs) => [created, ...xs])
              if (documentIds.length) {
                // If attaching fails, the application exists: switch to editing it so a retry doesn't duplicate it
                try {
                  await saveDocuments(created.id, documentIds)
                } catch (e) {
                  setEditing({ mode: 'edit', app: created })
                  throw e
                }
              }
            }
          }}
          onDelete={
            editing.mode === 'edit'
              ? async () => {
                  await deleteApplication(editing.app.id)
                  setApps((xs) => xs.filter((x) => x.id !== editing.app.id))
                  setLinks((ls) => ls.filter((l) => l.application_id !== editing.app.id)) // links cascade in the DB
                }
              : undefined
          }
        />
      )}
      {ioOpen && (
        <ImportExportDialog
          apps={apps}
          onClose={() => setIoOpen(false)}
          // Reload rather than merge: keeps the server's applied_on ordering, and after a partial
          // failure it shows exactly what was saved
          onImported={() => listApplications().then(setApps).catch((e) => setError(errorMessage(e)))}
        />
      )}
      </DocCounts.Provider>
    </AppShell>
  )
}
