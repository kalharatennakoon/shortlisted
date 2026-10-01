import { useMemo, useState } from 'react'
import { fmtDate } from '../lib/format'
import { PRIORITIES, STATUSES, type Application } from '../lib/types'
import { CompanyAvatar, NextBadge, StatusPill } from './Badges'
import { DocBadge } from './DocBadge'
import { ChevronIcon, FlagIcon } from './Icons'

type SortKey = 'name' | 'company' | 'applied_on' | 'platform' | 'priority' | 'next_date' | 'status'
type Sort = { key: SortKey; dir: 'asc' | 'desc' } | null

// Value to compare by; null = empty, always sorted last whatever the direction
function sortValue(a: Application, key: SortKey): string | number | null {
  switch (key) {
    case 'name': return a.name.toLowerCase()
    case 'company': return a.company?.trim().toLowerCase() || null
    case 'platform': return a.platform
    case 'applied_on': return a.applied_on
    case 'next_date': return a.next_step ? a.next_date : null
    case 'priority': return a.priority ? PRIORITIES.indexOf(a.priority) : null
    case 'status': return STATUSES.indexOf(a.status)
  }
}

// First click direction per column: newest dates and highest priority first feel natural
const FIRST_DIR: Record<SortKey, 'asc' | 'desc'> = {
  name: 'asc', company: 'asc', platform: 'asc', status: 'asc', next_date: 'asc', applied_on: 'desc', priority: 'desc',
}

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Role' },
  { key: 'company', label: 'Company', className: 'hide-md' },
  { key: 'applied_on', label: 'Applied' },
  { key: 'platform', label: 'Platform', className: 'hide-md' },
  { key: 'priority', label: 'Priority', className: 'hide-md' },
  { key: 'next_date', label: 'Next step', className: 'hide-md' },
  { key: 'status', label: 'Status' },
]

/** Applications table: click a header to sort (asc → desc → original order). Rows open the edit form. */
export default function AppTable({ apps, total, onOpen }: { apps: Application[]; total: number; onOpen: (app: Application) => void }) {
  const [sort, setSort] = useState<Sort>(null)

  const rows = useMemo(() => {
    if (!sort) return apps
    const m = sort.dir === 'asc' ? 1 : -1
    return [...apps].sort((x, y) => {
      const a = sortValue(x, sort.key)
      const b = sortValue(y, sort.key)
      if (a === b) return 0
      if (a === null) return 1
      if (b === null) return -1
      return (a < b ? -1 : 1) * m
    })
  }, [apps, sort])

  const toggle = (key: SortKey) =>
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: FIRST_DIR[key] }
      if (s.dir === FIRST_DIR[key]) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      return null
    })

  return (
    <div className="table-card">
      <table className="apps-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  className={c.className}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button className={`th-sort${active ? ' active' : ''}`} onClick={() => toggle(c.key)}>
                    {c.label}
                    <ChevronIcon size={12} className={`th-arrow${active && sort.dir === 'asc' ? ' up' : ''}`} />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr
              key={a.id}
              tabIndex={0}
              onClick={() => onOpen(a)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpen(a)
              }}
            >
              <td>
                <span className="role-cell">
                  <CompanyAvatar name={a.company} size="sm" />
                  <span className="role-text">
                    <span className="cell-title">
                      {a.name} <DocBadge appId={a.id} />
                    </span>
                    {a.company && <span className="cell-sub show-md">{a.company}</span>}
                  </span>
                </span>
              </td>
              <td className="hide-md">{a.company || <span className="muted">—</span>}</td>
              <td className="nowrap tabular">{fmtDate(a.applied_on)}</td>
              <td className="hide-md">{a.platform ? <span className="tag">{a.platform}</span> : <span className="muted">—</span>}</td>
              <td className="hide-md">
                {a.priority ? (
                  <span className={`priority priority-chip priority-${a.priority.toLowerCase()}`}>
                    <FlagIcon size={11} />
                    {a.priority}
                  </span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="hide-md"><NextBadge app={a} /></td>
              <td><StatusPill status={a.status} /></td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="empty-row">
              <td colSpan={COLUMNS.length} className="muted">
                {total ? 'No applications match your search.' : 'No applications yet.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rows.length > 0 && (
        <div className="table-foot muted small">
          {rows.length === total ? `${total} application${total === 1 ? '' : 's'}` : `${rows.length} of ${total} applications`}
          {sort && (
            <button className="link small" onClick={() => setSort(null)}>Clear sort</button>
          )}
        </div>
      )}
    </div>
  )
}
