import { useMemo, useState, type ReactNode } from 'react'
import { byStatus, perWeek, responseByPlatform, summarize } from '../lib/stats'
import type { Application } from '../lib/types'

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)
const shortDate = (key: string) =>
  new Date(key + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

// Clean axis max + ticks: 0..max in 1/2/5 steps
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1]
  const target = max / 4
  const mag = 10 ** Math.floor(Math.log10(target))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= target && s >= 1) ?? Math.max(1, mag)
  const top = Math.ceil(max / step) * step
  return Array.from({ length: top / step + 1 }, (_, i) => i * step)
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card stat-tile">
      <span className="muted small">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  )
}

function Panel({ title, subtitle, table, children }: { title: string; subtitle?: string; table: ReactNode; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className="card viz-panel">
      <header className="viz-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        <button className="link small" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </header>
      {asTable ? table : children}
    </section>
  )
}

/** Horizontal bars, one series. Value label at the bar tip; tooltip on hover. */
function BarList({ rows, max }: { rows: { label: string; value: number; display: string; tip: string }[]; max: number }) {
  const [hover, setHover] = useState<number | null>(null)
  return (
    <div className="barlist" role="list">
      {rows.map((r, i) => (
        <div
          key={r.label}
          role="listitem"
          className={`barlist-row${hover !== null && hover !== i ? ' dim' : ''}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          aria-label={`${r.label}: ${r.tip}`}
        >
          <span className="barlist-label">{r.label}</span>
          <span className="barlist-track">
            <span className="barlist-bar" style={{ width: max ? `calc((100% - 48px) * ${r.value / max})` : 0 }} />
            <span className="barlist-value">{r.display}</span>
            {hover === i && <span className="viz-tip barlist-tip">{r.tip}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

function WeeklyColumns({ weeks }: { weeks: { weekStart: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const ticks = niceTicks(Math.max(...weeks.map((w) => w.count)))
  const top = ticks[ticks.length - 1]
  return (
    <div className="cols">
      <div className="cols-plot">
        {ticks.map((t) => (
          <div key={t} className="cols-grid" style={{ bottom: `${(t / top) * 100}%` }}>
            <span className="cols-tick">{t}</span>
          </div>
        ))}
        <div className="cols-bars">
          {weeks.map((w, i) => (
            <div
              key={w.weekStart}
              className="cols-slot"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              aria-label={`Week of ${shortDate(w.weekStart)}: ${w.count}`}
            >
              {hover === i && <span className="cols-hoverband" />}
              {w.count > 0 && <span className="cols-bar" style={{ height: `${(w.count / top) * 100}%` }} />}
              {hover === i && (
                <span className="viz-tip cols-tip" style={{ bottom: `calc(${(w.count / top) * 100}% + 8px)` }}>
                  <strong>{w.count}</strong> application{w.count === 1 ? '' : 's'}
                  <br />
                  <span className="muted">Week of {shortDate(w.weekStart)}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="cols-axis">
        {weeks.map((w, i) => (
          // every week on wide screens; alternate weeks (ending on the latest) on narrow ones
          <span key={w.weekStart} className={(weeks.length - 1 - i) % 2 ? 'alt' : ''}>{shortDate(w.weekStart)}</span>
        ))}
      </div>
    </div>
  )
}

export default function StatsView({ apps }: { apps: Application[] }) {
  const s = useMemo(() => summarize(apps), [apps])
  const statuses = useMemo(() => byStatus(apps), [apps])
  const platforms = useMemo(() => responseByPlatform(apps), [apps])
  const weeks = useMemo(() => perWeek(apps, 12), [apps])
  const thisWeek = weeks[weeks.length - 1]?.count ?? 0

  if (apps.length === 0) {
    return <p className="muted">Add a few applications and your stats will show up here.</p>
  }

  return (
    <div className="stats">
      <div className="stat-row">
        <Tile label="Applications" value={String(s.total)} sub={`${thisWeek} this week`} />
        <Tile label="Response rate" value={pct(s.responseRate)} sub={`${s.responded} of ${s.total} heard back`} />
        <Tile label="Interviews" value={String(s.interviews)} sub="Interviewed, offered or accepted" />
        <Tile label="Still active" value={String(s.active)} sub="Applied, interviewing or offered" />
      </div>

      <Panel
        title="Applications per week"
        subtitle="Last 12 weeks, by Applied On (weeks start Monday)"
        table={
          <table className="viz-table">
            <thead><tr><th>Week of</th><th className="num">Applications</th></tr></thead>
            <tbody>{weeks.map((w) => <tr key={w.weekStart}><td>{shortDate(w.weekStart)}</td><td className="num">{w.count}</td></tr>)}</tbody>
          </table>
        }
      >
        <WeeklyColumns weeks={weeks} />
      </Panel>

      <div className="viz-two">
        <Panel
          title="Where applications stand"
          subtitle="Current status"
          table={
            <table className="viz-table">
              <thead><tr><th>Status</th><th className="num">Count</th></tr></thead>
              <tbody>{statuses.map((r) => <tr key={r.status}><td>{r.status}</td><td className="num">{r.count}</td></tr>)}</tbody>
            </table>
          }
        >
          <BarList
            max={Math.max(...statuses.map((r) => r.count))}
            rows={statuses.map((r) => ({
              label: r.status,
              value: r.count,
              display: String(r.count),
              tip: `${r.count} of ${s.total} (${pct(r.count / s.total)})`,
            }))}
          />
        </Panel>

        <Panel
          title="Response rate by platform"
          subtitle="Share that heard back (interview, offer or rejection)"
          table={
            <table className="viz-table">
              <thead><tr><th>Platform</th><th className="num">Heard back</th><th className="num">Applied</th><th className="num">Rate</th></tr></thead>
              <tbody>{platforms.map((r) => <tr key={r.platform}><td>{r.platform}</td><td className="num">{r.responded}</td><td className="num">{r.total}</td><td className="num">{pct(r.rate)}</td></tr>)}</tbody>
            </table>
          }
        >
          <BarList
            max={1}
            rows={platforms.map((r) => ({
              label: r.platform,
              value: r.rate,
              display: pct(r.rate),
              tip: `${r.responded} of ${r.total} heard back`,
            }))}
          />
        </Panel>
      </div>
    </div>
  )
}
