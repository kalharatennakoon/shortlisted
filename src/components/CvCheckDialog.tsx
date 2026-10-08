import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CV_ANALYZER_NAME, CV_LINK_SECONDS, cvChoices, cvProblem, handoffUrl, unreadableCvs } from '../lib/cvCheck'
import { desktop } from '../lib/desktop'
import { fmtSize, signedDocumentUrl } from '../lib/documents'
import { errorMessage } from '../lib/errors'
import type { JobDocument } from '../lib/types'
import { ExternalIcon, SparkleIcon, XIcon } from './Icons'

interface Props {
  /** The role, company and posting as they are in the form right now (saved or not) */
  role: string
  company: string | null
  /** A safe http(s) link from postingUrl(), or null */
  jobUrl: string | null
  docs: JobDocument[]
  /** Documents attached to this application in the form */
  attachedIds: string[]
  onClose: () => void
}

/**
 * "Check my CV": shows what will be handed to CV Analyzer LK (the CV, the role, the job link), then opens it in a
 * new tab with its form filled in. Nothing is analysed there until the person presses Analyse.
 * Not a <form> and always portalled: it opens on top of the application form.
 */
export default function CvCheckDialog({ role, company, jobUrl, docs, attachedIds, onClose }: Props) {
  const choices = cvChoices(docs, attachedIds)
  const skipped = unreadableCvs(docs, attachedIds)
  // '' = don't send a CV; the person uploads one on the other site
  const [docId, setDocId] = useState(choices[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set when the browser refused the new tab: the address, ready to be opened by a plain link instead
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const doc = choices.find((d) => d.id === docId) ?? null
  const host = jobUrl ? new URL(jobUrl).hostname.replace(/^www\./, '') : null

  async function open() {
    setError(null)
    setBlockedUrl(null)
    // Opened inside the click, so pop-up blockers allow it; pointed at the other site once the CV link is ready.
    // The desktop app has no tabs: it opens the finished link in the person's browser instead.
    const tab = desktop ? null : window.open('', '_blank')
    setBusy(true)
    try {
      const cvUrl = doc ? await signedDocumentUrl(doc, CV_LINK_SECONDS) : null
      const url = handoffUrl({ position: role, jobUrl, cvUrl, cvName: doc?.file_name ?? null })
      if (desktop) {
        await desktop.openExternal(url)
        onClose()
        return
      }
      if (!tab) {
        setBlockedUrl(url)
        setBusy(false)
        return
      }
      tab.opener = null // another site: it must not get a handle on this tab
      tab.location.href = url
      onClose()
    } catch (e) {
      tab?.close()
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop modal-top" onClick={onClose}>
      <div className="card modal modal-sm cv-check" role="dialog" aria-modal="true" aria-labelledby="cv-check-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="cv-check-title">Check your CV</h2>
            <p className="muted small email-about">
              {role.trim() || 'This application'}
              {company?.trim() && <> · {company.trim()}</>}
            </p>
          </div>
          <button type="button" className="ghost icon-only" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </header>

        <div className="cal-event">
          <span className="cal-event-icon" aria-hidden="true">
            <SparkleIcon size={18} />
          </span>
          <span>
            <strong>{CV_ANALYZER_NAME}</strong>
            <span className="muted small block">
              A free tool by the same developer. It compares your CV with the job and suggests what to improve.
            </span>
          </span>
        </div>

        {choices.length > 0 ? (
          <label>
            CV to send
            <select value={docId} onChange={(e) => { setDocId(e.target.value); setBlockedUrl(null) }}>
              {choices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({fmtSize(d.size_bytes)}){attachedIds.includes(d.id) ? '' : ' · not attached here'}
                </option>
              ))}
              <option value="">Don't send one, I'll upload it there</option>
            </select>
          </label>
        ) : (
          <p className="muted small">
            <strong>No CV to send.</strong> Attach a CV as a PDF, Word (.docx) or TXT file under 4 MB to have it filled
            in for you, or upload it in {CV_ANALYZER_NAME}.
          </p>
        )}
        {skipped.map((d) => (
          <p key={d.id} className="muted small">
            {CV_ANALYZER_NAME} can't read "{d.name}": {cvProblem(d)}.
          </p>
        ))}

        <dl className="cv-check-facts">
          <div>
            <dt>Role</dt>
            <dd>{role.trim() || <span className="muted">Not filled in yet. You can type it there.</span>}</dd>
          </div>
          <div>
            <dt>Job posting</dt>
            <dd>
              {host ?? <span className="muted">No link saved. Your CV is compared with what's typical for the role.</span>}
            </dd>
          </div>
        </dl>

        {error && <p className="error">{error}</p>}
        <div className="actions cv-check-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          {blockedUrl ? (
            // The tab was blocked: a plain link the browser will follow. Closing waits a tick so the click goes through
            <a className="btn primary" href={blockedUrl} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(onClose, 0)}>
              Open {CV_ANALYZER_NAME} <ExternalIcon size={14} />
            </a>
          ) : (
            <button type="button" className="primary" onClick={open} disabled={busy}>
              {busy ? 'Opening…' : <>Open {CV_ANALYZER_NAME} <ExternalIcon size={14} /></>}
            </button>
          )}
        </div>
        <p className="muted small cv-check-note" role="status">
          {blockedUrl
            ? 'Your browser blocked the new tab. Press the button once more to open it.'
            : doc
              ? `Opens in a new tab. Your CV is shared with it through a private link that stops working after ${CV_LINK_SECONDS / 60} minutes, and nothing is analysed until you press Analyse there.`
              : `Opens in a new tab with ${jobUrl ? 'the role and job link' : 'the role'} filled in. Nothing is analysed until you press Analyse there.`}
        </p>
      </div>
    </div>,
    document.body,
  )
}
