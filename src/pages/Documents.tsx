import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../components/AppShell'
import DocumentUpload from '../components/DocumentUpload'
import { ArrowLeftIcon, DownloadIcon, ExternalIcon, FileIcon, PencilIcon, TrashIcon } from '../components/Icons'
import { listApplications } from '../lib/applications'
import {
  deleteDocument,
  fmtSize,
  listDocuments,
  listLinks,
  MAX_DOCUMENTS,
  openDocument,
  updateDocument,
} from '../lib/documents'
import { errorMessage } from '../lib/errors'
import { fmtDate } from '../lib/format'
import { toKey } from '../lib/dates'
import { DOCUMENT_KINDS, type Application, type DocumentKind, type DocumentLink, type JobDocument } from '../lib/types'

export default function Documents() {
  const [docs, setDocs] = useState<JobDocument[]>([])
  const [links, setLinks] = useState<DocumentLink[]>([])
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listDocuments(), listLinks(), listApplications()])
      .then(([d, l, a]) => {
        setDocs(d)
        setLinks(l)
        setApps(a)
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  const usedBy = useMemo(() => {
    const byId = new Map(apps.map((a) => [a.id, a]))
    const m = new Map<string, Application[]>()
    for (const l of links) {
      const app = byId.get(l.application_id)
      if (app) m.set(l.document_id, [...(m.get(l.document_id) ?? []), app])
    }
    return m
  }, [apps, links])

  const full = docs.length >= MAX_DOCUMENTS

  return (
    <AppShell>
      <div className="settings">
        <Link to="/" className="back-link">
          <ArrowLeftIcon size={15} /> Back to applications
        </Link>
        <header className="page-head docs-head">
          <div>
            <h1>Documents</h1>
            <p className="muted">
              {loading ? 'Loading…' : `${docs.length} of ${MAX_DOCUMENTS} · private to you`}
            </p>
          </div>
          {!loading && <DocumentUpload className="primary" label="Upload" disabled={full} onUploaded={(d) => setDocs((ds) => [d, ...ds])} />}
        </header>
        {full && <p className="muted small">You've reached {MAX_DOCUMENTS} documents. Delete one you no longer need to upload another.</p>}
        {error && <p className="error">{error}</p>}

        {!loading && docs.length === 0 && !error && (
          <div className="card docs-empty">
            <FileIcon size={28} />
            <h2>Keep your CVs and cover letters here</h2>
            <p className="muted">
              Upload each version once, then attach it to the applications you sent it with. PDF, Word, ODT, TXT or
              images, up to 5 MB each.
            </p>
          </div>
        )}

        {docs.length > 0 && (
          <ul className="card docs-list">
            {docs.map((d) => (
              <DocumentItem
                key={d.id}
                doc={d}
                apps={usedBy.get(d.id) ?? []}
                onChanged={(u) => setDocs((ds) => ds.map((x) => (x.id === u.id ? u : x)))}
                onDeleted={() => {
                  setDocs((ds) => ds.filter((x) => x.id !== d.id))
                  setLinks((ls) => ls.filter((l) => l.document_id !== d.id))
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  )
}

function DocumentItem({
  doc, apps, onChanged, onDeleted,
}: {
  doc: JobDocument
  apps: Application[]
  onChanged: (d: JobDocument) => void
  onDeleted: () => void
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view')
  const [name, setName] = useState(doc.name)
  const [kind, setKind] = useState<DocumentKind>(doc.kind)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    }
    setBusy(false)
  }

  const shown = apps.slice(0, 3)
  return (
    <li className="doc-item">
      <span className="doc-item-icon"><FileIcon size={18} /></span>
      <div className="doc-item-body">
        {mode === 'edit' ? (
          <form
            className="doc-edit"
            onSubmit={(e) => {
              e.preventDefault()
              run(async () => {
                onChanged(await updateDocument(doc.id, { name: name.trim(), kind }))
                setMode('view')
              })
            }}
          >
            <label className="upload-name">
              Name
              <input value={name} maxLength={200} required autoFocus onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Type
              <select value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                {DOCUMENT_KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <div className="upload-actions">
              <button type="button" className="ghost" disabled={busy} onClick={() => { setMode('view'); setName(doc.name); setKind(doc.kind) }}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        ) : (
          <>
            <div className="doc-item-title">
              <strong>{doc.name}</strong>
              <span className="kind-pill">{doc.kind}</span>
            </div>
            <p className="muted small">
              {doc.file_name} · {fmtSize(doc.size_bytes)} · added {fmtDate(toKey(new Date(doc.created_at)))}
            </p>
            <p className="small doc-used">
              {apps.length === 0 ? (
                <span className="muted">Not attached to any application yet</span>
              ) : (
                <>
                  <span className="muted">Sent with </span>
                  {shown.map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && ', '}
                      {a.name}{a.company ? ` at ${a.company}` : ''}
                    </span>
                  ))}
                  {apps.length > shown.length && <span className="muted"> and {apps.length - shown.length} more</span>}
                </>
              )}
            </p>
          </>
        )}

        {mode === 'confirm' && (
          <div className="doc-confirm">
            <span>
              Delete this document?{' '}
              {apps.length > 0 && `It'll be removed from ${apps.length} application${apps.length === 1 ? '' : 's'}. `}
              This can't be undone.
            </span>
            <span className="doc-confirm-actions">
              <button type="button" className="ghost" disabled={busy} onClick={() => setMode('view')}>Cancel</button>
              <button type="button" className="danger-solid" disabled={busy} onClick={() => run(async () => { await deleteDocument(doc); onDeleted() })}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </span>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {mode === 'view' && (
        <div className="doc-item-actions">
          <button type="button" className="ghost icon-only" title="Open" aria-label={`Open ${doc.name}`} onClick={() => run(() => openDocument(doc))}>
            <ExternalIcon />
          </button>
          <button type="button" className="ghost icon-only" title="Download" aria-label={`Download ${doc.name}`} onClick={() => run(() => openDocument(doc, true))}>
            <DownloadIcon />
          </button>
          <button type="button" className="ghost icon-only" title="Rename or change type" aria-label={`Edit ${doc.name}`} onClick={() => setMode('edit')}>
            <PencilIcon />
          </button>
          <button type="button" className="ghost icon-only danger-icon" title="Delete" aria-label={`Delete ${doc.name}`} onClick={() => setMode('confirm')}>
            <TrashIcon />
          </button>
        </div>
      )}
    </li>
  )
}
