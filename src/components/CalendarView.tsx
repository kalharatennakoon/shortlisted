import { useMemo, useState } from 'react'
import { toKey as key } from '../lib/dates'
import { urgencyOf } from '../lib/nextSteps'
import type { Application } from '../lib/types'
import { BellIcon } from './Icons'

interface Props {
  apps: Application[]
  onOpen: (app: Application) => void
  onNew: (date: string) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

  // Steps first within a day: they're the actionable ones
  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = []
    apps.forEach((a) => {
      if (a.next_step && a.next_date) list.push({ kind: 'step', date: a.next_date, app: a })
      if (a.applied_on) list.push({ kind: 'applied', date: a.applied_on, app: a })
    })
    return list.sort((x, y) => (x.date === y.date ? (x.kind === 'step' ? -1 : 1) : x.date < y.date ? -1 : 1))
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

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))
  const today = key(new Date())
  const undated = apps.filter((a) => !a.applied_on).length
  const monthPrefix = key(month).slice(0, 7)
  const monthEntries = entries.filter((e) => e.date.startsWith(monthPrefix))

  const itemClass = (e: Entry) =>
    e.kind === 'step' ? `cal-item cal-step urgency-${urgencyOf(e.date, today)}` : `cal-item ${statusClass(e.app)}`
  const itemTitle = (e: Entry) =>
    e.kind === 'step'
      ? `${e.app.next_step}: ${e.app.name}${e.app.company ? ' · ' + e.app.company : ''}`
      : `Applied: ${e.app.name}${e.app.company ? ' · ' + e.app.company : ''} (${e.app.status})`

  return (
    <div className="calendar">
      <div className="cal-header">
        <h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <span className="spacer" />
        <button onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <button
          onClick={() => {
            const n = new Date()
            setMonth(new Date(n.getFullYear(), n.getMonth(), 1))
          }}
        >
          Today
        </button>
        <button onClick={() => shift(1)} aria-label="Next month">›</button>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="cal-weekday">{d}</div>
        ))}
        {days.map((d) => {
          const k = key(d)
          const items = byDate.get(k) ?? []
          const outside = d.getMonth() !== month.getMonth()
          return (
            <div
              key={k}
              className={`cal-day${outside ? ' outside' : ''}${k === today ? ' today' : ''}`}
              onClick={() => onNew(k)}
              title="Click an empty spot to add an application on this date"
            >
              <span className="cal-date">{d.getDate()}</span>
              <div className="cal-items">
                {items.map((e) => (
                  <button
                    key={e.kind + e.app.id}
                    className={itemClass(e)}
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
              </div>
            </div>
          )
        })}
      </div>
      <p className="cal-legend muted small">
        <span className="legend-applied" /> Applied <span className="legend-step" /> Next step (interview, follow-up…)
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
