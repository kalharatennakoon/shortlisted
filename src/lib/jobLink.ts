// Quick add: paste a job posting's link and the form fills in what the posting says.
//
// The browser can't read other sites, so the link goes to the `job-link` Edge Function (supabase/functions/job-link),
// which opens the posting's public page once and answers with a few short facts. Job sites often refuse automated
// visits (LinkedIn does, for most postings); the link is kept either way and the rest is typed by hand.
// Everything here except readJobLink is pure, so the rules for what gets filled in can be reasoned about on their own.

import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { todayKey } from './dates'
import { fmtDate } from './format'
import { postingUrl } from './posting'
import type { ApplicationInput, Platform } from './types'

export interface JobFacts {
  role: string | null
  company: string | null
  location: string | null
  /** Closing date, YYYY-MM-DD */
  closes: string | null
  /** "Full-time", "Internship"… */
  type: string | null
}

/** What the `job-link` function answers. Keep in step with supabase/functions/job-link/index.ts. */
export interface JobLinkAnswer {
  /** The link, tidied (tracking removed), to save with the application */
  url: string
  /** The site, for messages: "linkedin.com" */
  host: string
  kind: 'linkedin' | 'board' | 'employer' | 'unknown'
  /** page = read from the posting · link = guessed from the words in the link · none = nothing found */
  source: 'page' | 'link' | 'none'
  /** Why the page gave nothing. `unavailable` is added here, for when the function itself can't be reached. */
  problem: null | 'blocked' | 'gone' | 'unreachable' | 'unreadable' | 'unavailable'
  job: JobFacts
}

const NO_FACTS: JobFacts = { role: null, company: null, location: null, closes: null, type: null }

/** How long to wait for the function: it gives a site 9 seconds, plus the trip there and back */
const WAIT_MS = 20_000

/** The pasted or typed text as a link, or null. Same rule as the form's Link field: http(s) only. */
export function asLink(text: string): string | null {
  const trimmed = text.trim()
  return trimmed && !/\s/.test(trimmed) ? postingUrl({ job_url: trimmed }) : null
}

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, '')

/** What we can say about a link without the function: the link itself, and whether it is LinkedIn. */
export function unreadAnswer(url: string, problem: JobLinkAnswer['problem'] = 'unavailable'): JobLinkAnswer {
  const host = hostOf(url)
  const linkedIn = host === 'linkedin.com' || host.endsWith('.linkedin.com')
  return { url, host, kind: linkedIn ? 'linkedin' : 'unknown', source: 'none', problem, job: NO_FACTS }
}

/** A problem worth saying in its own words (a bad link, too many at once, signed out). */
export class JobLinkError extends Error {}

/**
 * Asks the function to read the posting. Throws JobLinkError for things the person can act on; when the function
 * can't be reached at all (offline, or not deployed yet) it answers with `problem: 'unavailable'` so the link is still kept.
 */
export async function readJobLink(url: string): Promise<JobLinkAnswer> {
  const { data, error } = await supabase.functions.invoke('job-link', { body: { url }, timeout: WAIT_MS })
  if (error) {
    if (error instanceof FunctionsHttpError && [400, 401, 429].includes(error.context.status)) {
      const payload = await error.context.json().catch(() => null)
      throw new JobLinkError(payload?.error ?? "That link couldn't be read.")
    }
    return unreadAnswer(url)
  }
  const a = data as Partial<JobLinkAnswer> | null
  if (!a || typeof a.url !== 'string' || !asLink(a.url) || !a.job) return unreadAnswer(url)
  const line = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null)
  return {
    url: a.url,
    host: line(a.host) ?? hostOf(a.url),
    kind: a.kind === 'linkedin' || a.kind === 'board' || a.kind === 'employer' ? a.kind : 'unknown',
    source: a.source === 'page' || a.source === 'link' ? a.source : 'none',
    problem: a.problem ?? null,
    job: {
      role: line(a.job.role),
      company: line(a.job.company),
      location: line(a.job.location),
      closes: /^\d{4}-\d{2}-\d{2}$/.test(a.job.closes ?? '') ? a.job.closes : null,
      type: line(a.job.type),
    },
  }
}

/** The application's Platform for a kind of site; null leaves the field for the person to choose. */
export const platformFor = (kind: JobLinkAnswer['kind']): Platform | null =>
  kind === 'linkedin' ? 'LinkedIn' : kind === 'employer' ? 'Company Website' : kind === 'board' ? 'Other' : null

/** "31 Oct 2026": spelled out, because a note is read long after it was written and on any device */
const longDate = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** The facts that have no field of their own, as lines for Notes. '' when there are none. */
export function notesFor(job: JobFacts): string {
  return [
    job.location && `Location: ${job.location}`,
    job.closes && `Closing date: ${longDate(job.closes)}`,
    job.type && `Type: ${job.type}`,
  ].filter(Boolean).join('\n')
}

/** The fields quick add can fill */
export type FilledField = 'name' | 'company' | 'platform' | 'job_url' | 'notes'
/** What quick add last put in each field, to tell its own values from ones the person typed */
export type LastFill = Partial<Record<FilledField, string | null>>

export interface Fill {
  form: ApplicationInput
  /** Fields that now hold something from this link */
  filled: FilledField[]
  last: LastFill
}

const blank = (v: string | null | undefined) => !v?.trim()

/**
 * Puts what the link gave into the form without overwriting anything the person typed.
 * A field is filled when it is empty or still holds what quick add put there last time, so pasting a second link
 * replaces the first one's details (and clears the ones the second link doesn't have) but never someone's own words.
 * The link itself always goes in: pasting it is asking for exactly that. Notes are added to, not replaced.
 */
export function fillForm(form: ApplicationInput, answer: JobLinkAnswer, last: LastFill = {}): Fill {
  const next = { ...form }
  const filled: FilledField[] = []
  const nextLast: LastFill = {}
  const facts: ['name' | 'company' | 'platform', string | null][] = [
    ['name', answer.job.role],
    ['company', answer.job.company],
    ['platform', platformFor(answer.kind)],
  ]
  const write = next as Record<string, unknown>
  for (const [field, value] of facts) {
    const current = form[field]
    const ours = blank(current) || (last[field] != null && current === last[field])
    if (!ours) continue
    if (value) {
      write[field] = value
      nextLast[field] = value
      filled.push(field)
    } else if (!blank(current)) {
      write[field] = field === 'platform' ? null : '' // left over from the previous link
    }
  }

  if (form.job_url !== answer.url) {
    next.job_url = answer.url
    // a different link is a different posting: an earlier "still open" check says nothing about it
    if (form.posting_checked_on || form.posting_closed) {
      next.posting_checked_on = null
      next.posting_closed = false
    }
  }
  nextLast.job_url = answer.url
  filled.push('job_url')

  const lines = notesFor(answer.job)
  const current = form.notes ?? ''
  const previous = last.notes ?? ''
  // Swap the previous link's lines for this one's if they are still there; otherwise add below what is written
  let notes: string | null = null
  if (previous && current.includes(previous)) notes = current.replace(previous, () => lines)
  else if (lines) notes = blank(current) ? lines : `${current.trimEnd()}\n\n${lines}`
  if (notes !== null) next.notes = notes.replace(/\n{3,}/g, '\n\n').trim()
  if (lines) {
    nextLast.notes = lines
    filled.push('notes')
  }

  return { form: next, filled, last: nextLast }
}

export interface FillNote {
  tone: 'ok' | 'warn'
  text: string
}

const listed = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/** One or two sentences on what happened, for under the link field. */
export function fillNote(answer: JobLinkAnswer, filled: FilledField[], today = todayKey()): FillNote {
  const { host, job } = answer
  const got = [filled.includes('name') && 'role', filled.includes('company') && 'company'].filter((v): v is string => Boolean(v))
  const extras = [job.location && 'location', job.closes && 'closing date', job.type && 'job type'].filter((v): v is string => Boolean(v))
  const inNotes = filled.includes('notes') && extras.length ? ` The ${listed(extras)} ${extras.length > 1 ? 'are' : 'is'} in Notes.` : ''
  const closed = job.closes && job.closes < today ? ` Its closing date (${fmtDate(job.closes)}) has passed.` : ''

  if (answer.source === 'page') {
    const what = got.length ? `Filled in the ${listed(got)} from ${host}.` : `Read the posting on ${host}. The role and company you typed are kept.`
    return { tone: closed ? 'warn' : 'ok', text: `${what}${inNotes}${closed} Check ${got.length > 1 || inNotes ? 'them' : 'it'} before you save.` }
  }

  const why =
    answer.problem === 'blocked' ? `${host} didn't let Shortlisted read this posting.`
    : answer.problem === 'gone' ? `That posting can't be found on ${host}. It may have been taken down.`
    : answer.problem === 'unreachable' ? `${host} didn't answer.`
    : answer.problem === 'unavailable' ? "Quick add can't be reached right now."
    : `Shortlisted couldn't find the job details on that page.`
  if (answer.source === 'link' && got.length) {
    const guess = `The ${listed(got)} below ${got.length > 1 ? 'are' : 'is'} a guess from the link itself`
    return { tone: 'warn', text: `${why} ${guess}: check ${got.length > 1 ? 'them' : 'it'} before you save.` }
  }
  return { tone: 'warn', text: `${why} The link is kept under Job posting. Add the role and company yourself.` }
}
