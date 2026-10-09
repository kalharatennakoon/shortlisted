// Timeline: the stages of an application (table public.application_stages). The data calls are at the bottom;
// everything above them is pure.
//
// Nothing here deletes a stage as a side effect of saving something else. A stage is removed only by removeStage,
// for the one stage the person asked to remove; everything else is an upsert.
//
// How it sits next to "Next step": the next step is the one thing coming up, with reminders and a calendar button;
// the timeline is the record. A step marked done in "Up next" moves into the timeline (stageFromStep), and a stage
// dated ahead can be set as the next step from the form, so nothing has to be typed twice.

import { timeKey, todayKey } from './dates'
import { supabase } from './supabase'
import type { Application, NextStep, Stage, StageDraft, Status } from './types'

export const STAGE_TITLE_MAX = 80
export const STAGE_NOTES_MAX = 2000

/** Offered as one-tap titles. Plain words that fit any field of work; the title itself is free text. */
export const STAGE_SUGGESTIONS = ['Phone screen', 'First interview', 'Second interview', 'Panel interview', 'Assessment', 'Final interview']

/** upcoming = dated ahead, no result · waiting = it happened, no word yet · passed · rejected = not selected */
export type StageState = 'upcoming' | 'waiting' | 'passed' | 'rejected'

type Dated = Pick<Stage, 'stage_date' | 'stage_time' | 'outcome'>

export function stageState(stage: Dated, today = todayKey()): StageState {
  if (stage.outcome === 'Passed') return 'passed'
  if (stage.outcome === 'Not selected') return 'rejected'
  return stage.stage_date > today ? 'upcoming' : 'waiting'
}

export const STAGE_STATE_LABEL: Record<StageState, string> = {
  upcoming: 'Coming up',
  waiting: 'Waiting to hear',
  passed: 'Passed',
  rejected: 'Not selected',
}

/** Oldest first, the way a timeline reads; within a day, stages without a time first, then by time. */
export function sortStages<T extends Pick<Stage, 'stage_date' | 'stage_time'>>(stages: T[]): T[] {
  const key = (s: T) => `${s.stage_date}T${timeKey(s.stage_time) ?? ''}`
  return [...stages].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
}

/** A new, empty stage for the form. */
export const newStage = (today = todayKey()): StageDraft => ({
  id: crypto.randomUUID(),
  title: '',
  stage_date: today,
  stage_time: null,
  outcome: 'Waiting',
  notes: null,
})

export const toDraft = ({ id, title, stage_date, stage_time, outcome, notes }: Stage): StageDraft => ({
  id, title, stage_date, stage_time: timeKey(stage_time), outcome, notes,
})

/** What is wrong with a stage, in words for the form, or null. */
export function stageProblem(stage: StageDraft): string | null {
  if (!stage.title.trim()) return 'Give the stage a name, like "Phone screen".'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stage.stage_date)) return 'Choose the date of the stage.'
  return null
}

/** Steps that are a stage of the process once they have happened. A follow-up email isn't one. */
const STEP_TITLES: Partial<Record<NextStep, string>> = { Interview: 'Interview', Assessment: 'Assessment', Call: 'Call' }

/**
 * The stage a finished next step becomes, or null when it shouldn't become one: not that kind of step, or the
 * timeline already has a stage on that day (it was put there by hand, or set as the next step from the timeline).
 */
export function stageFromStep(app: Pick<Application, 'next_step' | 'next_date' | 'next_time'>, existing: Pick<Stage, 'stage_date'>[]): StageDraft | null {
  const title = app.next_step ? STEP_TITLES[app.next_step] : undefined
  if (!title || !app.next_date) return null
  if (existing.some((s) => s.stage_date === app.next_date)) return null
  return { id: crypto.randomUUID(), title, stage_date: app.next_date, stage_time: timeKey(app.next_time), outcome: 'Waiting', notes: null }
}

/** The next-step fields for a stage that is still ahead, for "Set as next step" in the form. */
export function stepFromStage(stage: StageDraft): Pick<Application, 'next_step' | 'next_date' | 'next_time'> {
  const title = stage.title.toLowerCase()
  const step: NextStep = /assess|test|task|exam|demo/.test(title) ? 'Assessment' : /\b(call|phone|screen)/.test(title) ? 'Call' : 'Interview'
  return { next_step: step, next_date: stage.stage_date, next_time: timeKey(stage.stage_time) }
}

/**
 * A status the timeline points to, when the application's own status has fallen behind it: null, or
 * Interviewed once a stage has happened on an application still marked Applied, or
 * Rejected when the latest stage ended "Not selected".
 */
export function suggestedStatus(status: Status, stages: Dated[], today = todayKey()): Status | null {
  const happened = sortStages(stages).filter((s) => s.stage_date <= today)
  if (!happened.length) return null
  const last = happened[happened.length - 1]
  if (last.outcome === 'Not selected' && (status === 'Applied' || status === 'Interviewed')) return 'Rejected'
  if (status === 'Applied' || status === 'No Response') return 'Interviewed'
  return null
}

/** "2026-10-03 14:30 Phone screen (Passed)", one per line: the timeline as text, for the CSV export. */
export function stagesAsText(stages: Stage[]): string {
  return sortStages(stages)
    .map((s) => {
      const time = timeKey(s.stage_time)
      return `${s.stage_date}${time ? ` ${time}` : ''} ${s.title} (${s.outcome === 'Waiting' ? 'no result yet' : s.outcome})`
    })
    .join('\n')
}

/** application id -> its stages, oldest first */
export function stagesByApplication(stages: Stage[]): Map<string, Stage[]> {
  const map = new Map<string, Stage[]>()
  for (const s of sortStages(stages)) map.set(s.application_id, [...(map.get(s.application_id) ?? []), s])
  return map
}

// ---------- data ----------

/** Every stage of every application the signed-in user has. */
export async function listStages(): Promise<Stage[]> {
  const { data, error } = await supabase.from('application_stages').select('*').order('stage_date', { ascending: true })
  if (error) throw error
  return data as Stage[]
}

const row = (applicationId: string, s: StageDraft) => ({
  id: s.id,
  application_id: applicationId,
  title: s.title.trim().slice(0, STAGE_TITLE_MAX),
  stage_date: s.stage_date,
  stage_time: timeKey(s.stage_time),
  outcome: s.outcome,
  notes: s.notes?.trim() ? s.notes.trim().slice(0, STAGE_NOTES_MAX) : null,
})

/**
 * Stores these stages for the application in one statement: new ones are added, ones that exist are updated.
 * A stage carries its id from the moment it is made in the browser, so running this again (a retry after a failure,
 * a second click) changes nothing. Returns them as stored.
 */
export async function saveStages(applicationId: string, stages: StageDraft[]): Promise<Stage[]> {
  if (!stages.length) return []
  const { data, error } = await supabase
    .from('application_stages')
    .upsert(stages.map((s) => row(applicationId, s)), { onConflict: 'id' })
    .select()
  if (error) throw error
  return data as Stage[]
}

/** Removes one stage. Only ever called for a stage the person chose to remove. */
export async function removeStage(applicationId: string, stageId: string): Promise<void> {
  const { error } = await supabase.from('application_stages').delete().eq('application_id', applicationId).eq('id', stageId)
  if (error) throw error
}
