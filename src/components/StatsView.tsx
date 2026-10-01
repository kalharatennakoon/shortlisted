import { useMemo, useState, type ReactNode } from 'react'
import { statusClass } from '../lib/format'
import { FOLLOW_UP_AFTER_DAYS, needsFollowUp } from '../lib/nextSteps'
import {
  RANGES,
  bestPlatform,
  busiestWeek,
  byStatus,
  funnel,
  inRange,
  perWeek,
  responseByPlatform,
  summarize,
  weekStreak,
  weeksFor,
  type RangeId,
  type WeekCount,
} from '../lib/stats'
import type { Application } from '../lib/types'
import { BellIcon, BriefcaseIcon, BuildingIcon, ChartIcon, FlagIcon, MailIcon, UserIcon, BoardIcon } from './Icons'

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)
const shortDate = (key: string) =>
  new Date(key + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Clean axis max + ticks: 0..max in 1/2/5 steps
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1]
  const target = max / 4
  const mag = 10 ** Math.floor(Math.log10(target))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= target && s >= 1) ?? Math.max(1, mag)
  const top = Math.ceil(max / step) * step
  return Array.from({ length: top / step + 1 }, (_, i) => i * step)
}

// ---------- Small visuals ----------

/** Decorative trend line for a tile; the same numbers are in the weekly chart and its table. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 30 - (v / max) * 26] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  return (
    <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L100,32 L0,32 Z`} className="spark-area" />
      <path d={line} className="spark-line" />
    </svg>
  )
}

function Ring({ value }: { value: number | null }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <svg className="ring" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r={r} className="ring-track" />
      <circle cx="28" cy="28" r={r} className="ring-value" strokeDasharray={`${c * (value ?? 0)} ${c}`} />
    </svg>
  )
}

function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  const d = now - before
  if (d === 0) return <span className="delta flat">Same as {label}</span>
  return (
    <span className={`delta ${d > 0 ? 'up' : 'down'}`}>
      <span aria-hidden="true">{d > 0 ? '↑' : '↓'}</span> {Math.abs(d)} vs {label}
    </span>
  )
}

function Tile({ icon, label, value, foot, aside }: { icon: ReactNode; label: string; value: string; foot?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="card stat-tile">
      <div className="stat-top">
        <span className="stat-icon">{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-main">
        <span className="stat-value">{value}</span>
        {aside}
      </div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  )
}

function Panel({ title, subtitle, badge, table, children, className = '' }: {
  title: string
  subtitle?: string
  badge?: ReactNode
  table?: ReactNode
  children: ReactNode
  className?: string
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className={`card viz-panel ${className}`}>
      <header className="viz-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        <div className="viz-head-side">
          {badge}
          {table && (
            <button className="link small" onClick={() => setAsTable((v) => !v)}>
              {asTable ? 'Show chart' : 'Show table'}
            </button>
          )}
        </div>
      </header>
      {asTable && table ? table : children}
    </section>
  )
}

// ---------- Charts ----------

/** Horizontal bars on a soft track, one series. Value label on the right; tooltip on hover. */
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
          <div className="barlist-meta">
            <span className="barlist-label">{r.label}</span>
            <span className="barlist-value">{r.display}</span>
          </div>
          <span className="barlist-track">
            <span className="barlist-bar" style={{ width: max ? `${(r.value / max) * 100}%` : 0 }} />
            {hover === i && <span className="viz-tip barlist-tip">{r.tip}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

function WeeklyColumns({ weeks }: { weeks: WeekCount[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const ticks = niceTicks(Math.max(...weeks.map((w) => w.count)))
  const top = ticks[ticks.length - 1]
  const avg = weeks.reduce((n, w) => n + w.count, 0) / weeks.length
  const last = weeks.length - 1
  return (
    <div className="cols">
      <div className="cols-plot">
        {ticks.map((t) => (
          <div key={t} className="cols-grid" style={{ bottom: `${(t / top) * 100}%` }}>
            <span className="cols-tick">{t}</span>
          </div>
        ))}
        {avg > 0 && <div className="cols-avg" style={{ bottom: `${(avg / top) * 100}%` }} aria-hidden="true" />}
        <div className="cols-bars">
          {weeks.map((w, i) => (
            <div
              key={w.weekStart}
              className={`cols-slot${hover !== null && hover !== i ? ' dim' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              aria-label={`Week of ${shortDate(w.weekStart)}: ${w.count}`}
            >
              {w.count > 0 && (
                <span className={`cols-bar${i === last ? ' current' : ''}`} style={{ height: `${(w.count / top) * 100}%` }} />
              )}
              {hover === i && (
                <span className="viz-tip cols-tip" style={{ bottom: `calc(${(w.count / top) * 100}% + 8px)` }}>
                  <strong>{plural(w.count, 'application')}</strong>
                  <br />
                  <span className="muted">{i === last ? 'This week' : `Week of ${shortDate(w.weekStart)}`}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className={`cols-axis${weeks.length > 14 ? ' sparse' : ''}`}>
        {weeks.map((w, i) => (
          // alternate labels (ending on the latest) when there are many weeks or the screen is narrow
          <span key={w.weekStart} className={[(last - i) % 2 ? 'alt' : '', (last - i) % 4 ? 'alt4' : ''].join(' ').trim()}>
            {i === last ? 'This wk' : shortDate(w.weekStart)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Funnel({ steps }: { steps: ReturnType<typeof funnel> }) {
  const [hover, setHover] = useState<number | null>(null)
  return (
    <ol className="funnel">
      {steps.map((s, i) => (
        <li
          key={s.label}
          className={`funnel-step${hover !== null && hover !== i ? ' dim' : ''}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          aria-label={`${s.label}: ${s.count}${s.ofPrev !== null ? `, ${pct(s.ofPrev)} of the step above` : ''}`}
        >
          <div className="funnel-meta">
            <span className="funnel-label">{s.label}</span>
            <span className="funnel-count">{s.count}</span>
          </div>
          <div className="funnel-track">
            <span className="funnel-bar" style={{ width: `${(s.ofTotal ?? 0) * 100}%` }} />
            {hover === i && <span className="viz-tip funnel-tip">{s.hint}</span>}
          </div>
          {i > 0 && (
            <span className="funnel-conv muted small">
              {s.ofPrev === null ? '—' : `${pct(s.ofPrev)} of ${steps[i - 1].label.toLowerCase()}`}
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

/** One bar split by status (status colours, always with a labelled legend). */
function StatusSplit({ rows, total }: { rows: ReturnType<typeof byStatus>; total: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const segs = rows.reduce<(typeof rows[number] & { start: number; width: number })[]>((acc, r) => {
    const prev = acc[acc.length - 1]
    acc.push({ ...r, start: prev ? prev.start + prev.width : 0, width: total ? r.count / total : 0 })
    return acc
  }, [])
  return (
    <div className="split-chart">
      <div className="split-bar">
        {segs.map((s, i) =>
          s.count ? (
            <span
              key={s.status}
              className={`split-seg ${statusClass(s.status)}${hover !== null && hover !== i ? ' dim' : ''}`}
              style={{ flex: `${s.count} 1 0` }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              aria-label={`${s.status}: ${s.count}`}
            />
          ) : null,
        )}
        {hover !== null && (
          <span className="viz-tip split-tip" style={{ left: `${(segs[hover].start + segs[hover].width / 2) * 100}%` }}>
            <strong>{segs[hover].status}</strong> · {segs[hover].count} ({pct(segs[hover].width)})
          </span>
        )}
      </div>
      <ul className="split-legend">
        {segs.map((s, i) => (
          <li
            key={s.status}
            className={`${statusClass(s.status)}${s.count === 0 ? ' empty' : ''}${hover !== null && hover !== i ? ' dim' : ''}`}
            onMouseEnter={() => s.count && setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="dot" />
            <span className="split-name">{s.status}</span>
            <span className="split-num">{s.count}</span>
            <span className="split-pct muted">{pct(s.width)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Highlight({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="highlight">
      <span className="highlight-icon">{icon}</span>
      <div>
        <p className="highlight-title">{title}</p>
        <p className="muted small">{children}</p>
      </div>
    </li>
  )
}

// ---------- Page ----------

export default function StatsView({ apps }: { apps: Application[] }) {
  const [rangeId, setRangeId] = useState<RangeId>('all')
  const range = RANGES.find((r) => r.id === rangeId)!
  const shown = useMemo(() => inRange(apps, range.days), [apps, range.days])
  const previous = useMemo(() => (range.days === null ? null : inRange(apps, range.days, new Date(), range.days)), [apps, range.days])

  const s = useMemo(() => summarize(shown), [shown])
  const statuses = useMemo(() => byStatus(shown), [shown])
  const platforms = useMemo(() => responseByPlatform(shown), [shown])
  const steps = useMemo(() => funnel(shown), [shown])
  const weeks = useMemo(() => perWeek(apps, weeksFor(apps, range.days)), [apps, range.days])
  const recent = useMemo(() => perWeek(apps, 12), [apps])
  const followUps = useMemo(() => needsFollowUp(shown).length, [shown])

  if (apps.length === 0) {
    return <p className="muted">Add a few applications and your stats will show up here.</p>
  }

  const thisWeek = recent[recent.length - 1]?.count ?? 0
  const avg = weeks.reduce((n, w) => n + w.count, 0) / weeks.length
  const best = bestPlatform(platforms)
  const streak = weekStreak(recent)
  const busiest = busiestWeek(weeks)
  const prevLabel = `previous ${range.label}`
  const undated = range.days === null ? apps.filter((a) => !a.applied_on).length : 0

  return (
    <div className="stats">
      <div className="stats-head">
        <div>
          <h2>Overview</h2>
          <p className="muted small">
            {range.days === null ? 'All your applications' : `Applied in the last ${range.label}`}
            {undated > 0 && ` · ${plural(undated, 'application')} without an Applied On date only count here`}
          </p>
        </div>
        <div className="segmented range-switch" role="radiogroup" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.id} role="radio" aria-checked={rangeId === r.id} className={rangeId === r.id ? 'active' : ''} onClick={() => setRangeId(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card stats-empty">
          <p>No applications in the last {range.label}.</p>
          <button className="secondary" onClick={() => setRangeId('all')}>Show all time</button>
        </div>
      ) : (
        <>
          <div className="stat-row">
            <Tile
              icon={<BriefcaseIcon />}
              label="Applications"
              value={String(s.total)}
              aside={<Sparkline values={recent.map((w) => w.count)} />}
              foot={previous ? <Delta now={s.total} before={previous.length} label={prevLabel} /> : <span className="muted">{thisWeek} this week</span>}
            />
            <Tile
              icon={<MailIcon />}
              label="Response rate"
              value={pct(s.responseRate)}
              aside={<Ring value={s.responseRate} />}
              foot={<span className="muted">{s.responded} of {s.total} heard back</span>}
            />
            <Tile
              icon={<UserIcon />}
              label="Interviews"
              value={String(s.interviews)}
              foot={<span className="muted">{pct(s.total ? s.interviews / s.total : null)} of applications · {plural(s.offers, 'offer')}</span>}
            />
            <Tile
              icon={<BoardIcon />}
              label="Still active"
              value={String(s.active)}
              foot={<span className="muted">Applied, interviewing or offered</span>}
            />
          </div>

          <Panel
            title="Applications per week"
            subtitle={`Last ${weeks.length} weeks, by Applied On (weeks start Monday)`}
            badge={<span className="chip">Avg {avg.toFixed(avg < 10 ? 1 : 0)} / week</span>}
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
              title="Hiring funnel"
              subtitle="How far applications got, by current status"
              table={
                <table className="viz-table">
                  <thead><tr><th>Stage</th><th className="num">Count</th><th className="num">Of applied</th><th className="num">Of previous</th></tr></thead>
                  <tbody>{steps.map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{r.count}</td><td className="num">{pct(r.ofTotal)}</td><td className="num">{pct(r.ofPrev)}</td></tr>)}</tbody>
                </table>
              }
            >
              <Funnel steps={steps} />
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
                  display: `${pct(r.rate)} · ${r.responded}/${r.total}`,
                  tip: `${r.responded} of ${r.total} heard back`,
                }))}
              />
            </Panel>

          </div>

          <div className="viz-two">
            <Panel
              title="Where applications stand"
              subtitle="Current status"
              table={
                <table className="viz-table">
                  <thead><tr><th>Status</th><th className="num">Count</th><th className="num">Share</th></tr></thead>
                  <tbody>{statuses.map((r) => <tr key={r.status}><td>{r.status}</td><td className="num">{r.count}</td><td className="num">{pct(s.total ? r.count / s.total : null)}</td></tr>)}</tbody>
                </table>
              }
            >
              <StatusSplit rows={statuses} total={s.total} />
            </Panel>
            <Panel title="Highlights" subtitle="Patterns worth knowing">
              <ul className="highlights">
                <Highlight icon={<BuildingIcon />} title={best ? `${best.platform === 'Other' ? 'Other platforms get' : `${best.platform} gets`} the most replies` : 'Best platform'}>
                  {best
                    ? `${pct(best.rate)} heard back (${best.responded} of ${best.total}).`
                    : 'Log the platform on at least 3 applications per platform to compare.'}
                </Highlight>
                <Highlight icon={<FlagIcon />} title={streak ? `${plural(streak, 'week')} in a row` : 'No streak yet'}>
                  {streak ? 'You applied every week. Keep it going.' : 'Apply this week to start a streak.'}
                </Highlight>
                <Highlight icon={<ChartIcon />} title="Busiest week">
                  {busiest ? `${plural(busiest.count, 'application')} in the week of ${shortDate(busiest.weekStart)}.` : 'No dated applications in this range.'}
                </Highlight>
                <Highlight icon={<BellIcon />} title={followUps ? `${plural(followUps, 'application')} to follow up` : 'Follow-ups all clear'}>
                  {followUps
                    ? `Still "Applied" after ${FOLLOW_UP_AFTER_DAYS}+ days with no next step planned.`
                    : `Nothing has waited ${FOLLOW_UP_AFTER_DAYS}+ days without a reply or a plan.`}
                </Highlight>
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
