import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../lib/auth'
import { addDays, todayKey } from '../lib/dates'
import {
  buildEmail,
  defaultTemplate,
  EMAIL_TEMPLATES,
  gmailUrl,
  isEmail,
  mailtoUrl,
  type EmailApp,
  type EmailDraft,
  type TemplateId,
} from '../lib/emailTemplates'
import { readProfile } from '../lib/profile'
import type { Application } from '../lib/types'
import { CheckIcon, CopyIcon, ExternalIcon, MailIcon, XIcon } from './Icons'

/** After a follow-up goes out, check for a reply this many days later */
export const REPLY_CHECK_DAYS = 7

/** What to remember on the application once the draft has been opened or copied */
export interface EmailUse {
  /** The address in "To", if it is one */
  contactEmail: string | null
  /** Date for a "Follow up" step to check for a reply, when the user asked for it */
  remindOn: string | null
}

interface Props {
  app: EmailApp & Pick<Application, 'contact_email'>
  onUsed: (use: EmailUse) => void
  onClose: () => void
}

/**
 * A follow-up, thank-you or check-in email, filled in from the application and editable here.
 * The app never sends it: the buttons open a draft in Gmail or the device's mail app (or copy the text).
 * Not a <form> and always portalled: it can open on top of the application form.
 */
export default function EmailDialog({ app, onUsed, onClose }: Props) {
  const { session } = useAuth()
  const profile = readProfile(session?.user)
  const sender = { name: profile.display_name, linkedinUrl: profile.linkedin_url }
  const today = todayKey()

  const [template, setTemplate] = useState<TemplateId>(() => defaultTemplate(app, today))
  // Edits are kept per template, so trying another one and coming back doesn't lose them
  const [edits, setEdits] = useState<Partial<Record<TemplateId, EmailDraft>>>({})
  const [to, setTo] = useState(app.contact_email ?? '')
  const [copied, setCopied] = useState(false)
  // The mail app link can't tell us whether anything opened (a computer may have no mail app set up)
  const [triedMailApp, setTriedMailApp] = useState(false)

  // Nothing planned, or a follow-up that is due now: offer to check for a reply in a week
  const canRemind = !app.next_step || (app.next_step === 'Follow up' && Boolean(app.next_date) && app.next_date! <= today)
  const [remind, setRemind] = useState(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const info = EMAIL_TEMPLATES.find((t) => t.id === template)!
  const draft = edits[template] ?? buildEmail(template, app, sender, today)
  const edit = (patch: Partial<EmailDraft>) => setEdits((e) => ({ ...e, [template]: { ...draft, ...patch } }))
  const message = { to, ...draft }
  const toInvalid = to.trim() !== '' && !isEmail(to)

  /** Runs after the click has opened the link (the dialog may unmount, which must not cancel the navigation). */
  function used(close: boolean) {
    const use: EmailUse = {
      contactEmail: isEmail(to) ? to.trim() : null,
      remindOn: canRemind && remind ? addDays(todayKey(), REPLY_CHECK_DAYS) : null,
    }
    setTimeout(() => {
      onUsed(use)
      if (close) onClose()
    }, 0)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.body)
    } catch {
      // No clipboard access (older browser, or blocked): copy the selected text the old way.
      // If that fails too, the message is left selected so the user can copy it by hand.
      const box = document.querySelector<HTMLTextAreaElement>('#email-body')
      box?.select()
      if (!box || !document.execCommand('copy')) return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    used(false)
  }

  // Phones have a mail app that handles mailto links; on a computer most people read mail in the browser
  const phone = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const gmail = (
    <a key="gmail" className={`btn ${phone ? 'secondary' : 'primary'}`} href={gmailUrl(message)} target="_blank" rel="noopener noreferrer" onClick={() => used(true)}>
      Open in Gmail <ExternalIcon size={14} />
    </a>
  )
  const mailApp = (
    <a key="mailto" className={`btn ${phone ? 'primary' : 'secondary'}`} href={mailtoUrl(message)}
      // stays open: if no mail app answers the link, the other two options are still here
      onClick={() => {
        setTriedMailApp(true)
        used(false)
      }}
    >
      <MailIcon size={15} /> Open in mail app
    </a>
  )

  return createPortal(
    <div className="modal-backdrop modal-top" onClick={onClose}>
      <div className="card modal email-modal" role="dialog" aria-modal="true" aria-labelledby="email-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 id="email-title">Draft an email</h2>
            <p className="muted small email-about">
              {app.name || 'This application'}
              {app.company && <> · {app.company}</>}
            </p>
          </div>
          <button type="button" className="ghost icon-only" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </header>

        <div className="email-templates">
          <div className="tpl-switch" role="group" aria-label="Type of email">
            {EMAIL_TEMPLATES.map((t) => (
              <button key={t.id} type="button" aria-pressed={template === t.id} className={template === t.id ? 'active' : ''} onClick={() => setTemplate(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="muted small">
            <strong>{info.when}.</strong> {info.tip}
          </p>
        </div>

        <div className="field">
          <label htmlFor="email-to">To</label>
          <input
            id="email-to"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="recruiter@company.com"
            value={to}
            aria-invalid={toInvalid}
            aria-describedby="email-to-hint"
            onChange={(e) => setTo(e.target.value)}
          />
          <span id="email-to-hint" className={`small ${toInvalid ? 'error' : 'muted'}`}>
            {toInvalid
              ? "That doesn't look like an email address. You can also leave this empty and add it in your mail app."
              : 'Saved with this application, so it is filled in next time.'}
          </span>
        </div>

        <label>
          Subject
          <input value={draft.subject} onChange={(e) => edit({ subject: e.target.value })} />
        </label>

        <div className="field">
          <span className="label-row">
            <label htmlFor="email-body">Message</label>
            {edits[template] && (
              <button type="button" className="link small" onClick={() => setEdits(({ [template]: _dropped, ...rest }) => rest)}>
                Reset to template
              </button>
            )}
          </span>
          <textarea id="email-body" rows={12} value={draft.body} onChange={(e) => edit({ body: e.target.value })} />
          {!sender.name && (
            <span className="muted small">Add your name under Profile &amp; settings and it will sign your emails for you.</span>
          )}
        </div>

        {canRemind && (
          <label className="check">
            <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
            <span>Remind me in a week to check for a reply</span>
          </label>
        )}

        <div className="actions email-actions">
          <button type="button" className="ghost" onClick={copy}>
            {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
            {copied ? 'Copied' : 'Copy message'}
          </button>
          <span className="spacer" />
          {phone ? [gmail, mailApp] : [mailApp, gmail]}
        </div>
        <p className="muted small email-note" role="status">
          {triedMailApp
            ? 'Nothing opened? Use Open in Gmail, or copy the message and paste it into your email.'
            : 'This opens a draft in your own email. Nothing is sent until you press send there.'}
        </p>
      </div>
    </div>,
    document.body,
  )
}
