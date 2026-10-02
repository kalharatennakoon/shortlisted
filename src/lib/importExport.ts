// CSV import/export for applications. Pure functions (no Supabase), so they're easy to test.
// Import accepts our own export, a Notion "Application Tracker" CSV export, or a hand-made spreadsheet:
// headers are matched loosely, enum values case-insensitively, and dates in the common formats.

import { parseCsv, toCsv } from './csv'
import { toKey } from './dates'
import {
  NEXT_STEPS,
  PLATFORMS,
  PRIORITIES,
  STATUSES,
  type Application,
  type ApplicationInput,
  type NextStep,
  type Platform,
  type Priority,
  type Status,
} from './types'

type Field = keyof ApplicationInput

// Column order of the export (and the template). Import reads these headers back.
const EXPORT_COLUMNS: [Field, string][] = [
  ['name', 'Role'],
  ['company', 'Company'],
  ['applied_on', 'Applied On'],
  ['platform', 'Platform'],
  ['priority', 'Priority'],
  ['status', 'Status'],
  ['next_step', 'Next Step'],
  ['next_date', 'Next Date'],
  ['job_url', 'Job URL'],
  ['posting_checked_on', 'Posting Checked On'],
  ['posting_closed', 'Posting Closed'],
  ['notes', 'Notes'],
]

// Normalised header (lowercase, letters/digits only) -> field
const HEADER_ALIASES: Record<string, Field> = {}
const alias = (field: Field, ...names: string[]) => names.forEach((n) => (HEADER_ALIASES[n] = field))
alias('name', 'role', 'name', 'title', 'jobtitle', 'position', 'job', 'jobrole')
alias('company', 'company', 'companyname', 'employer', 'organisation', 'organization')
alias('applied_on', 'appliedon', 'applied', 'dateapplied', 'applieddate', 'applicationdate', 'date')
alias('platform', 'platform', 'source', 'appliedvia', 'via', 'channel')
alias('priority', 'priority')
alias('status', 'status', 'stage')
alias('next_step', 'nextstep')
alias('next_date', 'nextdate', 'nextstepdate', 'duedate', 'followupdate')
alias('job_url', 'joburl', 'url', 'link', 'joblink', 'jobposting', 'posting')
alias('posting_checked_on', 'postingcheckedon', 'postingchecked', 'datechecked', 'checkedon', 'lastchecked')
alias('posting_closed', 'postingclosed', 'jobclosed', 'closed', 'expired')
alias('notes', 'notes', 'note', 'comments', 'comment', 'description')

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// ---------- Export ----------

export function applicationsToCsv(apps: Application[]): string {
  return toCsv([
    EXPORT_COLUMNS.map(([, header]) => header),
    ...apps.map((a) =>
      EXPORT_COLUMNS.map(([field]) => (field === 'posting_closed' ? (a.posting_closed ? 'Yes' : '') : ((a[field] as string | null) ?? ''))),
    ),
  ])
}

export function templateCsv(): string {
  return toCsv([
    EXPORT_COLUMNS.map(([, header]) => header),
    ['DevOps Engineer', 'Acme Ltd', '2026-09-20', 'LinkedIn', 'High', 'Applied', 'Follow up', '2026-10-04', 'https://example.com/jobs/123', '2026-09-27', '', 'Referred by a friend'],
  ])
}

// ---------- Import ----------

export interface ParsedRow {
  line: number // line in the file (header is line 1), for messages
  input: ApplicationInput
  warnings: string[]
  duplicate: boolean // already in the tracker, or earlier in the same file
}

export interface ImportPreview {
  rows: ParsedRow[] // valid rows (duplicates included, flagged)
  errors: { line: number; message: string }[] // rows that can't be imported
  columns: string[] // headers we recognised, for display
  ignored: string[] // headers we didn't
}

export const MAX_IMPORT_ROWS = 2000

export function parseImport(text: string, existing: Application[]): ImportPreview {
  const table = parseCsv(text)
  if (table.length === 0) throw new Error('The file is empty.')

  const headers = table[0].map((h) => h.trim())
  const map: (Field | null)[] = []
  const seenFields = new Set<Field>()
  for (const h of headers) {
    const field = HEADER_ALIASES[norm(h)] ?? null
    // first matching column wins (e.g. "Name" and "Role" both present)
    if (field && !seenFields.has(field)) {
      seenFields.add(field)
      map.push(field)
    } else {
      map.push(null)
    }
  }
  if (!seenFields.has('name')) {
    throw new Error('Couldn\'t find a "Role" (or "Name") column. Check the first row of the file has column headers.')
  }
  const body = table.slice(1)
  if (body.length === 0) throw new Error('The file has headers but no rows.')
  if (body.length > MAX_IMPORT_ROWS) {
    throw new Error(`That's ${body.length} rows; the limit is ${MAX_IMPORT_ROWS} per import. Split the file and import it in parts.`)
  }

  const seen = new Set(existing.map(dupKey))
  const rows: ParsedRow[] = []
  const errors: ImportPreview['errors'] = []

  body.forEach((cells, i) => {
    const line = i + 2
    const raw: Partial<Record<Field, string>> = {}
    map.forEach((field, col) => {
      if (field) raw[field] = unescapeCell(cells[col] ?? '').trim()
    })
    const result = toInput(raw)
    if ('error' in result) {
      errors.push({ line, message: result.error })
      return
    }
    const key = dupKey(result.input)
    const duplicate = seen.has(key)
    seen.add(key)
    rows.push({ line, input: result.input, warnings: result.warnings, duplicate })
  })

  return {
    rows,
    errors,
    columns: headers.filter((_, i) => map[i]),
    ignored: headers.filter((h, i) => !map[i] && h !== ''),
  }
}

// Same role + company + applied date = same application (case-insensitive).
function dupKey(a: Pick<ApplicationInput, 'name' | 'company' | 'applied_on'>) {
  return [a.name, a.company ?? '', a.applied_on ?? ''].map((s) => s.trim().toLowerCase()).join('\u0000')
}

// Our export prefixes formula-looking cells with ' (see csv.ts); undo that on the way back in.
const unescapeCell = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s)

function toInput(raw: Partial<Record<Field, string>>): { input: ApplicationInput; warnings: string[] } | { error: string } {
  const warnings: string[] = []
  // Notion wraps some titles in **bold** markers
  const name = (raw.name ?? '').replace(/^\*\*(.*)\*\*$/, '$1').trim()
  if (!name) return { error: 'Role is empty' }

  const applied = parseDate(raw.applied_on)
  if (applied.warning) warnings.push(`Applied date ${applied.warning}`)

  const platform = matchEnum<Platform>(raw.platform, PLATFORMS, PLATFORM_ALIASES)
  if (platform.unknown) warnings.push(`Platform "${platform.unknown}" saved as Other`)

  const priority = matchEnum<Priority>(raw.priority, PRIORITIES, PRIORITY_ALIASES)
  if (priority.unknown) warnings.push(`Priority "${priority.unknown}" not recognised, left blank`)

  const status = matchEnum<Status>(raw.status, STATUSES, STATUS_ALIASES)
  if (status.unknown) warnings.push(`Status "${status.unknown}" not recognised, set to Applied`)

  let nextStep = matchEnum<NextStep>(raw.next_step, NEXT_STEPS, NEXT_STEP_ALIASES)
  if (nextStep.unknown) nextStep = { value: 'Other' }
  const next = parseDate(raw.next_date)
  if (next.warning) warnings.push(`Next date ${next.warning}`)

  // The form requires next step and date together
  let next_step = nextStep.value ?? null
  const next_date = next.value
  if (next_step && !next_date) {
    warnings.push(`Next step "${next_step}" has no date, left out`)
    next_step = null
  }
  if (next_date && !next_step) next_step = 'Other'

  const url = raw.job_url?.trim() || null
  const checked = parseDate(raw.posting_checked_on)
  if (checked.warning) warnings.push(`Posting checked date ${checked.warning}`)
  const closed = /^(yes|y|true|1|closed|expired)$/i.test(raw.posting_closed ?? '')
  return {
    warnings,
    input: {
      name,
      company: raw.company || null,
      applied_on: applied.value,
      platform: platform.value ?? (platform.unknown ? 'Other' : null),
      priority: priority.value ?? null,
      status: status.value ?? 'Applied',
      job_url: url,
      notes: raw.notes || null,
      next_step,
      next_date: next_step ? next_date : null,
      // only sent when the file has them, so an import still works before the posting-check migration is applied
      ...(checked.value ? { posting_checked_on: checked.value } : {}),
      ...(closed ? { posting_closed: true } : {}),
    },
  }
}

const PLATFORM_ALIASES: Record<string, Platform> = {
  website: 'Company Website', companysite: 'Company Website', careerspage: 'Company Website', careers: 'Company Website',
  mail: 'Email', linkedineasyapply: 'LinkedIn', easyapply: 'LinkedIn',
}
const PRIORITY_ALIASES: Record<string, Priority> = { med: 'Medium', mid: 'Medium', normal: 'Medium' }
const STATUS_ALIASES: Record<string, Status> = {
  applying: 'Applied', submitted: 'Applied', pending: 'Applied', todo: 'Applied',
  interview: 'Interviewed', interviewing: 'Interviewed', inprogress: 'Interviewed',
  offer: 'Offered', accept: 'Accepted', hired: 'Accepted',
  reject: 'Rejected', declined: 'Rejected', notselected: 'Rejected',
  noreply: 'No Response', ghosted: 'No Response', none: 'No Response', noresponse: 'No Response',
}
const NEXT_STEP_ALIASES: Record<string, NextStep> = { followup: 'Follow up', test: 'Assessment', phonecall: 'Call' }

function matchEnum<T extends string>(
  value: string | undefined,
  options: readonly T[],
  aliases: Record<string, T>,
): { value?: T; unknown?: string } {
  const v = value?.trim()
  if (!v) return {}
  const n = norm(v)
  const hit = options.find((o) => norm(o) === n) ?? aliases[n]
  return hit ? { value: hit } : { unknown: v }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * Accepts 2026-09-20, 2026/09/20, 20/09/2026, 9/20/2026, "September 20, 2026" (Notion), "20 Sep 2026",
 * and a trailing time ("September 20, 2026 10:30 AM"). Ambiguous d/m vs m/d is read day-first.
 */
export function parseDate(input: string | undefined): { value: string | null; warning?: string } {
  const s = input?.trim()
  if (!s) return { value: null }
  let y: number, m: number, d: number
  let match: RegExpMatchArray | null

  if ((match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) {
    ;[y, m, d] = [+match[1], +match[2], +match[3]]
  } else if ((match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/))) {
    const a = +match[1], b = +match[2]
    y = +match[3] < 100 ? 2000 + +match[3] : +match[3]
    if (a > 12) [d, m] = [a, b]
    else if (b > 12) [m, d] = [a, b]
    else [d, m] = [a, b] // ambiguous: day-first (Sri Lanka / UK style)
  } else if ((match = s.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i))) {
    m = monthIndex(match[1])
    ;[d, y] = [+match[2], +match[3]]
  } else if ((match = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})/i))) {
    m = monthIndex(match[2])
    ;[d, y] = [+match[1], +match[3]]
  } else {
    return { value: null, warning: `"${s}" not understood, left blank` }
  }

  const date = new Date(y, m - 1, d)
  if (!m || date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return { value: null, warning: `"${s}" is not a valid date, left blank` }
  }
  return { value: toKey(date) }
}

function monthIndex(name: string) {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1
}
