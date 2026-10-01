import { hueOf, initials, statusClass } from '../lib/format'
import { isStale, relativeLabel, urgencyOf } from '../lib/nextSteps'
import type { CSSProperties } from 'react'
import type { Application, Status } from '../lib/types'
import { BellIcon } from './Icons'

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

/** Company monogram: initials on a soft colour picked from the name (decorative; the name is always shown beside it) */
export function CompanyAvatar({ name, size = 'md' }: { name: string | null; size?: 'sm' | 'md' }) {
  const label = name?.trim() || ''
  return (
    <span
      className={`co-avatar co-avatar-${size}${label ? '' : ' co-avatar-empty'}`}
      style={label ? ({ '--av-h': hueOf(label) } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      {label ? initials(label) : '·'}
    </span>
  )
}
