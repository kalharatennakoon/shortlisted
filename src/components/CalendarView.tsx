import { useMemo, useState } from 'react'
import type { Application } from '../lib/types'

interface Props {
  apps: Application[]
  onOpen: (app: Application) => void
  onNew: (date: string) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Local-date key (YYYY-MM-DD) without UTC shifting
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function CalendarView({ apps, onOpen, onNew }: Props) {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const byDate = useMemo(() => {
    const map = new Map<string, Application[]>()
    apps.forEach((a) => {
      if (!a.applied_on) return
      const list = map.get(a.applied_on) ?? []
      list.push(a)
      map.set(a.applied_on, list)
    })
    return map
  }, [apps])

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
  const monthApps = apps
    .filter((a) => a.applied_on?.startsWith(monthPrefix))
    .sort((a, b) => (a.applied_on! < b.applied_on! ? -1 : 1))
  const statusClass = (a: Application) => `status-${a.status.replace(' ', '-').toLowerCase()}`

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
              {items.map((a) => (
                <button
                  key={a.id}
                  className={`cal-item ${statusClass(a)}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(a)
                  }}
                  title={`${a.name}${a.company ? ' · ' + a.company : ''} (${a.status})`}
                >
                  {a.name}
                  {a.company && <span className="muted"> · {a.company}</span>}
                </button>
              ))}
              </div>
            </div>
          )
        })}
      </div>
      {/* Compact agenda, shown on small screens where calendar cells are too narrow for titles */}
      <ul className="cal-agenda">
        {monthApps.length === 0 && <li className="muted small">No applications this month.</li>}
        {monthApps.map((a) => (
          <li key={a.id}>
            <button className="card" onClick={() => onOpen(a)}>
              <span className="muted small">
                {new Date(a.applied_on + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </span>
              <span className="cal-agenda-title">
                <strong>{a.name}</strong>
                {a.company && <span className="muted"> · {a.company}</span>}
              </span>
              <span className={`pill ${statusClass(a)}`}>{a.status}</span>
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
