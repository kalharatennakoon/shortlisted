// How an application ended (migration 20261112000000_how_it_ended.sql): where it stopped, why, and who ended it.
// Pure: labels, the guess from the timeline, the card tag and the Stats numbers. Saving goes through
// updateApplication like every other field.

import { todayKey } from './dates'
import {
  ENDED_STAGES,
  type Application,
  type EndedBy,
  type EndedReason,
  type EndedStage,
  type StageDraft,
  type Status,
} from './types'

export const ENDED_NOTE_MAX = 1000

export const ENDED_STAGE_LABEL: Record<EndedStage, string> = {
  Application: 'CV / application',
  Screening: 'Screening call',
  Assessment: 'Test or assessment',
  Interview: 'Interview',
  'Final round': 'Final round',
  Offer: 'Offer stage',
}

export const ENDED_REASON_LABEL: Record<EndedReason, string> = {
  Experience: 'Not enough experience',
  Skills: 'Missing a required skill',
  Salary: "Salary didn't match",
  'Position filled': 'Position filled or cancelled',
  Location: 'Location or work mode',
  'Test or interview': "Didn't pass the test or interview",
  'No reason given': 'No reason given',
  'Another offer': 'Took another offer',
  'Took too long': 'Process took too long',
  Other: 'Other',
}

/** Shorter words for the tag on cards and rows, where space is tight */
const STAGE_SHORT: Record<EndedStage, string> = {
  Application: 'CV stage',
  Screening: 'Screening',
  Assessment: 'Test',
  Interview: 'Interview',
  'Final round': 'Final round',
  Offer: 'Offer',
}

const REASON_SHORT: Record<EndedReason, string> = {
  Experience: 'Experience',
  Skills: 'Missing skill',
  Salary: 'Salary',
  'Position filled': 'Position filled',
  Location: 'Location',
  'Test or interview': "Didn't pass",
  'No reason given': 'No reason given',
  'Another offer': 'Another offer',
  'Took too long': 'Too slow',
  Other: 'Other',
}

/** The reasons that make sense for each side: an employer's reasons when turned down, the person's own when they withdrew */
export const REASONS_FOR: Record<EndedBy, EndedReason[]> = {
  Employer: ['Experience', 'Skills', 'Salary', 'Position filled', 'Location', 'Test or interview', 'No reason given', 'Other'],
  Me: ['Salary', 'Location', 'Another offer', 'Took too long', 'Other'],
}

export interface Ending {
  ended_stage: EndedStage | null
  ended_reason: EndedReason | null
  ended_by: EndedBy | null
  ended_note: string | null
}

export const emptyEnding: Ending = { ended_stage: null, ended_reason: null, ended_by: null, ended_note: null }

/** The row has the columns, i.e. the migration has been applied (rows from before it don't carry the keys) */
export const canRecordEnding = (app: Partial<Application>) => 'ended_stage' in app

export function endingOf(app: Partial<Application>): Ending {
  return {
    ended_stage: app.ended_stage ?? null,
    ended_reason: app.ended_reason ?? null,
    ended_by: app.ended_by ?? null,
    ended_note: app.ended_note ?? null,
  }
}

export const hasEnding = (e: Partial<Ending>) => Boolean(e.ended_stage || e.ended_reason || e.ended_by || e.ended_note?.trim())

/** Who ended it, with "the employer" as the default: most rejections are */
export const endedBy = (e: Partial<Ending>): EndedBy => e.ended_by ?? 'Employer'

/** Switching sides drops a reason that doesn't belong to the new side */
export function withSide(e: Ending, by: EndedBy): Ending {
  return { ...e, ended_by: by, ended_reason: e.ended_reason && REASONS_FOR[by].includes(e.ended_reason) ? e.ended_reason : null }
}

/** What to send to the database: empty note as null */
export function cleanEnding(e: Ending): Ending {
  const note = e.ended_note?.trim()
  return { ...e, ended_note: note ? note.slice(0, ENDED_NOTE_MAX) : null }
}

/**
 * A first guess at where it stopped, so the person usually only has to confirm it: the stage they were "Not selected"
 * at in the timeline, else the last stage that has happened, else what the status was before it became Rejected.
 * The timeline's titles are the person's own words, so they are read loosely.
 */
export function guessStage(stages: Pick<StageDraft, 'title' | 'stage_date' | 'outcome'>[], before?: Status, today = todayKey()): EndedStage | null {
  const past = [...stages].filter((s) => s.stage_date <= today).sort((a, b) => a.stage_date.localeCompare(b.stage_date))
  const failed = past.filter((s) => s.outcome === 'Not selected')
  const stage = failed[failed.length - 1] ?? past[past.length - 1]
  if (stage) return stageFromTitle(stage.title)
  if (before === 'Applied' || before === 'No Response') return 'Application'
  if (before === 'Interviewed') return 'Interview'
  if (before === 'Offered' || before === 'Accepted') return 'Offer'
  return null
}

export function stageFromTitle(title: string): EndedStage {
  const t = title.toLowerCase()
  if (/\bfinal\b|\blast round\b/.test(t)) return 'Final round'
  if (/\boffer\b|negotiat/.test(t)) return 'Offer'
  if (/assess|\btest\b|exam|aptitude|assignment|\btask\b|case stud|take.?home|coding challenge|psychometric/.test(t)) return 'Assessment'
  if (/screen|phone|\bcall\b|recruiter|intro/.test(t)) return 'Screening'
  return 'Interview'
}

/** The short tag on a card or row: "Interview · Missing skill", "Withdrew · Another offer". Null when nothing is known. */
export function endingTag(app: Partial<Application>): string | null {
  if (app.status !== 'Rejected') return null
  const e = endingOf(app)
  const parts = [
    e.ended_by === 'Me' ? 'Withdrew' : null,
    e.ended_stage ? (e.ended_by === 'Me' ? null : STAGE_SHORT[e.ended_stage]) : null,
    e.ended_reason && e.ended_reason !== 'No reason given' && e.ended_reason !== 'Other' ? REASON_SHORT[e.ended_reason] : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** The tag's tooltip: everything that was recorded, in full */
export function endingTitle(app: Partial<Application>): string {
  const e = endingOf(app)
  return [
    `${e.ended_by === 'Me' ? 'You withdrew' : 'Turned down'}${e.ended_stage ? ` at: ${ENDED_STAGE_LABEL[e.ended_stage]}` : ''}`,
    e.ended_reason ? `Reason: ${ENDED_REASON_LABEL[e.ended_reason]}` : null,
    e.ended_note?.trim() || null,
  ]
    .filter(Boolean)
    .join('\n')
}

// ---------- Stats ----------

export interface Count<K> {
  key: K
  label: string
  count: number
}

export interface EndingStats {
  /** Status Rejected */
  ended: number
  /** Of those, turned down by the employer (anything not marked "I withdrew") */
  turnedDown: number
  /** Of those, the person withdrew */
  withdrew: number
  /** Turned down, by where it stopped (every step, in order, zeros included); rows without a step aren't in it */
  byStage: Count<EndedStage>[]
  /** Turned down, by reason, most first (zeros left out) */
  byReason: Count<EndedReason>[]
  /** Withdrew, by reason, most first */
  withdrewReasons: Count<EndedReason>[]
  /** Turned down with neither a step nor a reason recorded */
  noDetails: number
  /** The step most rejections happened at, when one clearly leads (no tie) and it happened at least twice */
  commonStage: Count<EndedStage> | null
  /** The most common reason other than "No reason given" / "Other", when one clearly leads and happened at least twice */
  commonReason: Count<EndedReason> | null
}

function countBy<K extends string>(apps: Application[], get: (a: Application) => K | null | undefined, label: (k: K) => string) {
  const m = new Map<K, number>()
  for (const a of apps) {
    const k = get(a)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([key, count]) => ({ key, label: label(key), count })).sort((a, b) => b.count - a.count)
}

/** The one with the highest count, if it is at least 2 and no other has as many */
function leader<K>(counts: Count<K>[]): Count<K> | null {
  const top = [...counts].sort((a, b) => b.count - a.count)
  return top[0] && top[0].count >= 2 && (!top[1] || top[1].count < top[0].count) ? top[0] : null
}

export function endingStats(apps: Application[]): EndingStats {
  const ended = apps.filter((a) => a.status === 'Rejected')
  const mine = ended.filter((a) => a.ended_by === 'Me')
  const theirs = ended.filter((a) => a.ended_by !== 'Me')
  const byStage = ENDED_STAGES.map((key) => ({
    key,
    label: ENDED_STAGE_LABEL[key],
    count: theirs.filter((a) => a.ended_stage === key).length,
  }))
  const byReason = countBy(theirs, (a) => a.ended_reason, (k) => ENDED_REASON_LABEL[k])
  const telling = byReason.filter((r) => r.key !== 'No reason given' && r.key !== 'Other')
  return {
    ended: ended.length,
    turnedDown: theirs.length,
    withdrew: mine.length,
    byStage,
    byReason,
    withdrewReasons: countBy(mine, (a) => a.ended_reason, (k) => ENDED_REASON_LABEL[k]),
    noDetails: theirs.filter((a) => !a.ended_stage && !a.ended_reason).length,
    commonStage: leader(byStage),
    commonReason: leader(telling),
  }
}
