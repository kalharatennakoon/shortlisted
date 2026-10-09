import { fmtDate } from '../lib/format'
import type { Duplicate } from '../lib/duplicates'
import { StatusPill } from './Badges'

interface Props {
  duplicate: Duplicate
  /** Leave the new application and open the one already there */
  onOpen: () => void
  /** Carry on with the new one; the label says what that means here ("Keep both", "Add it again") */
  onKeep: () => void
  keepLabel?: string
}

/**
 * "You've already added this posting": shown in a new application that repeats one in the list (lib/duplicates.ts).
 * A warning, never a block: applying again to the same place is the person's call.
 */
export default function DuplicateNote({ duplicate: { app, why }, onOpen, onKeep, keepLabel = 'Keep both' }: Props) {
  return (
    <div className="dup-note" role="status">
      <p>
        <strong>{why === 'link' ? "You've already added this posting." : 'You already have an application for this role at this company.'}</strong>
      </p>
      <p className="dup-note-app">
        <span className="dup-note-role">
          {app.name}
          {app.company && <span className="muted"> · {app.company}</span>}
        </span>
        <StatusPill status={app.status} />
        {app.applied_on && <span className="muted small">applied {fmtDate(app.applied_on)}</span>}
      </p>
      <div className="dup-note-actions">
        <button type="button" className="secondary small-btn" onClick={onOpen}>
          Open it
        </button>
        <button type="button" className="ghost small-btn" onClick={onKeep}>
          {keepLabel}
        </button>
      </div>
    </div>
  )
}
