// Pure logic for the `job-link` function: tidy a pasted link, and work out what a posting's page says about the job.
// No imports, so it runs under Node as well as Deno (tests: extract.test.ts, see README.md).
//
// Where the facts come from, best first:
//   1. schema.org JobPosting data (JSON-LD), which most job sites publish for Google's job search
//   2. the page's own title (Open Graph title, <title>, first <h1>), read with a few common patterns
//   3. the words in the link itself, when the site wouldn't show the page (a guess, and reported as one)

export interface JobFacts {
  role: string | null
  company: string | null
  location: string | null
  /** Closing date as YYYY-MM-DD */
  closes: string | null
  /** "Full-time", "Internship"… */
  type: string | null
}

export const NO_FACTS: JobFacts = { role: null, company: null, location: null, closes: null, type: null }

/** Why a page can't be used: the site refused us, the posting is gone, or the site is having trouble. */
export type PageProblem = 'blocked' | 'gone' | 'down' | null

const MAX_FIELD = 160

// ---------- the link ----------

const TRACKING = /^(utm_\w+|fbclid|gclid|gclsrc|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src|_hsenc|_hsmi|mkt_tok)$/i

const isLinkedIn = (host: string) => host === 'linkedin.com' || host.endsWith('.linkedin.com')

/**
 * The pasted text as a link to fetch and save, or null if it isn't a web link.
 * - "www.example.com/jobs/1" (no scheme) is treated as https
 * - tracking parameters are dropped; the rest of the query is kept, because some sites identify the job with it
 * - LinkedIn: a search or "recommended" page with a job open on it (`?currentJobId=…`) becomes that job's own page,
 *   which is the one a signed-out visitor can open
 */
export function cleanLink(raw: string): URL | null {
  const text = raw.trim()
  if (!text || text.length > 2000 || /\s/.test(text)) return null
  let u: URL
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.username || u.password) return null
  const host = u.hostname.toLowerCase()

  if (isLinkedIn(host)) {
    const current = u.searchParams.get('currentJobId')
    const viewed = u.pathname.match(/^\/(?:comm\/)?jobs\/view\/(?:[^/]*?-)?(\d{6,})\/?$/)
    if (current && /^\d{6,}$/.test(current) && !viewed) return new URL(`https://www.linkedin.com/jobs/view/${current}`)
    if (viewed) {
      // Everything after the ? on a job page is tracking
      u.search = ''
      u.hash = ''
      u.pathname = u.pathname.replace(/^\/comm\//, '/')
      return u
    }
  }

  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key)
  return u
}

/**
 * False for anything that isn't an ordinary public website: this function fetches whatever link it is given, so it
 * must never be pointed at a private network or the machine it runs on.
 */
export function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host.includes('.') || host.includes(':') || host.startsWith('[')) return false // single label, or IPv6
  if (/\.(local|localhost|internal|intranet|lan|home|corp|test|invalid|arpa|onion)$/.test(host)) return false
  if (/^[\d.]+$/.test(host)) return isPublicIPv4(host)
  // ordinary names only, ending in a top-level domain that starts with a letter
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(host)
}

export function isPublicIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = p
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false // carrier-grade NAT
  if (a === 169 && b === 254) return false // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 168 || b === 0)) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  return true
}

/** IPv6 answers are only trusted when they are plainly global (2000::/3) and not an IPv4 address in disguise. */
export function isPublicIPv6(ip: string): boolean {
  const s = ip.toLowerCase()
  if (s.includes('.')) return false // ::ffff:10.0.0.1 and friends
  return /^[23][0-9a-f]{3}:/.test(s) && !s.startsWith('2001:db8') && !s.startsWith('2002:')
}

/** "linkedin.com" from "www.linkedin.com" */
export const siteOf = (host: string) => host.toLowerCase().replace(/^(www|m|mobile)\./, '')

// ---------- text ----------

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', middot: '·',
  bull: '•', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®',
  trade: '™', eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', uuml: 'ü', ouml: 'ö', auml: 'ä', ntilde: 'ñ',
  ccedil: 'ç', iacute: 'í', oacute: 'ó', uacute: 'ú',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,10});/gi, (whole, body: string) => {
    if (body[0] !== '#') return ENTITIES[body] ?? ENTITIES[body.toLowerCase()] ?? whole
    const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ''
  })
}

// Characters that can't be seen, matched on purpose: control codes, zero-width marks, odd line breaks
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f]+/g
// oxlint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g

/** Markup or a data value as one clean line of text, or null if nothing is left. */
export function tidy(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = decodeEntities(decodeEntities(String(value).replace(/<[^>]*>/g, ' '))) // some sites escape twice
    .replace(INVISIBLE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  return text.length > MAX_FIELD ? `${text.slice(0, MAX_FIELD - 1).trimEnd()}…` : text
}

/** For comparing two names: letters and digits only, lower case */
const key = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

// ---------- the page ----------

/** Attributes of one tag, lower-cased names. Good enough for <meta>; not a full HTML parser. */
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([a-z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi
  for (let m = re.exec(tag); m; m = re.exec(tag)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
  return out
}

/** <meta property|name=…> values, first one wins, keys lower-cased */
export function metaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /<meta\b[^>]*>/gi
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const a = attrs(m[0])
    const name = (a.property || a.name || a.itemprop || '').toLowerCase()
    if (name && a.content && !(name in out)) out[name] = a.content
  }
  return out
}

const firstTag = (html: string, tag: string) =>
  tidy(html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1] ?? null)

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v])
const typeIs = (node: Json, name: string) =>
  list(node['@type']).some((t) => typeof t === 'string' && t.replace(/^https?:\/\/schema\.org\//i, '') === name)

/** Every schema.org JobPosting object on the page (inside arrays and @graph too). */
export function jobPostings(html: string): Json[] {
  const found: Json[] = []
  const walk = (node: unknown, depth: number) => {
    if (depth > 6) return
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1))
    if (!isObject(node)) return
    if (typeIs(node, 'JobPosting')) found.push(node)
    else for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) walk(node[k], depth + 1)
  }
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const body = m[1].replace(/^\s*<!--|-->\s*$/g, '').replace(/^\s*\/\/<!\[CDATA\[|\/\/\]\]>\s*$/g, '').trim()
    for (const text of [body, body.replace(CONTROL, ' ')]) {
      try {
        walk(JSON.parse(text), 0)
        break
      } catch {
        // not JSON as written: sites often leave raw line breaks inside strings, so try once more without them
      }
    }
  }
  return found
}

const EMPLOYMENT: Record<string, string> = {
  FULL_TIME: 'Full-time', FULLTIME: 'Full-time', PART_TIME: 'Part-time', PARTTIME: 'Part-time',
  CONTRACTOR: 'Contract', CONTRACT: 'Contract', TEMPORARY: 'Temporary', INTERN: 'Internship',
  INTERNSHIP: 'Internship', VOLUNTEER: 'Volunteer', PER_DIEM: 'Per diem', FREELANCE: 'Freelance',
}

function employmentType(value: unknown): string | null {
  const names = list(value)
    .flatMap((v) => (typeof v === 'string' ? v.split(/[,/]/) : []))
    .map((v) => EMPLOYMENT[v.trim().toUpperCase().replace(/[\s-]+/g, '_')])
    .filter((v): v is string => Boolean(v))
  return [...new Set(names)].slice(0, 2).join(' / ') || null
}

function countryName(value: unknown): string | null {
  const raw = tidy(isObject(value) ? value.name : value)
  if (!raw) return null
  if (!/^[A-Z]{2}$/.test(raw)) return raw
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(raw) ?? raw
  } catch {
    return raw
  }
}

function placeName(place: unknown): string | null {
  if (typeof place === 'string') return tidy(place)
  if (!isObject(place)) return null
  const address = place.address ?? place
  if (typeof address === 'string') return tidy(address)
  if (!isObject(address)) return tidy(place.name)
  const parts = [tidy(address.addressLocality), tidy(address.addressRegion), countryName(address.addressCountry)]
    .filter((p): p is string => Boolean(p))
  // "Colombo, Colombo, Sri Lanka" and "Western Province, Western Province" say nothing twice
  const unique = parts.filter((p, i) => parts.findIndex((q) => key(q) === key(p)) === i)
  return unique.join(', ') || tidy(place.name)
}

function location(job: Json): string | null {
  const places = list(job.jobLocation).map(placeName).filter((p): p is string => Boolean(p))
  const unique = places.filter((p, i) => places.findIndex((q) => key(q) === key(p)) === i)
  const where = unique.length > 1 ? `${unique[0]} (+${unique.length - 1} more)` : (unique[0] ?? null)
  const remote = list(job.jobLocationType).some((t) => typeof t === 'string' && /telecommute|remote/i.test(t))
  if (!remote) return where
  const allowed = list(job.applicantLocationRequirements).map((r) => tidy(isObject(r) ? r.name : r)).find(Boolean)
  return where ? `Remote (${where})` : allowed ? `Remote (${allowed})` : 'Remote'
}

/** YYYY-MM-DD from an ISO date-time (the date as written, no time-zone shifting) or anything Date can read. */
export function dateKey(value: unknown): string | null {
  const text = tidy(value)
  if (!text) return null
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/)
  let y: number, m: number, d: number
  if (iso) {
    ;[y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  } else {
    const t = Date.parse(text)
    if (Number.isNaN(t)) return null
    const date = new Date(t)
    // With a time zone in the text, read the date in UTC; without one it was read as local time, so read it back the same way
    const zoned = /(?:gmt|utc|z|[+-]\d{2}:?\d{2})$/i.test(text)
    ;[y, m, d] = zoned
      ? [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
      : [date.getFullYear(), date.getMonth() + 1, date.getDate()]
  }
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function fromPosting(job: Json): JobFacts {
  const org = job.hiringOrganization
  return {
    role: tidy(job.title) ?? tidy(job.name),
    company: tidy(isObject(org) ? org.name : org),
    location: location(job),
    closes: dateKey(job.validThrough),
    type: employmentType(job.employmentType),
  }
}

// ---------- titles ----------

/** Sites that list other employers' jobs: their own name is never the company. */
const JOB_BOARDS = [
  'linkedin.com', 'indeed.com', 'glassdoor.com', 'glassdoor.co.uk', 'topjobs.lk', 'xpress.jobs', 'ikman.lk',
  'rooster.jobs', 'itpro.lk', 'careerfirst.lk', 'observerjobs.lk', 'jobhub.lk', 'careerjet.com', 'jooble.org',
  'monster.com', 'naukri.com', 'seek.com.au', 'reed.co.uk', 'totaljobs.com', 'ziprecruiter.com', 'simplyhired.com',
  'wellfound.com', 'dice.com', 'bayt.com', 'jobstreet.com', 'foundit.in', 'remoteok.com', 'weworkremotely.com',
  'welcometothejungle.com', 'ycombinator.com', 'builtin.com', 'devex.com', 'reliefweb.int', 'unjobs.org',
  'impactpool.org', 'adzuna.com', 'talent.com', 'gulftalent.com', 'naukrigulf.com',
]
export const isJobBoard = (host: string) => {
  const site = siteOf(host)
  return JOB_BOARDS.some((b) => site === b || site.endsWith(`.${b}`))
}

/** Hiring systems that put the employer's short name in the address: [host pattern, where the name is]. */
const ATS: [RegExp, 'path' | 'subdomain'][] = [
  [/^(job-)?boards(\.eu)?\.greenhouse\.io$/, 'path'],
  [/^jobs(\.eu)?\.lever\.co$/, 'path'],
  [/^apply\.workable\.com$/, 'path'],
  [/^jobs\.ashbyhq\.com$/, 'path'],
  [/^jobs\.smartrecruiters\.com$/, 'path'],
  [/^ats\.rippling\.com$/, 'path'],
  [/^[^.]+\.wd\d+\.myworkdayjobs\.com$/, 'subdomain'],
  [/^[^.]+\.(bamboohr\.com|breezy\.hr|recruitee\.com|teamtailor\.com|zohorecruit\.com|freshteam\.com|applytojob\.com|pinpointhq\.com|keka\.com|jobs\.personio\.(com|de)|darwinbox\.in|workable\.com)$/, 'subdomain'],
]
const atsKind = (host: string) => ATS.find(([re]) => re.test(host.toLowerCase()))?.[1] ?? null

/** Where the title is "Company - Role" instead of the usual "Role - Company" */
const COMPANY_FIRST = /(^|\.)lever\.co$/

const ACRONYMS: Record<string, string> = {
  qa: 'QA', ui: 'UI', ux: 'UX', it: 'IT', hr: 'HR', noc: 'NOC', sre: 'SRE', devops: 'DevOps', ai: 'AI', ml: 'ML',
  api: 'API', ios: 'iOS', php: 'PHP', sql: 'SQL', erp: 'ERP', crm: 'CRM', seo: 'SEO', vp: 'VP', ceo: 'CEO',
  cto: 'CTO', cfo: 'CFO', bi: 'BI', aws: 'AWS', sap: 'SAP', pr: 'PR', rn: 'RN', ict: 'ICT', ii: 'II', iii: 'III',
}
const SMALL = new Set(['and', 'of', 'for', 'the', 'in', 'to', 'at', 'a', 'an', 'on', 'with'])

/** "senior-noc-engineer" → "Senior NOC Engineer". Used only for names taken from a link. */
export function fromSlug(slug: string): string | null {
  let text = slug
  try {
    text = decodeURIComponent(slug)
  } catch {
    // keep it as it is
  }
  const words = text.split(/[^\p{L}\p{N}&.']+/u).filter(Boolean)
  if (!words.length || words.length > 12) return null
  return tidy(
    words
      .map((w, i) => {
        const lower = w.toLowerCase()
        if (ACRONYMS[lower]) return ACRONYMS[lower]
        if (i > 0 && SMALL.has(lower)) return lower
        return lower.charAt(0).toUpperCase() + lower.slice(1)
      })
      .join(' '),
  )
}

function atsCompany(url: URL): string | null {
  const host = url.hostname.toLowerCase()
  const kind = atsKind(host)
  if (!kind) return null
  const slug = kind === 'path' ? url.pathname.split('/').filter(Boolean)[0] : host.split('.')[0]
  if (!slug || /^(jobs?|careers?|embed|www|apply|j|o|p)$/i.test(slug) || /^\d+$/.test(slug)) return null
  return fromSlug(slug)
}

/** Parts of a title that say nothing about the job */
const NOISE = /^(careers?|jobs?|job (details?|description|opening|vacancy|board|post(ing)?|ad(vert(isement)?)?|search|application|listings?)|(vacancy|position|role|career|opening|opportunity) (details?|description|information|info|overview|summary|page)|vacanc(y|ies)|opportunit(y|ies)|apply( now| online| today)?|(current |open )?(openings?|positions?|roles?)|join (us|our team)|work (with|for) us|we(['’]| a)re hiring|hiring|home|recruitment|employment)$/i

/** A "role" that is really a job site describing itself ("Jobs in Sri Lanka", "Sri Lanka Job Network") */
const NOT_A_ROLE = /\b(jobs?|vacanc(y|ies)|careers?) (in|at|network|search|portal|site|board|bank)\b|\bjob (network|vacancies|search|portal|bank)\b|\bfind (a |your )?(next )?jobs?\b|\b(latest|all|search|browse|top) (jobs|vacancies)\b|\d+\+? (jobs|vacancies)\b/i

const stripCareers = (s: string) => s.replace(/\s+(careers?( site| page| portal)?|jobs( board)?|job openings)$/i, '').trim()

/** Two names for the same thing: "ITPro.lk" and "itpro", "Acme" and "Acme Ltd" */
const sameName = (a: string | null | undefined, b: string | null | undefined) => {
  const [x, y] = [key(a), key(b)]
  return Boolean(x) && Boolean(y) && (x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))))
}

/** Looks like a place ("Colombo, Sri Lanka", "Remote") rather than a company or a role */
const PLACE = /,|\b(remote|hybrid|on-?site|sri lanka|colombo|kandy|galle|india|singapore|dubai|uae|london|usa|united (states|kingdom)|australia|canada|germany|europe|asia)\b/i
const isPlace = (s: string) => !/,\s*(inc|ltd|llc|plc|pvt|gmbh|co|corp|limited|pte)\b/i.test(s) && PLACE.test(s)

interface TitleContext {
  /** og:site_name */
  siteName: string | null
  /** The page's first <h1>, usually the role on a job page */
  heading: string | null
  url: URL
}

/**
 * Role, company and location from a page title. Handles:
 *   "Acme hiring Nurse in Kandy, Sri Lanka | LinkedIn"        (LinkedIn)
 *   "Senior Engineer at Acme - Colombo, Sri Lanka | ITPro.lk"  (role at company)
 *   "Job Application for Nurse at Acme"                        (Greenhouse)
 *   "Acme - Nurse"                                             (Lever: company first)
 *   "Nurse | Acme Careers", "Nurse - Acme"                     (most company sites)
 */
export function fromTitle(raw: string | null, ctx: TitleContext): JobFacts {
  const facts: JobFacts = { ...NO_FACTS }
  const title = tidy(raw)
  if (!title) return facts
  const host = ctx.url.hostname.toLowerCase()
  // On a job board or a hiring system, the site's own name is never the employer; on a company's site it is
  const listing = isJobBoard(host) || Boolean(atsKind(host))
  const labels = host.split('.').filter((l) => l.length >= 3).map(key)
  const isBrand = (s: string) => sameName(s, ctx.siteName) || labels.includes(key(s)) || key(s) === key(siteOf(host))

  const found: { employer: string | null } = { employer: null }
  /** Drops the parts that say nothing about the job, noting the employer when one of them names it */
  const keep = (pieces: string[]) => {
    const out: string[] = []
    for (const piece of pieces.map((p) => p.trim()).filter(Boolean)) {
      if (NOISE.test(piece)) continue
      const bare = stripCareers(piece)
      const names = bare && !/\b(of|for|and|in|to|&)$/i.test(bare) && key(piece) !== key(ctx.heading)
      if (isBrand(piece) || (bare && isBrand(bare))) {
        if (!listing) found.employer ??= bare || piece
        continue
      }
      if (bare !== piece && names && !listing) {
        found.employer ??= bare
        continue
      }
      out.push(piece)
    }
    return out
  }

  // Strong separators first, so "Acme hiring Engineer - Sri Lanka in Colombo | LinkedIn" keeps its hyphen
  const strong = keep(title.split(/\s*[|·•»]\s*|\s+::\s+/))
  if (!strong.length) {
    facts.company = tidy(found.employer)
    return facts
  }

  for (const part of strong) {
    const hiring = part.match(/^(.+?) (?:is |are )?(?:hiring|looking for|recruiting|seeking) (?:an? |for (?:an? )?)?(.+?)(?: in (.+))?$/i)
    if (hiring) {
      facts.company = tidy(hiring[1])
      facts.role = tidy(hiring[2])
      facts.location = tidy(hiring[3] ?? null)
      return facts
    }
  }

  const head = strong[0]
    .replace(/^job (application|opening|vacancy|posting|offer) (for|:)\s*/i, '')
    .replace(/^(apply (now )?for|vacancy:?|hiring:?|we are hiring:?)\s+/i, '')

  // "Nurse at Acme" / "Nurse @ Acme": the last one, so "Chef at Large at Acme" still splits at the employer
  const at = Math.max(head.lastIndexOf(' at '), head.lastIndexOf(' @ '))
  if (at > 0) {
    facts.role = tidy(head.slice(0, at))
    const after = keep(head.slice(at + 3).trim().split(/\s+[-–—:]\s+/))
    let company = after[0] ?? ''
    // "…at Acme in Colombo"
    const inPlace = company.match(/^(.+?) in ([A-Z].+)$/)
    if (inPlace && isPlace(inPlace[2])) {
      company = inPlace[1]
      facts.location = tidy(inPlace[2])
    }
    facts.company = tidy(company) ?? tidy(found.employer)
    facts.location ??= tidy([...after.slice(1), ...strong.slice(1)].find(isPlace) ?? null)
    return facts
  }

  const weak = keep([head, ...strong.slice(1)].flatMap((p) => p.split(/\s+[-–—:]\s+/)))
  let others: string[]
  if (ctx.heading && key(title).includes(key(ctx.heading)) && key(ctx.heading).length >= 3) {
    // The heading on a job page is the role, which settles which way round the title is and keeps a role with
    // a hyphen in it ("Engineer - Backend") in one piece
    facts.role = ctx.heading
    others = weak.filter((p) => !key(ctx.heading).includes(key(p)))
  } else {
    if (weak.length > 1 && !found.employer && COMPANY_FIRST.test(host)) weak.push(weak.shift()!)
    facts.role = tidy(weak[0] ?? null)
    others = weak.slice(1)
  }
  facts.location = tidy(others.find(isPlace) ?? null)
  facts.company = tidy(found.employer) ?? tidy(others.find((p) => !isPlace(p)) ?? null)
  if (facts.role && NOT_A_ROLE.test(facts.role)) return { ...NO_FACTS }
  return facts
}

/** Title of a page that is a sign-in wall or a robot check instead of the posting. */
const WALL = /^(sign in\b|sign up\b|log in\b|join linkedin\b|just a moment|attention required|access denied|access to this page has been denied|security check|robot check|are you (a )?(human|robot)|verif(y|ying) (you|that)|please (verify|enable|wait)|pardon our interruption|request (blocked|rejected)|(login|forbidden|error|unauthori[sz]ed|blocked|linkedin|linkedin: log in or sign up|403( forbidden)?)$)/i
const GONE = /^404\b|\b(page (not|can(no|['’])t be) found|not found$|no longer (available|exists|accepting)|job (has )?(expired|closed|been filled|not found)|posting (has )?(expired|closed)|position (has been )?(filled|closed))/i

/** Why the page can't be used, from its status, where we ended up and its title. Null when it looks like a posting. */
export function pageProblem(status: number, finalUrl: URL, title: string | null): PageProblem {
  if (status === 404 || status === 410) return 'gone'
  if ([401, 403, 407, 429, 451, 503, 999].includes(status)) return 'blocked'
  if (status >= 500) return 'down'
  if (status >= 400) return 'blocked'
  const host = finalUrl.hostname.toLowerCase()
  if (isLinkedIn(host)) {
    if (/^\/(authwall|login|signup|checkpoint|uas)(\/|$)/.test(finalUrl.pathname)) return 'blocked'
    if (finalUrl.searchParams.get('trk') === 'expired_jd_redirect') return 'gone'
  }
  // Sent to a sign-in page with a "come back here afterwards" parameter
  if (/\/(login|signin|sign-in|sso)(\/|$)/i.test(finalUrl.pathname) && finalUrl.search.length > 1) return 'blocked'
  const t = tidy(title) ?? ''
  if (WALL.test(t)) return 'blocked'
  if (GONE.test(t)) return 'gone'
  return null
}

const merge = (...sources: JobFacts[]): JobFacts => ({
  role: sources.map((s) => s.role).find(Boolean) ?? null,
  company: sources.map((s) => s.company).find(Boolean) ?? null,
  location: sources.map((s) => s.location).find(Boolean) ?? null,
  closes: sources.map((s) => s.closes).find(Boolean) ?? null,
  type: sources.map((s) => s.type).find(Boolean) ?? null,
})

/** The <title> of a page, cleaned up */
export const pageTitle = (html: string) => firstTag(html, 'title')

/** What the page says about the job. `url` is where the page was finally served from. */
export function extractJob(html: string, url: URL): JobFacts {
  const meta = metaTags(html)
  const host = url.hostname.toLowerCase()
  const siteName = tidy(meta['og:site_name'] ?? meta['application-name'] ?? null)
  const heading = firstTag(html, 'h1')
  const ctx: TitleContext = { siteName, heading, url }

  // A page can describe more than one job ("similar jobs"): trust the data only when it is clear which one is this
  // page's, either the only one or the one named in the heading
  const postings = jobPostings(html).map(fromPosting).filter((p) => p.role)
  const structured =
    postings.length === 1 ? postings[0] : (postings.find((p) => heading && key(p.role) === key(heading)) ?? { ...NO_FACTS })

  const ogTitle = fromTitle(meta['og:title'] ?? meta['twitter:title'] ?? null, ctx)
  const docTitle = fromTitle(pageTitle(html), ctx)
  // Prefer whichever title names a company as well as a role
  const titled = ogTitle.company || !docTitle.company ? merge(ogTitle, docTitle) : merge(docTitle, ogTitle)
  // The role is another matter: the title written for sharing is about this page, while <title> is often a template
  // ("Vacancy Details | Acme"). Best of all is the one the page's own heading agrees with.
  titled.role = [ogTitle.role, docTitle.role].find((r) => r && heading && key(r) === key(heading)) ?? ogTitle.role ?? docTitle.role

  const facts = merge(structured, titled)
  // A plain heading beats a title we couldn't take apart ("Nurse in Kandy, full time, apply by Friday")
  if (!structured.role && heading && heading.length <= 90 && !NOISE.test(heading) && !NOT_A_ROLE.test(heading) && !sameName(heading, siteName)) {
    if (!facts.role || (facts.role.length > heading.length + 12 && key(facts.role).includes(key(heading)))) facts.role = heading
  }
  if (!facts.company && !isJobBoard(host)) {
    const named = siteName ? stripCareers(siteName) : null
    const usable = named && !atsKind(host) && !NOISE.test(named) && key(named) !== key(facts.role)
    facts.company = atsCompany(url) ?? (usable ? tidy(named) : null)
  }
  if (facts.company && key(facts.company) === key(facts.role)) facts.company = null
  if (!facts.role) return { ...NO_FACTS } // a company with no role is the site talking about itself
  return facts
}

/**
 * Role and company from the words in the link, for when the site wouldn't show us the page.
 * Only links that spell it out: ".../senior-noc-engineer-at-superloop-3705660537" (LinkedIn and others use this).
 */
export function guessFromLink(url: URL): JobFacts {
  const facts: JobFacts = { ...NO_FACTS }
  const slug = url.pathname.split('/').filter(Boolean).reverse().find((s) => /.-at-./i.test(s))
  if (slug) {
    let words = slug
    try {
      words = decodeURIComponent(slug)
    } catch {
      // keep it as it is
    }
    words = words.replace(/\.(html?|php|aspx?)$/i, '').replace(/-\d{4,}$/, '')
    const at = words.toLowerCase().lastIndexOf('-at-')
    if (at > 0) {
      facts.role = fromSlug(words.slice(0, at))
      facts.company = fromSlug(words.slice(at + 4))
    }
  }
  if (!facts.company && !isJobBoard(url.hostname)) facts.company = atsCompany(url)
  return facts
}

export const hasFacts = (f: JobFacts) => Boolean(f.role || f.company)

/** What sort of site the link is on, which decides the application's "Platform". */
export type SiteKind = 'linkedin' | 'board' | 'employer' | 'unknown'

/**
 * linkedin · board (a site listing other employers' jobs) · employer (the company's own site or its hiring system) ·
 * unknown. A site counts as the employer's when its address has the company's name in it.
 */
export function siteKind(url: URL, company: string | null): SiteKind {
  const host = url.hostname.toLowerCase()
  if (isLinkedIn(host)) return 'linkedin'
  if (isJobBoard(host)) return 'board'
  if (atsKind(host)) return 'employer'
  const name = key(company)
  const first = key(company?.split(/\s+/)[0])
  const labels = host.split('.').slice(0, -1).map(key)
  const inAddress = (n: string) => n.length >= 3 && labels.some((l) => l === n || (n.length >= 4 && l.includes(n)))
  return inAddress(name) || inAddress(first) ? 'employer' : 'unknown'
}
