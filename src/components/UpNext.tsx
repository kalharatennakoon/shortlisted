import { useState } from 'react'
import { daysBetween, todayKey } from '../lib/dates'
import { FOLLOW_UP_AFTER_DAYS, needsFollowUp, plannedSteps } from '../lib/nextSteps'
import { postingSummary, postingUrl } from '../lib/posting'
import type { Application } from '../lib/types'
import { PostingLink } from './Badges'
import { BellIcon, CalendarPlusIcon, CheckIcon, ChevronIcon, MailIcon } from './Icons'

interface Props {
  apps: Application[]
  onOpen: (app: Application) => void
  onDone: (app: Application) => Promise<void>
  onPlanFollowUp: (app: Application) => Promise<void>
  onNoResponse: (app: Application) => Promise<void>
  /** Draft a follow-up / thank-you email for this application */
  onEmail: (app: Application) => void
  /** Add this application's next step to a calendar */
  onCalendar: (app: Application) => void
}

// How many steps to show before "Show all": fewer on phones so the board stays in reach
const collapsedCount = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches ? 3 : 6

function ago(days: number) {
  const weeks = Math.floor(days / 7)
  return weeks >= 1 ? `${weeks} week${weeks > 1 ? 's' : ''} ago` : `${days} days ago`
}

/**
 * "Up next": dated next steps (overdue first) and gentle follow-up nudges for stale applications.
 * Each step has a shortcut: a follow-up opens the email draft, everything else goes to the calendar.
 */
export default function UpNext({ apps, onOpen, onDone, onPlanFollowUp, onNoResponse, onEmail, onCalendar }: Props) {
  const today = todayKey()
  const steps = plannedSteps(apps, today)
  const stale = needsFollowUp(apps, today)
  const [showAll, setShowAll] = useState(false)
  const [showStale, setShowStale] = useState(false)
  const [busy, setBusy] = useState<string | null>(null) // app id being updated

  const act = (app: Application, fn: (a: Application) => Promise<void>) => async () => {
    setBusy(app.id)
    try {
      await fn(app)
    } finally {
      setBusy(null)
    }
  }

  if (apps.length === 0) return null

  if (steps.length === 0 && stale.length === 0) {
    return (
      <p className="upnext-hint">
        <span className="upnext-hint-icon" aria-hidden="true">
          <BellIcon size={14} />
        </span>
        {/* One text node: as separate flex items the words would split into columns on narrow screens */}
        <span>
          <strong>Tip:</strong> add a <strong>next step</strong> (interview, follow-up…) to an application and it shows up
          here with a reminder.
        </span>
      </p>
    )
  }

  const overdue = steps.filter((s) => s.urgency === 'overdue').length
  const limit = collapsedCount()
  const visible = showAll ? steps : steps.slice(0, limit)

  return (
    <section className="upnext" aria-label="Up next">
      {steps.length > 0 && (
        <>
          <header className="upnext-head">
            <h2>
              <BellIcon size={16} /> Up next
            </h2>
            <span className="muted small">
              {steps.length} planned{overdue > 0 && <span className="overdue-count"> · {overdue} overdue</span>}
            </span>
          </header>
          <ul className="upnext-list">
            {visible.map(({ app, label, urgency }) => (
              <li key={app.id} className={`upnext-item urgency-${urgency}`}>
                <button className="upnext-body" onClick={() => onOpen(app)} title="Open application">
                  <span className="upnext-when">{label}</span>
                  <span className="upnext-what">
                    <strong>{app.next_step}</strong>
                    <span className="upnext-role">
                      {app.name}
                      {app.company && <span className="muted"> · {app.company}</span>}
                    </span>
                  </span>
                </button>
                {/* a follow-up is an email to write; anything else is a date to keep */}
                {app.next_step === 'Follow up' ? (
                  <button
                    className="upnext-act"
                    onClick={() => onEmail(app)}
                    aria-label={`Draft a follow-up email for ${app.name}`}
                    title="Draft a follow-up email"
                  >
                    <MailIcon size={16} />
                  </button>
                ) : (
                  <button
                    className="upnext-act"
                    onClick={() => onCalendar(app)}
                    aria-label={`Add "${app.next_step}" for ${app.name} to your calendar`}
                    title="Add to calendar"
                  >
                    <CalendarPlusIcon size={16} />
                  </button>
                )}
                <button
                  className="upnext-done"
                  onClick={act(app, onDone)}
                  disabled={busy === app.id}
                  aria-label={`Mark "${app.next_step}" for ${app.name} as done`}
                  title="Mark done"
                >
                  <CheckIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
          {steps.length > limit && (
            <button className="link small upnext-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show less' : `Show all ${steps.length}`}
            </button>
          )}
        </>
      )}

      {stale.length > 0 && (
        <div className="followups">
          <button className="followups-toggle" onClick={() => setShowStale((v) => !v)} aria-expanded={showStale}>
            <span className="nudge-dot" />
            <span>
              <strong>{stale.length}</strong> application{stale.length > 1 ? 's have' : ' has'} had no reply for{' '}
              {FOLLOW_UP_AFTER_DAYS / 7}+ weeks
            </span>
            <span className="spacer" />
            <span className="link small">{showStale ? 'Hide' : 'Review'}</span>
            <ChevronIcon size={14} className={showStale ? 'chev open' : 'chev'} />
          </button>
          {showStale && (
            <ul className="followups-list">
              {stale.map((app) => (
                <li key={app.id}>
                  <button className="followup-role" onClick={() => onOpen(app)}>
                    <strong>{app.name}</strong>
                    {app.company && <span className="muted"> · {app.company}</span>}
                    <span className="muted small"> · applied {ago(daysBetween(app.applied_on!, today))}</span>
                  </button>
                  {/* worth a look before chasing: has the posting been taken down? */}
                  {postingUrl(app) && (
                    <span className={`followup-posting${app.posting_closed ? ' closed' : ''}`}>
                      <PostingLink app={app} label />
                      <span className="muted small">{postingSummary(app, today)}</span>
                    </span>
                  )}
                  <span className="followup-actions">
                    <button className="secondary small-btn" onClick={() => onEmail(app)}>
                      <MailIcon size={13} /> Draft email
                    </button>
                    <button className="secondary small-btn" onClick={act(app, onPlanFollowUp)} disabled={busy === app.id}>
                      Follow up today
                    </button>
                    <button className="ghost small-btn" onClick={act(app, onNoResponse)} disabled={busy === app.id}>
                      Mark no response
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
