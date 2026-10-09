import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { todayKey } from '../lib/dates'
import { errorMessage } from '../lib/errors'
import { fmtDate, fmtTime } from '../lib/format'
import {
  newStage, sortStages, STAGE_NOTES_MAX, STAGE_STATE_LABEL, STAGE_SUGGESTIONS, STAGE_TITLE_MAX, stageProblem, stageState,
  suggestedStatus,
} from '../lib/stages'
import { STAGE_OUTCOMES, type StageDraft, type StageOutcome, type Status } from '../lib/types'
import { CheckIcon, PencilIcon, PlusIcon, TrashIcon } from './Icons'
import TimePicker from './TimePicker'

interface Props {
  /** The timeline as it stands. For an application that exists, these are the stages already stored. */
  stages: StageDraft[]
  onChange: (stages: StageDraft[]) => void
  /**
   * How to store a change straight away. Given for an application that exists: every "Save stage" and every removal
   * is then stored there and then, whatever happens to the rest of the form. Left out for a new application, which
   * has nowhere to store them yet: the stages wait in the form and go in with the application.
   */
  store?: {
    save: (stage: StageDraft) => Promise<void>
    remove: (stageId: string) => Promise<void>
  }
  /** Tells the form a stage is open with changes that haven't been saved, so it can say so before closing over them */
  onPending?: (pending: boolean) => void
  /** The application's status, to point out when the timeline has moved past it */
  status: Status
  onStatus: (status: Status) => void
  /** Offer "Set as next step" on a stage that is still ahead (not when a next step is already planned) */
  canPlan: boolean
  onPlan: (stage: StageDraft) => void
}

const OUTCOME_LABEL: Record<StageOutcome, string> = { Waiting: 'No result yet', Passed: 'Passed', 'Not selected': 'Not selected' }

/**
 * The Timeline section of the application form: each stage after someone replied, oldest first.
 * One stage is edited at a time, in a copy; "Save stage" keeps it and Cancel throws the copy away.
 * Not a <form>, and Enter and Escape are caught: it sits inside the application form and must not save or close it.
 */
export default function Timeline({ stages, onChange, store, onPending, status, onStatus, canPlan, onPlan }: Props) {
  const id = useId()
  const today = todayKey()
  /** The stage being edited: a copy of one in the list, or a new one that isn't in the list yet */
  const [draft, setDraft] = useState<StageDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  /** The stage whose bin was pressed, waiting for a yes */
  const [removing, setRemoving] = useState<string | null>(null)
  /** Shown for a moment after a change has been stored */
  const [stored, setStored] = useState<string | null>(null)
  useEffect(() => {
    if (!stored) return
    const timer = setTimeout(() => setStored(null), 3000)
    return () => clearTimeout(timer)
  }, [stored])

  const shown = sortStages(stages)
  const isNew = Boolean(draft) && !stages.some((s) => s.id === draft!.id)

  function begin(stage: StageDraft | null) {
    setDraft(stage)
    setProblem(null)
    setRemoving(null)
    onPending?.(Boolean(stage))
  }
  const change = (fields: Partial<StageDraft>) => {
    setProblem(null)
    setDraft((d) => (d ? { ...d, ...fields } : d))
  }

  async function saveStage() {
    if (!draft || busy) return
    const wrong = stageProblem(draft)
    if (wrong) {
      setProblem(wrong)
      return
    }
    const stage = { ...draft, title: draft.title.trim(), notes: draft.notes?.trim() ? draft.notes.trim() : null }
    if (store) {
      setBusy(true)
      try {
        await store.save(stage)
      } catch (e) {
        setProblem(`This stage couldn't be saved. ${errorMessage(e)}`)
        setBusy(false)
        return
      }
      setBusy(false)
      setStored('Saved')
    }
    onChange(stages.some((s) => s.id === stage.id) ? stages.map((s) => (s.id === stage.id ? stage : s)) : [...stages, stage])
    begin(null)
  }

  async function removeStage(stageId: string) {
    if (busy) return
    if (store) {
      setBusy(true)
      try {
        await store.remove(stageId)
      } catch (e) {
        setProblem(`This stage couldn't be removed. ${errorMessage(e)}`)
        setBusy(false)
        return
      }
      setBusy(false)
      setStored('Removed')
    }
    setRemoving(null)
    setProblem(null)
    onChange(stages.filter((s) => s.id !== stageId))
  }

  // Enter in a text box would save the whole application, and Escape would close it: here they act on the stage
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault()
      void saveStage()
    } else if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault()
      if (!busy) begin(null)
    }
  }

  const editor = draft && (
    <div className="tl-editor" onKeyDown={onKey}>
      <div className="field">
        <label htmlFor={`${id}-name`}>Stage</label>
        <input
          id={`${id}-name`}
          autoFocus
          maxLength={STAGE_TITLE_MAX}
          placeholder="e.g. Phone screen"
          value={draft.title}
          onChange={(e) => change({ title: e.target.value })}
        />
        <div className="quick-dates">
          {STAGE_SUGGESTIONS.map((title) => (
            <button key={title} type="button" className="chip" onClick={() => change({ title })}>
              {title}
            </button>
          ))}
        </div>
      </div>
      <div className="next-grid tl-grid">
        <label>
          Date
          <input type="date" value={draft.stage_date} onChange={(e) => change({ stage_date: e.target.value })} />
        </label>
        {/* Not a <label> wrapper: the picker holds several buttons (see CLAUDE.md, UI) */}
        <div className="field">
          <span id={`${id}-time`}>Time</span>
          <TimePicker labelledBy={`${id}-time`} value={draft.stage_time} onChange={(t) => change({ stage_time: t })} />
        </div>
        <label>
          How it went
          <select value={draft.outcome} onChange={(e) => change({ outcome: e.target.value as StageOutcome })}>
            {STAGE_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <label htmlFor={`${id}-notes`}>Notes</label>
        <textarea
          id={`${id}-notes`}
          rows={2}
          maxLength={STAGE_NOTES_MAX}
          placeholder="Who you spoke to, what was asked, what to prepare for next time"
          value={draft.notes ?? ''}
          onChange={(e) => change({ notes: e.target.value })}
        />
      </div>
      {problem && <p className="error">{problem}</p>}
      <div className="tl-editor-actions">
        <button type="button" className="primary small-btn" onClick={() => void saveStage()} disabled={busy}>
          {busy ? 'Saving…' : 'Save stage'}
        </button>
        <button type="button" className="ghost small-btn" onClick={() => begin(null)} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  )

  const suggestion = suggestedStatus(status, stages, today)

  return (
    <section className="form-section timeline" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        Timeline <span className="muted">optional</span>
      </h3>
      {stages.length === 0 && !draft && (
        <p className="muted small">Keep a record of each stage as it happens: a phone screen, an interview, an assessment.</p>
      )}

      {(shown.length > 0 || isNew) && (
        <ol className="tl-list">
          {shown.map((stage) => {
            const state = stageState(stage, today)
            if (draft?.id === stage.id) {
              return (
                <li key={stage.id} className="tl-item tl-open">
                  <span className="tl-dot" aria-hidden="true" />
                  {editor}
                </li>
              )
            }
            return (
              <li key={stage.id} className={`tl-item tl-${state}`}>
                <span className="tl-dot" aria-hidden="true" />
                <div className="tl-body">
                  <div className="tl-head">
                    <strong>{stage.title}</strong>
                    <span className={`tl-state tl-${state}`}>{STAGE_STATE_LABEL[state]}</span>
                  </div>
                  <span className="muted small">
                    {fmtDate(stage.stage_date)}
                    {stage.stage_time && ` · ${fmtTime(stage.stage_time)}`}
                  </span>
                  {stage.notes?.trim() && <p className="tl-notes">{stage.notes}</p>}
                  {removing === stage.id ? (
                    <div className="tl-confirm">
                      <span>Remove this stage?</span>
                      <button type="button" className="danger small-btn" onClick={() => void removeStage(stage.id)} disabled={busy}>
                        {busy ? 'Removing…' : 'Remove'}
                      </button>
                      <button type="button" className="ghost small-btn" onClick={() => setRemoving(null)} disabled={busy}>
                        Keep it
                      </button>
                    </div>
                  ) : (
                    state === 'upcoming' && canPlan && !draft && (
                      <div>
                        <button type="button" className="chip" onClick={() => onPlan(stage)} title="Plan it as the next step, with a reminder and a calendar button">
                          Set as next step
                        </button>
                      </div>
                    )
                  )}
                  {removing === stage.id && problem && <p className="error">{problem}</p>}
                </div>
                {!draft && removing !== stage.id && (
                  <span className="tl-actions">
                    <button type="button" className="ghost icon-only" onClick={() => begin({ ...stage })} aria-label={`Edit ${stage.title}`} title="Edit">
                      <PencilIcon size={15} />
                    </button>
                    <button type="button" className="ghost icon-only" onClick={() => { setProblem(null); setRemoving(stage.id) }} aria-label={`Remove ${stage.title}`} title="Remove">
                      <TrashIcon size={15} />
                    </button>
                  </span>
                )}
              </li>
            )
          })}
          {isNew && (
            <li className="tl-item tl-open">
              <span className="tl-dot" aria-hidden="true" />
              {editor}
            </li>
          )}
        </ol>
      )}

      {!draft && (
        <div className="tl-add">
          <button type="button" className="chip" onClick={() => begin(newStage(today))}>
            <PlusIcon size={13} /> Add a stage
          </button>
          {/* What has happened to the stages, so nobody has to wonder whether they are kept */}
          <span className={`tl-stored${stored ? ' on' : ''}`} role="status" aria-live="polite">
            {stored ? (
              <>
                <CheckIcon size={13} /> {stored}
              </>
            ) : store ? (
              stages.length > 0 && 'Each stage is saved as you add it.'
            ) : (
              stages.length > 0 && 'These are saved when you save the application.'
            )}
          </span>
        </div>
      )}

      {suggestion && !draft && (
        <p className="tl-suggest">
          The status is still <strong>{status}</strong>.{' '}
          <button type="button" className="link" onClick={() => onStatus(suggestion)}>
            Change it to {suggestion}
          </button>
        </p>
      )}
    </section>
  )
}
