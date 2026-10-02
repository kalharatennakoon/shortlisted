import { useMemo, useState } from 'react'
import { toKey as key } from '../lib/dates'
import { fmtTime } from '../lib/format'
import { stepTime, urgencyOf } from '../lib/nextSteps'
import type { Application } from '../lib/types'
import { BellIcon, ChevronIcon, PlusIcon } from './Icons'

interface Props {
  apps: Application[]
  onOpen: (app: Application) => void
  onNew: (date: string) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Items shown in a day cell before "+N more" (wide screens; phones show dots and the agenda) */
const MAX_PER_DAY = 3

/** One thing on a calendar day: the day you applied, or a planned next step. */
type Entry = { kind: 'applied' | 'step'; date: string; app: Application }

const statusClass = (a: Application) => `status-${a.status.replace(' ', '-').toLowerCase()}`
const shortDate = (k: string) =>
  new Date(k + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function CalendarView({ apps, onOpen, onNew }: Props) {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  // Steps first within a day: they're the actionable ones (all-day steps, then by time)
  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = []
    apps.forEach((a) => {
      if (a.next_step && a.next_date) list.push({ kind: 'step', date: a.next_date, app: a })
      if (a.applied_on) list.push({ kind: 'applied', date: a.applied_on, app: a })
    })
    const order = (e: Entry) => `${e.date} ${e.kind === 'step' ? `0${stepTime(e.app) ?? ''}` : '1'}`
    return list.sort((x, y) => (order(x) < order(y) ? -1 : order(x) > order(y) ? 1 : 0))
  }, [apps])

  const byDate = useMemo(() => {
    const map = new Map<string, Entry[]>()
    entries.forEach((e) => map.set(e.date, [...(map.get(e.date) ?? []), e]))
    return map
  }, [entries])

  // 6-week grid starting on the Monday on/before the 1st
  const days = useMemo(() => {
    const offset = (month.getDay() + 6) % 7
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - offset)
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [month])

  const [expanded, setExpanded] = useState<string | null>(null)
  const shift = (n: number) => {
    setExpanded(null)
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))
  }
  const today = key(new Date())
  const undated = apps.filter((a) => !a.applied_on).length
  const monthPrefix = key(month).slice(0, 7)
  const monthEntries = entries.filter((e) => e.date.startsWith(monthPrefix))
  const appliedCount = monthEntries.filter((e) => e.kind === 'applied').length
  const stepCount = monthEntries.length - appliedCount
  const isThisMonth = monthPrefix === today.slice(0, 7)

  const itemClass = (e: Entry) =>
    e.kind === 'step' ? `cal-item cal-step urgency-${urgencyOf(e.date, today)}` : `cal-item ${statusClass(e.app)}`
  const itemTitle = (e: Entry) =>
    e.kind === 'step'
      ? `${e.app.next_step}${stepTime(e.app) ? ` at ${fmtTime(stepTime(e.app))}` : ''}: ${e.app.name}${e.app.company ? ' · ' + e.app.company : ''}`
      : `Applied: ${e.app.name}${e.app.company ? ' · ' + e.app.company : ''} (${e.app.status})`

  return (
    <div className="calendar">
      <div className="cal-header">
        <div className="cal-title">
          <h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
          <p className="muted small">
            {appliedCount} applied · {stepCount} next step{stepCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="cal-nav">
          <button onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronIcon className="chev-left" />
          </button>
          <button
            className={isThisMonth ? 'is-current' : ''}
            onClick={() => {
              const n = new Date()
              setExpanded(null)
              setMonth(new Date(n.getFullYear(), n.getMonth(), 1))
            }}
          >
            Today
          </button>
          <button onClick={() => shift(1)} aria-label="Next month">
            <ChevronIcon className="chev-right" />
          </button>
        </div>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="cal-weekday">{d}</div>
        ))}
        {days.map((d) => {
          const k = key(d)
          const items = byDate.get(k) ?? []
          const outside = d.getMonth() !== month.getMonth()
          const weekend = d.getDay() === 0 || d.getDay() === 6
          const open = expanded === k
          const hidden = open ? 0 : Math.max(0, items.length - MAX_PER_DAY)
          return (
            <div
              key={k}
              className={`cal-day${outside ? ' outside' : ''}${weekend ? ' weekend' : ''}${k === today ? ' today' : ''}${open ? ' expanded' : ''}`}
              onClick={() => onNew(k)}
              title="Click an empty spot to add an application on this date"
            >
              <span className="cal-day-top">
                <PlusIcon size={12} className="cal-add" aria-hidden="true" />
                <span className="cal-date">{d.getDate()}</span>
              </span>
              <div className="cal-items">
                {items.map((e, i) => (
                  <button
                    key={e.kind + e.app.id}
                    className={`${itemClass(e)}${!open && i >= MAX_PER_DAY ? ' extra' : ''}`}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onOpen(e.app)
                    }}
                    title={itemTitle(e)}
                  >
                    {e.kind === 'step' ? (
                      <>
                        <BellIcon size={11} /> {e.app.next_step}: {e.app.name}
                      </>
                    ) : (
                      <>
                        {e.app.name}
                        {e.app.company && <span className="muted"> · {e.app.company}</span>}
                      </>
                    )}
                  </button>
                ))}
                {(hidden > 0 || open) && items.length > MAX_PER_DAY && (
                  <button
                    className="cal-more"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setExpanded(open ? null : k)
                    }}
                    aria-expanded={open}
                  >
                    {open ? 'Show less' : `+${hidden} more`}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="cal-legend muted small">
        <span className="legend-item"><span className="legend-applied" /> Applied (coloured by status)</span>
        <span className="legend-item"><span className="legend-step" /> Next step (interview, follow-up…)</span>
        <span className="legend-item hide-sm">Click an empty day to add an application</span>
      </p>

      {/* Compact agenda, shown on small screens where calendar cells are too narrow for titles */}
      <ul className="cal-agenda">
        {monthEntries.length === 0 && <li className="muted small">Nothing this month.</li>}
        {monthEntries.map((e) => (
          <li key={e.kind + e.app.id}>
            <button className="card" onClick={() => onOpen(e.app)}>
              <span className="muted small">{shortDate(e.date)}</span>
              <span className="cal-agenda-title">
                <strong>{e.app.name}</strong>
                {e.app.company && <span className="muted"> · {e.app.company}</span>}
              </span>
              {e.kind === 'step' ? (
                <span className={`next-badge urgency-${urgencyOf(e.date, today)}`}>
                  <BellIcon size={12} />
                  {e.app.next_step}
                  {stepTime(e.app) && ` · ${fmtTime(stepTime(e.app))}`}
                </span>
              ) : (
                <span className={`pill ${statusClass(e.app)}`}>{e.app.status}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {undated > 0 && (
        <p className="muted small">{undated} application{undated > 1 ? 's' : ''} without an Applied On date (see Table view).</p>
      )}
    </div>
  )
}
