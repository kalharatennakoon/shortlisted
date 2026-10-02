import { useState } from 'react'
import { errorMessage } from '../lib/errors'
import { fmtSize, MAX_DOCUMENTS, openDocument } from '../lib/documents'
import type { JobDocument } from '../lib/types'
import DocumentUpload from './DocumentUpload'
import { ExternalIcon, FileIcon, PaperclipIcon, XIcon } from './Icons'

/**
 * Documents section of the application form. Selection is local; the form saves it with the application.
 * Uploads go straight to the library (and are selected here).
 */
export default function AttachedDocuments({
  docs,
  selected,
  onChange,
  onUploaded,
}: {
  docs: JobDocument[]
  selected: string[]
  onChange: (ids: string[]) => void
  onUploaded: (doc: JobDocument) => void
}) {
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attached = selected.map((id) => docs.find((d) => d.id === id)).filter((d): d is JobDocument => Boolean(d))
  const available = docs.filter((d) => !selected.includes(d.id))

  async function open(doc: JobDocument) {
    setError(null)
    try {
      await openDocument(doc)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <section className="form-section" aria-labelledby="sec-documents">
      <h3 id="sec-documents">
        Documents <span className="muted">optional</span>
      </h3>

      {attached.length > 0 ? (
        <ul className="doc-list">
          {attached.map((d) => (
            <li key={d.id} className="doc-row">
              <FileIcon className="doc-row-icon" />
              <span className="doc-row-text">
                <span className="doc-row-name" title={d.name}>{d.name}</span>
                <span className="muted small">{d.kind} · {fmtSize(d.size_bytes)}</span>
              </span>
              <button type="button" className="ghost icon-only" onClick={() => open(d)} aria-label={`Open ${d.name}`} title="Open">
                <ExternalIcon size={15} />
              </button>
              <button
                type="button"
                className="ghost icon-only"
                onClick={() => onChange(selected.filter((id) => id !== d.id))}
                aria-label={`Remove ${d.name} from this application`}
                title="Remove from this application"
              >
                <XIcon size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Attach the CV and cover letter you sent, so you know which version went where.</p>
      )}

      {picking && (
        <div className="doc-picker" role="listbox" aria-label="Your documents">
          {available.map((d) => (
            <button
              key={d.id}
              type="button"
              role="option"
              aria-selected={false}
              className="doc-pick"
              onClick={() => {
                onChange([...selected, d.id])
                if (available.length === 1) setPicking(false)
              }}
            >
              <FileIcon />
              <span className="doc-row-text">
                <span className="doc-row-name" title={d.name}>{d.name}</span>
                <span className="muted small">{d.kind} · {fmtSize(d.size_bytes)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="doc-actions">
        {available.length > 0 && (
          <button type="button" className="chip" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
            <PaperclipIcon size={13} />
            {picking ? 'Done choosing' : 'Attach from your documents'}
          </button>
        )}
        <DocumentUpload
          className="chip"
          label="Upload new"
          disabled={docs.length >= MAX_DOCUMENTS}
          onUploaded={(doc) => {
            onUploaded(doc)
            onChange([...selected, doc.id])
          }}
        />
        <span className="spacer" />
        {/* new tab, so unsaved changes in this form aren't lost */}
        <a href="#/documents" target="_blank" rel="noreferrer" className="small">Manage documents</a>
      </div>
      {docs.length >= MAX_DOCUMENTS && (
        <p className="muted small">You've reached {MAX_DOCUMENTS} documents. Delete one on the Documents page to upload more.</p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
