import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ENDED_NOTE_MAX, ENDED_REASON_LABEL, ENDED_STAGE_LABEL, REASONS_FOR, cleanEnding, endedBy, withSide, type Ending,
} from '../lib/endings'
import { errorMessage } from '../lib/errors'
import { ENDED_STAGES, type EndedBy } from '../lib/types'
import { XIcon } from './Icons'

interface FieldsProps {
  value: Ending
  onChange: (next: Ending) => void
  /** The step was filled in from the timeline (or the earlier status): say so, so it is checked rather than trusted */
  guessed?: boolean
}

/**
 * Who ended it, where it stopped, why, and a note. Every part is optional and every chip can be pressed again to
 * clear it. Plain buttons (type="button"), not a <form>: it sits inside the application form and in a dialog.
 */
export function EndingFields({ value, onChange, guessed = false }: FieldsProps) {
  const id = useId()
  const side = endedBy(value)
  const set = (patch: Partial<Ending>) => onChange({ ...value, ...patch })

  return (
    <div className="ending-fields">
      <div className="tpl-switch ending-side" role="group" aria-label="Who ended it">
        {(['Employer', 'Me'] as EndedBy[]).map((by) => (
          <button key={by} type="button" aria-pressed={side === by} className={side === by ? 'active' : ''} onClick={() => onChange(withSide(value, by))}>
            {by === 'Employer' ? 'They turned me down' : 'I withdrew'}
          </button>
        ))}
      </div>

      <div className="field">
        <span className="label-row">
          <span id={`${id}-stage`}>{side === 'Me' ? 'Where were you in the process?' : 'Where did it stop?'}</span>
          {guessed && value.ended_stage && <span className="muted small">Filled in for you, tap another if it's wrong</span>}
        </span>
        <div className="chip-set" role="group" aria-labelledby={`${id}-stage`}>
          {ENDED_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              aria-pressed={value.ended_stage === s}
              onClick={() => set({ ended_stage: value.ended_stage === s ? null : s })}
            >
              {ENDED_STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span id={`${id}-reason`}>{side === 'Me' ? 'Why did you withdraw?' : 'Main reason'}</span>
        <div className="chip-set" role="group" aria-labelledby={`${id}-reason`}>
          {REASONS_FOR[side].map((r) => (
            <button
              key={r}
              type="button"
              className="chip"
              aria-pressed={value.ended_reason === r}
              onClick={() => set({ ended_reason: value.ended_reason === r ? null : r })}
            >
              {ENDED_REASON_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${id}-note`}>Note</label>
        <textarea
          id={`${id}-note`}
          rows={3}
          maxLength={ENDED_NOTE_MAX}
          placeholder={side === 'Me' ? 'What made you decide' : 'What they told you, or what you would do differently next time'}
          value={value.ended_note ?? ''}
          onChange={(e) => set({ ended_note: e.target.value })}
        />
      </div>
    </div>
  )
}

interface DialogProps {
  /** The application that was just moved to Rejected */
  app: { name: string; company: string | null }
  /** Starting values (usually just a guessed step) */
  initial: Ending
  guessed: boolean
  onSave: (ending: Ending) => Promise<void>
  onClose: () => void
}

/**
 * Asked once, right after a card is moved to Rejected on the board. Optional: Skip (or Escape, or a click outside)
 * closes it without saving anything; the same fields are in the application form for later.
 */
export default function EndingDialog({ app, initial, guessed, onSave, onClose }: DialogProps) {
  const [ending, setEnding] = useState<Ending>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (busy) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await onSave(cleanEnding(ending))
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="card modal ending-modal" role="dialog" aria-modal="true" aria-labelledby="ending-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="ending-title">What happened?</h2>
            <p className="muted small email-about">
              {app.name}
              {app.company && <> · {app.company}</>}
            </p>
          </div>
          <button type="button" className="ghost icon-only" onClick={onClose} disabled={busy} aria-label="Close">
            <XIcon size={18} />
          </button>
        </header>
        <p className="muted small">
          Optional. A few taps now show you where applications tend to stop, under Stats.
        </p>
        <EndingFields value={ending} onChange={setEnding} guessed={guessed} />
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <span className="spacer" />
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Skip</button>
          <button type="button" className="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
