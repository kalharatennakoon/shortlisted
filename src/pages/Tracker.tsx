import { useEffect, useMemo, useState } from 'react'
import { errorMessage } from '../lib/errors'
import ApplicationForm from '../components/ApplicationForm'
import CalendarView from '../components/CalendarView'
import StatsView from '../components/StatsView'
import AppShell from '../components/AppShell'
import UpNext from '../components/UpNext'
import ImportExportDialog from '../components/ImportExportDialog'
import EmailDialog, { type EmailUse } from '../components/EmailDialog'
import CalendarDialog from '../components/AddToCalendar'
import { DocCounts } from '../lib/docCounts'
import { StageLists } from '../lib/stageLists'
import { listStages, removeStage, saveStages, stageFromStep, stagesByApplication } from '../lib/stages'
import { listDocuments, listLinks, setApplicationDocuments } from '../lib/documents'
import Board from '../components/Board'
import AppTable from '../components/AppTable'
import SearchBox from '../components/SearchBox'
import { searchApplications } from '../lib/search'
import { todayKey } from '../lib/dates'
import {
  BoardIcon,
  CalendarIcon,
  ChartIcon,
  PlusIcon,
  TableIcon,
  UploadIcon,
} from '../components/Icons'
import {
  createApplication,
  deleteApplication,
  listApplications,
  updateApplication,
} from '../lib/applications'
import type { Application, DocumentLink, JobDocument, Stage, StageDraft, Status } from '../lib/types'

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
  // Bumped to start the form afresh when it is pointed at a different application while open
  const [formKey, setFormKey] = useState(0)
  const [ioOpen, setIoOpen] = useState(false)
  const [emailFor, setEmailFor] = useState<Application | null>(null)
  const [calendarFor, setCalendarFor] = useState<Application | null>(null)
  const [docs, setDocs] = useState<JobDocument[]>([])
  const [links, setLinks] = useState<DocumentLink[]>([])
  // Every application's timeline. null = not available (its migration hasn't been run yet): the app works without it
  const [stages, setStages] = useState<Stage[] | null>(null)

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
    // The timeline is secondary too
    listStages()
      .then(setStages)
      .catch(() => {})
  }, [])

  const docCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of links) m.set(l.application_id, (m.get(l.application_id) ?? 0) + 1)
    return m
  }, [links])
  const docIdsFor = (appId: string) => links.filter((l) => l.application_id === appId).map((l) => l.document_id)

  const stageLists = useMemo(() => stagesByApplication(stages ?? []), [stages])
  const stagesFor = (appId: string) => stageLists.get(appId) ?? []

  /** Stores these stages (new or changed) and takes them into the list. Never removes any. */
  async function storeStages(appId: string, drafts: StageDraft[] | null) {
    if (!drafts?.length) return
    const written = await saveStages(appId, drafts)
    setStages((all) => [...(all ?? []).filter((s) => !written.some((w) => w.id === s.id)), ...written])
  }

  /** Removes the one stage the person asked to remove. */
  async function dropStage(appId: string, stageId: string) {
    await removeStage(appId, stageId)
    setStages((all) => all && all.filter((s) => s.id !== stageId))
  }

  /**
   * "Done" in Up next. An interview, assessment or call that has happened is part of the application's story, so it
   * moves into the timeline first (once: a stage already on that day is left alone), then the step is cleared.
   */
  async function stepDone(app: Application) {
    const stage = stages ? stageFromStep(app, stagesFor(app.id)) : null
    if (stage) {
      try {
        await storeStages(app.id, [stage])
      } catch {
        // the step is still marked done; the timeline can be filled in by hand
      }
    }
    await patch(app, { next_step: null, next_date: null, ...clearTime(app) })
  }

  async function saveDocuments(appId: string, next: string[]) {
    const current = docIdsFor(appId)
    await setApplicationDocuments(appId, current, next)
    setLinks((ls) => [
      ...ls.filter((l) => l.application_id !== appId),
      ...next.map((document_id) => ({ application_id: appId, document_id })),
    ])
  }

  const filtered = useMemo(() => searchApplications(apps, query), [apps, query])

  async function patch(app: Application, fields: Partial<Application>) {
    try {
      const updated = await updateApplication(app.id, fields)
      setApps((xs) => xs.map((x) => (x.id === app.id ? updated : x)))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  // next_time only exists once its migration has run: clear it only on rows that have one (see types.ts)
  const clearTime = (app: Application) => (app.next_time ? { next_time: null } : {})

  /** An email draft was opened from "Up next": remember the address, and plan the check for a reply if asked */
  async function emailUsed(app: Application, { contactEmail, remindOn }: EmailUse) {
    const fields: Partial<Application> = {
      ...(contactEmail && contactEmail !== app.contact_email ? { contact_email: contactEmail } : {}),
      ...(remindOn ? { next_step: 'Follow up' as const, next_date: remindOn, ...clearTime(app) } : {}),
    }
    if (Object.keys(fields).length) await patch(app, fields)
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
      <StageLists.Provider value={stageLists}>
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
            <SearchBox value={query} onChange={setQuery} matches={filtered.length} total={apps.length} />
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
            onDone={stepDone}
            onPlanFollowUp={(app) => patch(app, { next_step: 'Follow up', next_date: todayKey() })}
            onNoResponse={(app) => patch(app, { status: 'No Response' })}
            onEmail={setEmailFor}
            onCalendar={setCalendarFor}
          />
        )}
        {!loading && view !== 'stats' && view !== 'table' && apps.length > 0 && filtered.length === 0 && (
          <p className="search-empty muted">
            No applications match “{query.trim()}”.{' '}
            <button className="link" onClick={() => setQuery('')}>Clear search</button>
          </p>
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
          key={formKey}
          others={apps}
          onOpenOther={(app) => {
            setEditing({ mode: 'edit', app })
            setFormKey((k) => k + 1)
          }}
          initial={editing.mode === 'edit' ? editing.app : undefined}
          initialDate={editing.mode === 'new' ? editing.date : undefined}
          initialStatus={editing.mode === 'new' ? editing.status : undefined}
          onClose={() => setEditing(null)}
          docs={docs}
          initialDocIds={editing.mode === 'edit' ? docIdsFor(editing.app.id) : []}
          initialStages={stages ? (editing.mode === 'edit' ? stagesFor(editing.app.id) : []) : undefined}
          onStageSave={(appId, stage) => storeStages(appId, [stage])}
          onStageRemove={dropStage}
          onDocUploaded={(doc) => setDocs((ds) => [doc, ...ds])}
          onSave={async (input, documentIds, timeline) => {
            if (editing.mode === 'edit') {
              const updated = await updateApplication(editing.app.id, input)
              setApps((xs) => xs.map((x) => (x.id === updated.id ? updated : x)))
              await saveDocuments(updated.id, documentIds)
              // only when the form began as a new application and switched to editing after a failed first save (below)
              await storeStages(updated.id, timeline)
            } else {
              const created = await createApplication(input)
              setApps((xs) => [created, ...xs])
              // If attaching documents or saving the timeline fails, the application exists: switch to editing it so a
              // retry doesn't duplicate it
              try {
                if (documentIds.length) await saveDocuments(created.id, documentIds)
                await storeStages(created.id, timeline)
              } catch (e) {
                setEditing({ mode: 'edit', app: created })
                throw e
              }
            }
          }}
          onDelete={
            editing.mode === 'edit'
              ? async () => {
                  await deleteApplication(editing.app.id)
                  setApps((xs) => xs.filter((x) => x.id !== editing.app.id))
                  setLinks((ls) => ls.filter((l) => l.application_id !== editing.app.id)) // links cascade in the DB
                  setStages((all) => all && all.filter((s) => s.application_id !== editing.app.id)) // and so do stages
                }
              : undefined
          }
        />
      )}
      {emailFor && (
        <EmailDialog app={emailFor} onUsed={(use) => emailUsed(emailFor, use)} onClose={() => setEmailFor(null)} />
      )}
      {calendarFor && (
        <CalendarDialog
          app={calendarFor}
          onClose={() => setCalendarFor(null)}
          onEdit={() => {
            setEditing({ mode: 'edit', app: calendarFor })
            setCalendarFor(null)
          }}
        />
      )}
      {ioOpen && (
        <ImportExportDialog
          apps={apps}
          stages={stageLists}
          onClose={() => setIoOpen(false)}
          // Reload rather than merge: keeps the server's applied_on ordering, and after a partial
          // failure it shows exactly what was saved
          onImported={() => listApplications().then(setApps).catch((e) => setError(errorMessage(e)))}
        />
      )}
      </StageLists.Provider>
      </DocCounts.Provider>
    </AppShell>
  )
}
