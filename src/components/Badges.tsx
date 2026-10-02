import { statusClass } from '../lib/format'
import { isStale, relativeLabel, urgencyOf } from '../lib/nextSteps'
import type { Application, Status } from '../lib/types'
import { postingSummary, postingUrl } from '../lib/posting'
import { BellIcon, ExternalIcon } from './Icons'

/** Next-step reminder on a card/row: "Interview · Thu" coloured by urgency, or a follow-up nudge. */
export function NextBadge({ app }: { app: Application }) {
  if (app.next_step && app.next_date) {
    return (
      <span className={`next-badge urgency-${urgencyOf(app.next_date)}`} title={`${app.next_step}: ${relativeLabel(app.next_date)}`}>
        <BellIcon size={12} />
        {app.next_step} · {relativeLabel(app.next_date, undefined, true)}
      </span>
    )
  }
  if (isStale(app)) return <span className="next-badge nudge" title="No reply for 2+ weeks">Follow up?</span>
  return null
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`pill ${statusClass(status)}`}>
      <span className="dot" />
      {status}
    </span>
  )
}

/** Opens the saved job posting in a new tab. Icon only by default (cards, rows); pass `label` to show text too. */
export function PostingLink({ app, label = false }: { app: Application; label?: boolean }) {
  const url = postingUrl(app)
  if (!url) return null
  const summary = postingSummary(app)
  return (
    <a
      className={`posting-link${label ? ' with-label' : ''}`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={summary ? `Open the job posting (${summary.toLowerCase()})` : 'Open the job posting'}
      aria-label={`Open the job posting for ${app.name}`}
      // the card/row behind it opens the edit form on click and Enter: keep those for the card itself
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <ExternalIcon size={13} />
      {label && <span>Open posting</span>}
    </a>
  )
}

/** Shown once the user has marked the posting as taken down */
export function PostingBadge({ app }: { app: Application }) {
  if (!app.posting_closed) return null
  return <span className="posting-badge" title={postingSummary(app)}>Posting closed</span>
}
