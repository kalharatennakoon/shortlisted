import { useRef, useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/errors'
import { ACCEPT, defaultName, fmtSize, guessKind, uploadDocument, validateFile } from '../lib/documents'
import { DOCUMENT_KINDS, type DocumentKind, type JobDocument } from '../lib/types'
import { UploadIcon } from './Icons'

/**
 * "Upload" button + inline panel to confirm name and kind before the file goes up.
 * Rendered inside the application form too, so it can't be a <form> (no nested forms): Enter is handled by hand.
 */
export default function DocumentUpload({
  onUploaded,
  label = 'Upload new',
  className = 'secondary',
  disabled,
}: {
  onUploaded: (doc: JobDocument) => void
  label?: string
  className?: string
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<DocumentKind>('Other')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pick(f: File | undefined) {
    if (!f) return
    const problem = validateFile(f)
    setError(problem)
    if (problem) return
    setFile(f)
    setName(defaultName(f.name))
    setKind(guessKind(f.name))
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!file || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const doc = await uploadDocument(file, kind, name.trim())
      setFile(null)
      onUploaded(doc)
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <>
      {!file && (
        <button type="button" className={className} disabled={disabled} onClick={() => input.current?.click()}>
          <UploadIcon />
          {label}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {file && (
        <div className="upload-panel">
          <p className="small muted upload-file">
            {file.name} · {fmtSize(file.size)}
          </p>
          <div className="upload-fields">
            <label className="upload-name">
              Name
              <input
                value={name}
                maxLength={200}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submit()
                  }
                }}
              />
            </label>
            <label>
              Type
              <select value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                {DOCUMENT_KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
          </div>
          <div className="upload-actions">
            <button type="button" className="ghost" disabled={busy} onClick={() => { setFile(null); setError(null) }}>
              Cancel
            </button>
            <button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => submit()}>
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="error upload-error" role="alert">{error}</p>}
    </>
  )
}
