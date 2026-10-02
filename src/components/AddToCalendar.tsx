import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { downloadIcs, eventFor, eventWhen, googleCalendarUrl, type CalendarApp, type CalendarEvent } from '../lib/calendarLinks'
import { appUrl } from '../lib/supabase'
import { CalendarPlusIcon, DownloadIcon, ExternalIcon, XIcon } from './Icons'

/**
 * The two ways to put an event in a calendar: Google Calendar (a link) and an .ics file (Apple Calendar, Outlook).
 * `chips` is the small version used inside the application form.
 */
export function CalendarButtons({ event, chips = false, onAdded }: { event: CalendarEvent; chips?: boolean; onAdded?: () => void }) {
  return (
    <>
      <a
        className={chips ? 'chip' : 'btn primary'}
        href={googleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onAdded && setTimeout(onAdded, 0)}
      >
        Google Calendar {!chips && <ExternalIcon size={14} />}
      </a>
      <button
        type="button"
        className={chips ? 'chip' : 'secondary'}
        title="Downloads a calendar file (.ics) that Apple Calendar, Outlook and most other calendars open"
        onClick={() => {
          downloadIcs(event)
          onAdded?.()
        }}
      >
        {!chips && <DownloadIcon size={15} />}
        Apple / Outlook
      </button>
    </>
  )
}

interface Props {
  app: CalendarApp
  /** Opens the application, to add or change the time */
  onEdit: () => void
  onClose: () => void
}

/** "Add to calendar" for a step in the Up next strip: what will be added, then where to. */
export default function CalendarDialog({ app, onEdit, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const event = eventFor(app, appUrl())
  if (!event) return null

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="cal-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="cal-title">Add to calendar</h2>
          <button type="button" className="ghost icon-only" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </header>
        <div className="cal-event">
          <span className="cal-event-icon" aria-hidden="true">
            <CalendarPlusIcon size={18} />
          </span>
          <span>
            <strong>{event.title}</strong>
            <span className="muted small block">{eventWhen(event)}</span>
          </span>
        </div>
        {!event.time && (
          <p className="muted small">
            No time is set, so it goes in as an all-day event.{' '}
            <button type="button" className="link small" onClick={onEdit}>
              Add a time
            </button>
          </p>
        )}
        <div className="actions cal-actions">
          <CalendarButtons event={event} onAdded={onClose} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
