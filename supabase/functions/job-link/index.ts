// Supabase Edge Function: quick add from a job link.
//
//   POST {url}   from the app (user's JWT): open the posting's public page once and say what job it is
//
// Answers 200 with { url, host, kind, source, problem, job }:
//   url      the link, tidied (tracking removed), to save with the application
//   host     the site, for messages ("linkedin.com")
//   kind     linkedin | board | employer | unknown   (the app turns this into the Platform)
//   source   page = read from the posting · link = guessed from the words in the link · none = nothing found
//   problem  null, or why the page gave nothing: blocked | gone | unreachable | unreadable
//   job      { role, company, location, closes, type }, each a short line of text or null
// A site that refuses us is a 200 with problem "blocked", not an error: the app still keeps the link.
//
// This fetches an address chosen by whoever is signed in, so (see README.md):
//   - only signed-in users, a few links a minute each
//   - only ordinary public websites over http(s), checked again at every redirect
//   - only a few short fields ever leave here, never the page itself
//   - one plain request that says who it is; no cookies, no retries, no getting round a site that says no
//
// Deployed with JWT verification off, the same way as `reminders`; the function checks the user's sign-in itself.

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  cleanLink, extractJob, guessFromLink, hasFacts, isPublicHost, isPublicIPv4, isPublicIPv6, pageProblem, pageTitle,
  siteKind, siteOf, type JobFacts, type SiteKind,
} from './extract.ts'

const env = (k: string) => {
  const v = Deno.env.get(k)
  if (!v) throw new Error(`Missing secret ${k}`)
  return v
}

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://kalharatennakoon.github.io/shortlisted/').replace(/\/?$/, '/')

/** Says plainly who is asking, the way link previews in chat apps do. Don't dress it up as a browser. */
const USER_AGENT = `Mozilla/5.0 (compatible; ShortlistedLinkPreview/1.0; +${APP_URL})`
const TIMEOUT_MS = 9_000
const MAX_BYTES = 1_500_000
const MAX_REDIRECTS = 5
/** Links per user per minute. Kept in memory, so it is per running copy of the function: a brake, not a meter. */
const PER_MINUTE = 12

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Problem = 'blocked' | 'gone' | 'unreachable' | 'unreadable'
interface Answer {
  url: string
  host: string
  kind: SiteKind
  source: 'page' | 'link' | 'none'
  problem: Problem | null
  job: JobFacts
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    const { data: auth, error: authError } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null }, error: null }
    if (authError || !auth?.user) return json({ error: 'Please sign in again.' }, 401)
    if (!allow(auth.user.id)) return json({ error: 'That was a lot of links at once. Wait a minute, then try again.' }, 429)

    const body = await req.json().catch(() => ({}))
    const link = typeof body?.url === 'string' ? cleanLink(body.url) : null
    if (!link || !usable(link)) return json({ error: "That doesn't look like a link to a job posting." }, 400)

    const answer = await readPosting(link)
    // The site and how it went, to see which sites work. Never the link itself or who asked.
    console.log(`job-link ${answer.host}: ${answer.source}${answer.problem ? ` (${answer.problem})` : ''}`)
    return json(answer)
  } catch (e) {
    console.error(e)
    return json({ error: 'Something went wrong. Please try again later.' }, 500)
  }
})

// ---------- rate limit ----------

const recent = new Map<string, number[]>()

function allow(userId: string): boolean {
  const now = Date.now()
  const times = (recent.get(userId) ?? []).filter((t) => now - t < 60_000)
  if (times.length >= PER_MINUTE) {
    recent.set(userId, times)
    return false
  }
  times.push(now)
  recent.set(userId, times)
  if (recent.size > 5_000) for (const [id, ts] of recent) if (ts.every((t) => now - t >= 60_000)) recent.delete(id)
  return true
}

// ---------- reading the page ----------

async function readPosting(link: URL): Promise<Answer> {
  /** The page gave nothing: fall back to what the link itself says, if it says anything */
  const without = (problem: Problem): Answer => {
    const job = guessFromLink(link)
    return { url: link.href, host: siteOf(link.hostname), kind: siteKind(link, job.company), source: hasFacts(job) ? 'link' : 'none', problem, job }
  }

  let page: Page
  try {
    page = await fetchPage(link)
  } catch (e) {
    if (!(e instanceof Refused)) console.error(`job-link ${siteOf(link.hostname)}: ${e instanceof Error ? e.name : 'error'}`)
    return without(e instanceof Refused ? 'blocked' : 'unreachable')
  }

  const problem = pageProblem(page.status, page.url, pageTitle(page.html))
  if (problem) return without(problem === 'down' ? 'unreachable' : problem)
  if (!page.html) return without('unreadable') // a PDF, an image, an empty answer

  const job = extractJob(page.html, page.url)
  if (!hasFacts(job)) return without('unreadable')
  return { url: link.href, host: siteOf(link.hostname), kind: siteKind(link, job.company), source: 'page', problem: null, job }
}

interface Page {
  status: number
  /** Where the page was finally served from, after redirects */
  url: URL
  /** Empty when the answer wasn't a web page */
  html: string
}

/** Thrown when a link, or somewhere it redirects to, isn't an ordinary public website. */
class Refused extends Error {
  override name = 'Refused'
}

/** http(s), a public host, the standard port, no sign-in details in the address */
const usable = (u: URL) =>
  (u.protocol === 'http:' || u.protocol === 'https:') && !u.port && !u.username && !u.password && isPublicHost(u.hostname)

/**
 * The name must not lead to a private address either (a public name can point anywhere). Where the platform doesn't
 * allow lookups, the checks on the name itself still stand.
 */
async function resolvesPublicly(host: string): Promise<boolean> {
  if (/^[\d.]+$/.test(host)) return true // an address, already checked by isPublicHost
  if (typeof Deno.resolveDns !== 'function') return true
  const [a, aaaa] = await Promise.allSettled([Deno.resolveDns(host, 'A'), Deno.resolveDns(host, 'AAAA')])
  const v4 = a.status === 'fulfilled' ? a.value : []
  const v6 = aaaa.status === 'fulfilled' ? aaaa.value : []
  return v4.every(isPublicIPv4) && v6.every(isPublicIPv6)
}

async function fetchPage(start: URL): Promise<Page> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let url = start
    // Redirects are followed by hand so that every stop on the way gets the same checks as the first
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!usable(url) || !(await resolvesPublicly(url.hostname))) throw new Refused()
      const res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'en' },
      })
      const next = [301, 302, 303, 307, 308].includes(res.status) ? res.headers.get('location') : null
      if (next) {
        await res.body?.cancel().catch(() => {})
        url = new URL(next, url)
        continue
      }
      const type = res.headers.get('content-type') ?? ''
      const isPage = !type || /html|xml|text\/plain/i.test(type)
      if (!isPage) await res.body?.cancel().catch(() => {})
      return { status: res.status, url, html: isPage ? await readText(res, type) : '' }
    }
    throw new Refused() // going round in circles
  } finally {
    clearTimeout(timer)
  }
}

/** The start of the page as text: job details are in the first part, and nobody needs 20 MB of anything. */
async function readText(res: Response, contentType: string): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const bytes = new Uint8Array(MAX_BYTES)
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    const piece = value.subarray(0, MAX_BYTES - size)
    bytes.set(piece, size)
    size += piece.length
  }
  await reader.cancel().catch(() => {})
  const data = bytes.subarray(0, size)
  // The header's word on the encoding, then the page's own <meta charset>, then UTF-8
  const declared = contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
    ?? new TextDecoder('latin1').decode(data.subarray(0, 2048)).match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1]
  try {
    return new TextDecoder(declared ?? 'utf-8').decode(data)
  } catch {
    return new TextDecoder().decode(data)
  }
}
