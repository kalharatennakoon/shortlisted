import { useRef, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { createApplications } from '../lib/applications'
import { errorMessage } from '../lib/errors'
import { fmtDate } from '../lib/format'
import { todayKey } from '../lib/dates'
import { applicationsToCsv, parseImport, templateCsv, type ImportPreview } from '../lib/importExport'
import type { Application } from '../lib/types'
import { StatusPill } from './Badges'
import { DownloadIcon, FileIcon, UploadIcon, XIcon } from './Icons'

interface Props {
  apps: Application[]
  onImported: () => void
  onClose: () => void
}

const MAX_BYTES = 5 * 1024 * 1024
const PREVIEW_ROWS = 6

type Step =
  | { kind: 'choose' }
  | { kind: 'preview'; fileName: string; preview: ImportPreview }
  | { kind: 'done'; count: number }

export default function ImportExportDialog({ apps, onImported, onClose }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [includeDupes, setIncludeDupes] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function readFile(file: File) {
    setError(null)
    if (!/\.(csv|txt)$/i.test(file.name) && !file.type.includes('csv')) {
      setError('Please choose a .csv file. In Excel or Google Sheets use File → Download / Save as → CSV.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('That file is over 5 MB. Split it into smaller files and import them one at a time.')
      return
    }
    try {
      const preview = parseImport(await file.text(), apps)
      setIncludeDupes(false)
      setStep({ kind: 'preview', fileName: file.name, preview })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) readFile(file)
  }

  async function runImport(preview: ImportPreview) {
    const inputs = preview.rows.filter((r) => includeDupes || !r.duplicate).map((r) => r.input)
    setBusy(true)
    setError(null)
    try {
      const created = await createApplications(inputs)
      onImported()
      setStep({ kind: 'done', count: created.length })
    } catch (e) {
      setError(errorMessage(e))
      onImported() // a partial import may have saved some rows; the tracker reloads to show them
    } finally {
      setBusy(false)
    }
  }

  const close = busy ? undefined : onClose

  return createPortal(
    <div className="modal-backdrop" onClick={close}>
      <div className="card modal io-modal" role="dialog" aria-modal="true" aria-labelledby="io-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="io-title">{step.kind === 'preview' ? 'Review import' : 'Import & export'}</h2>
          <button type="button" className="ghost icon-only" onClick={close} disabled={busy} aria-label="Close">
            <XIcon size={18} />
          </button>
        </header>

        {step.kind === 'choose' && (
          <>
            <section className="io-section">
              <h3>Import from a CSV file</h3>
              <p className="muted small">
                Works with a Notion export, Excel or Google Sheets. Needs a <strong>Role</strong> (or Name) column;
                Company, Applied On, Platform, Priority, Status, Next Step, Next Date, Job URL, Posting Checked On, Posting Closed and Notes are picked up
                if present.
              </p>
              <button
                type="button"
                className={`dropzone${dragging ? ' dragging' : ''}`}
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <UploadIcon size={22} />
                <span><strong>Choose a CSV file</strong><span className="hide-sm"> or drop it here</span></span>
                <span className="muted small">Up to 2,000 rows</span>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = '' // allow picking the same file again
                  if (file) readFile(file)
                }}
              />
              <details className="io-help">
                <summary>How to export from Notion</summary>
                <ol>
                  <li>Open your tracker database as a full page.</li>
                  <li>Click <strong>•••</strong> (top right) → <strong>Export</strong> → format <strong>Markdown &amp; CSV</strong>.</li>
                  <li>Unzip the download and choose the <strong>.csv</strong> file here.</li>
                </ol>
              </details>
              <button type="button" className="link small io-template" onClick={() => download('job-tracker-template.csv', templateCsv())}>
                Download a template CSV
              </button>
            </section>

            <section className="io-section">
              <h3>Export your applications</h3>
              <p className="muted small">
                A CSV of all {apps.length} application{apps.length === 1 ? '' : 's'}. Opens in Excel, Google Sheets or
                Numbers, and can be imported back here.
              </p>
              <div>
                <button
                  type="button"
                  className="secondary"
                  disabled={apps.length === 0}
                  onClick={() => download(`job-applications-${todayKey()}.csv`, applicationsToCsv(apps))}
                >
                  <DownloadIcon />
                  Download CSV
                </button>
              </div>
            </section>
            {error && <p className="error" role="alert">{error}</p>}
          </>
        )}

        {step.kind === 'preview' && (
          <PreviewStep
            fileName={step.fileName}
            preview={step.preview}
            includeDupes={includeDupes}
            setIncludeDupes={setIncludeDupes}
            busy={busy}
            error={error}
            onBack={() => {
              setError(null)
              setStep({ kind: 'choose' })
            }}
            onImport={() => runImport(step.preview)}
          />
        )}

        {step.kind === 'done' && (
          <>
            <p className="success io-done">
              Imported {step.count} application{step.count === 1 ? '' : 's'}.
            </p>
            <div className="actions">
              <span className="spacer" />
              <button type="button" className="primary" onClick={onClose} autoFocus>Done</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function PreviewStep({
  fileName, preview, includeDupes, setIncludeDupes, busy, error, onBack, onImport,
}: {
  fileName: string
  preview: ImportPreview
  includeDupes: boolean
  setIncludeDupes: (v: boolean) => void
  busy: boolean
  error: string | null
  onBack: () => void
  onImport: () => void
}) {
  const fresh = preview.rows.filter((r) => !r.duplicate)
  const dupes = preview.rows.length - fresh.length
  const toImport = includeDupes ? preview.rows : fresh
  const warned = preview.rows.filter((r) => r.warnings.length > 0)

  return (
    <>
      <p className="io-file">
        <FileIcon />
        <span>{fileName}</span>
      </p>

      <div className="io-counts">
        <span className="io-count"><strong>{fresh.length}</strong> new</span>
        {dupes > 0 && <span className="io-count"><strong>{dupes}</strong> already in your tracker</span>}
        {preview.errors.length > 0 && <span className="io-count bad"><strong>{preview.errors.length}</strong> can't be imported</span>}
      </div>

      {toImport.length > 0 && (
        <div className="table-card io-table">
          <table className="apps-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Applied</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {toImport.slice(0, PREVIEW_ROWS).map((r) => (
                <tr key={r.line}>
                  <td>
                    <span className="cell-title">{r.input.name}</span>
                    {r.input.company && <span className="cell-sub">{r.input.company}</span>}
                  </td>
                  <td className="nowrap">{fmtDate(r.input.applied_on)}</td>
                  <td><StatusPill status={r.input.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {toImport.length > PREVIEW_ROWS && (
            <p className="muted small io-more">and {toImport.length - PREVIEW_ROWS} more</p>
          )}
        </div>
      )}

      {dupes > 0 && (
        <label className="check">
          <input type="checkbox" checked={includeDupes} onChange={(e) => setIncludeDupes(e.target.checked)} />
          Import the {dupes} duplicate{dupes === 1 ? '' : 's'} anyway (same role, company and applied date)
        </label>
      )}

      {preview.ignored.length > 0 && (
        <p className="muted small">Ignored column{preview.ignored.length === 1 ? '' : 's'}: {preview.ignored.join(', ')}</p>
      )}

      {(warned.length > 0 || preview.errors.length > 0) && (
        <details className="io-help">
          <summary>
            {[
              warned.length > 0 && `${warned.length} row${warned.length === 1 ? '' : 's'} adjusted`,
              preview.errors.length > 0 && `${preview.errors.length} skipped`,
            ].filter(Boolean).join(' · ')}
          </summary>
          <ul>
            {preview.errors.map((e) => (
              <li key={`e${e.line}`}><span className="error">Row {e.line}: {e.message}, skipped</span></li>
            ))}
            {warned.map((r) => (
              <li key={`w${r.line}`}>Row {r.line} ({r.input.name}): {r.warnings.join('; ')}</li>
            ))}
          </ul>
        </details>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="ghost" onClick={onBack} disabled={busy}>Choose another file</button>
        <span className="spacer" />
        <button type="button" className="primary" onClick={onImport} disabled={busy || toImport.length === 0}>
          {busy
            ? 'Importing…'
            : toImport.length === 0
              ? 'Nothing new to import'
              : `Import ${toImport.length} application${toImport.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </>
  )
}

function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
