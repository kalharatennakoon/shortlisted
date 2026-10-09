import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { asLink, JobLinkError, readJobLink, type FillNote, type JobLinkAnswer } from '../lib/jobLink'
import type { Application } from '../lib/types'
import DuplicateNote from './DuplicateNote'
import { CheckIcon, LinkIcon } from './Icons'

interface Props {
  /** Puts the answer into the form and says what happened */
  onAnswer: (answer: JobLinkAnswer) => FillNote
  /** The application that already has this link, if any: asked before the posting is read */
  findExisting?: (link: string) => Application | null
  /** Leave this new application and open that one instead */
  onOpenExisting?: (app: Application) => void
  /** The person chose to add the posting again: don't warn about that application a second time */
  onAddAgain?: (app: Application) => void
  disabled?: boolean
}

type State =
  | { step: 'idle' }
  | { step: 'reading'; host: string }
  | { step: 'done'; note: FillNote }
  | { step: 'error'; text: string }
  | { step: 'duplicate'; link: string; app: Application }

/**
 * "Start from a link" at the top of a new application: paste a posting's link and the form below is filled in from
 * it (lib/jobLink.ts). Pasting starts it straight away; typing a link needs the button or Enter.
 * Not a <form>, and Enter is caught here: it sits inside the application form and must not save it.
 */
export default function QuickAdd({ onAnswer, findExisting, onOpenExisting, onAddAgain, disabled }: Props) {
  const id = useId()
  const [text, setText] = useState('')
  const [state, setState] = useState<State>({ step: 'idle' })
  // Only the latest link counts: a slow answer for an earlier one is dropped. Also stops work after the form closes.
  const run = useRef(0)
  useEffect(() => () => void run.current++, [])
  // The form re-renders while we wait (the person may keep typing): always answer to the newest one
  const answerTo = useRef(onAnswer)
  useEffect(() => {
    answerTo.current = onAnswer
  })

  const reading = state.step === 'reading'

  async function read(raw: string, again = false) {
    const link = asLink(raw)
    if (!link) {
      setState({ step: 'error', text: 'Paste the full link to the job posting, starting with https://' })
      return
    }
    // Already in the list? Say so before reading anything, and let the person choose
    const existing = again ? null : (findExisting?.(link) ?? null)
    if (existing) {
      run.current++ // an answer still on its way for an earlier link no longer counts
      setState({ step: 'duplicate', link, app: existing })
      return
    }
    const mine = ++run.current
    setState({ step: 'reading', host: new URL(link).hostname.replace(/^www\./, '') })
    try {
      const answer = await readJobLink(link)
      if (mine !== run.current) return
      setState({ step: 'done', note: answerTo.current(answer) })
      setText('')
    } catch (e) {
      if (mine !== run.current) return
      setState({
        step: 'error',
        text: e instanceof JobLinkError ? e.message : "Quick add didn't work this time. Add the details yourself, or try again.",
      })
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text')
    // Only take over when a whole link is pasted into an empty box; anything else pastes as usual
    if (reading || text.trim() || !asLink(pasted)) return
    e.preventDefault()
    setText(pasted.trim())
    void read(pasted)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault() // never save the application from here
    if (!reading && text.trim()) void read(text)
  }

  return (
    <section className="form-section quick-add" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        <LinkIcon size={15} /> Start from a link <span className="muted">optional</span>
      </h3>
      <div className="field">
        <label htmlFor={`${id}-link`}>Paste the job posting's link and Shortlisted fills in what it can</label>
        <div className="posting-row">
          <input
            id={`${id}-link`}
            // not type="url": a half-typed link here must never stop the form below from saving
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="https://…"
            value={text}
            disabled={disabled}
            readOnly={reading}
            aria-describedby={`${id}-note`}
            onChange={(e) => {
              setText(e.target.value)
              if (state.step === 'error' || state.step === 'duplicate') setState({ step: 'idle' })
            }}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="secondary" disabled={disabled || reading || !text.trim()} onClick={() => void read(text)}>
            {reading ? 'Reading…' : 'Fill in'}
          </button>
        </div>
      </div>
      {state.step === 'duplicate' && (
        <DuplicateNote
          duplicate={{ app: state.app, why: 'link' }}
          keepLabel="Add it again"
          onOpen={() => onOpenExisting?.(state.app)}
          onKeep={() => {
            onAddAgain?.(state.app)
            void read(state.link, true)
          }}
        />
      )}
      <p id={`${id}-note`} className={`quick-add-note ${state.step === 'done' ? state.note.tone : state.step}`} role="status" aria-live="polite">
        {state.step === 'reading' && (
          <>
            <span className="quick-add-spinner" aria-hidden="true" />
            Reading the posting on {state.host}…
          </>
        )}
        {state.step === 'done' && (
          <>
            {state.note.tone === 'ok' && <CheckIcon size={14} />}
            <span>{state.note.text}</span>
          </>
        )}
        {state.step === 'error' && <span>{state.text}</span>}
      </p>
    </section>
  )
}
