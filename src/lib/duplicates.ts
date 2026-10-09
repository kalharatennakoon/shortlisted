// "You've already added this posting": spots a new application that matches one already in the list.
// Pure functions. Two ways to match, strongest first:
//   link  the same job posting, however the link was copied (tracking removed, LinkedIn's several shapes)
//   job   the same role at the same company, for a job found again on another site
// A match is only ever a warning: applying again to the same employer months later is a normal thing to do.

import { postingUrl } from './posting'
import type { Application } from './types'

// Keep in step with TRACKING in supabase/functions/job-link/extract.ts
const TRACKING = /^(utm_\w+|fbclid|gclid|gclsrc|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src|_hsenc|_hsmi|mkt_tok)$/i

/**
 * One string that is the same for any two links to the same posting, or null if the text isn't a link.
 * Ignores http/https, "www.", a trailing slash, the order of parameters and tracking parameters. A LinkedIn job is
 * known by its number, so the search-page link, the "view" link and a country site's link all match each other.
 */
export function postingKey(raw: string | null | undefined): string | null {
  const href = postingUrl({ job_url: raw ?? null })
  if (!href) return null
  const u = new URL(href)
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '')

  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    const current = u.searchParams.get('currentJobId')
    const id = (current && /^\d{6,}$/.test(current) ? current : null)
      ?? u.pathname.match(/^\/(?:comm\/)?jobs\/view\/(?:[^/]*?-)?(\d{6,})\/?$/)?.[1]
    if (id) return `linkedin:${id}`
  }

  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key)
  u.searchParams.sort()
  const query = u.searchParams.toString()
  // The part after # is usually a place on the page; some sites keep the job itself there ("#/job/123")
  const route = /^#[/!]/.test(u.hash) ? u.hash : ''
  return `${host}${u.pathname.replace(/\/+$/, '')}${query ? `?${query}` : ''}${route}`
}

/** For comparing names: letters and digits only, lower case ("Lakeview Hospitals (Pvt) Ltd." = "lakeview hospitals pvt ltd") */
const nameKey = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export interface Duplicate {
  app: Application
  /** link = the same posting · job = the same role at the same company */
  why: 'link' | 'job'
}

type Draft = Pick<Application, 'name' | 'company' | 'job_url'>

/**
 * The application already in the list that `draft` repeats, or null. `selfId` leaves out the application being
 * edited. With several matches the first in the list wins, which is the most recently applied to.
 */
export function findDuplicate(draft: Draft, apps: Application[], selfId?: string): Duplicate | null {
  const others = selfId ? apps.filter((a) => a.id !== selfId) : apps
  const link = postingKey(draft.job_url)
  if (link) {
    const same = others.find((a) => postingKey(a.job_url) === link)
    if (same) return { app: same, why: 'link' }
  }
  const [role, company] = [nameKey(draft.name), nameKey(draft.company)]
  if (role && company) {
    const same = others.find((a) => nameKey(a.name) === role && nameKey(a.company) === company)
    if (same) return { app: same, why: 'job' }
  }
  return null
}

/** The application with this link, for checking a pasted link before anything is filled in. */
export const findByLink = (link: string, apps: Application[]): Application | null =>
  findDuplicate({ name: '', company: null, job_url: link }, apps)?.app ?? null
