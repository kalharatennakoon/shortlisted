// Tests for extract.ts. Run from the repo root with:  node --test supabase/functions/job-link/
// The pages below are cut-down copies of how each kind of site marks up a posting; the employers are made up.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cleanLink, dateKey, extractJob, fromSlug, guessFromLink, isPublicHost, isPublicIPv4, isPublicIPv6, pageProblem,
  pageTitle, siteKind, tidy,
} from './extract.ts'

const page = (head: string, body = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`
const read = (html: string, url: string) => extractJob(html, new URL(url))

// ---------- links ----------

test('cleanLink: accepts web links, with or without https', () => {
  assert.equal(cleanLink('https://example.com/jobs/1')?.href, 'https://example.com/jobs/1')
  assert.equal(cleanLink('  www.example.com/jobs/1  ')?.href, 'https://www.example.com/jobs/1')
  assert.equal(cleanLink('http://example.com/a?b=1#c')?.href, 'http://example.com/a?b=1#c')
})

test('cleanLink: refuses anything that is not a plain web link', () => {
  for (const bad of ['', 'not a link', 'javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/x',
    'data:text/html,hi', 'https://user:pass@example.com/', 'mailto:a@b.com', `https://example.com/${'a'.repeat(2100)}`]) {
    assert.equal(cleanLink(bad), null, bad)
  }
})

test('cleanLink: drops tracking, keeps the parameters that identify the job', () => {
  assert.equal(
    cleanLink('https://www.topjobs.lk/employer/JobAdvertismentServlet?rid=0&ac=DEFZZZ&jc=0001234567&utm_source=x&fbclid=y')?.href,
    'https://www.topjobs.lk/employer/JobAdvertismentServlet?rid=0&ac=DEFZZZ&jc=0001234567',
  )
})

test('cleanLink: LinkedIn links become the job\'s own public page', () => {
  const view = 'https://www.linkedin.com/jobs/view/3705660537'
  assert.equal(cleanLink('https://www.linkedin.com/jobs/search/?currentJobId=3705660537&keywords=nurse&origin=SWITCH')?.href, view)
  assert.equal(cleanLink('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=3705660537')?.href, view)
  assert.equal(
    cleanLink('https://lk.linkedin.com/jobs/view/senior-noc-engineer-at-superloop-3705660537?refId=abc&trackingId=def&trk=x')?.href,
    'https://lk.linkedin.com/jobs/view/senior-noc-engineer-at-superloop-3705660537',
  )
  assert.equal(cleanLink('https://www.linkedin.com/comm/jobs/view/3705660537/?trackingId=x')?.href, `${view}/`)
  // Not a job: left alone
  assert.equal(cleanLink('https://www.linkedin.com/in/someone')?.href, 'https://www.linkedin.com/in/someone')
})

test('isPublicHost: only ordinary public websites', () => {
  for (const ok of ['example.com', 'www.topjobs.lk', 'jobs.lever.co', 'xn--bcher-kva.com', '8.8.8.8']) {
    assert.equal(isPublicHost(ok), true, ok)
  }
  for (const bad of ['localhost', 'intranet', 'db.internal', 'printer.local', 'app.localhost', 'foo.test',
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '[::1]', '::1', 'fe80::1', 'example.com.', '1.2.3', 'exa mple.com', '-a.com']) {
    assert.equal(isPublicHost(bad), bad === 'example.com.', bad)
  }
  // The URL parser turns other ways of writing an address into the dotted form before we see it
  assert.equal(isPublicHost(new URL('http://2130706433/').hostname), false)
  assert.equal(isPublicHost(new URL('http://0x7f.1/').hostname), false)
  assert.equal(isPublicHost(new URL('http://[::ffff:127.0.0.1]/').hostname), false)
})

test('isPublicIPv4 / isPublicIPv6: answers from the address lookup', () => {
  assert.equal(isPublicIPv4('172.15.0.1'), true)
  assert.equal(isPublicIPv4('172.32.0.1'), true)
  assert.equal(isPublicIPv4('192.0.2.1'), false)
  assert.equal(isPublicIPv4('198.18.0.1'), false)
  assert.equal(isPublicIPv6('2606:4700::6810:84e5'), true)
  for (const bad of ['::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:10.0.0.1', '2001:db8::1', '2002:a00:1::', '::']) {
    assert.equal(isPublicIPv6(bad), false, bad)
  }
})

// ---------- text ----------

test('tidy: one clean line', () => {
  assert.equal(tidy('  Nurse &amp; Midwife\n\t(Night&nbsp;shift) '), 'Nurse & Midwife (Night shift)')
  assert.equal(tidy('R&amp;amp;D Engineer'), 'R&D Engineer')
  assert.equal(tidy('<b>Chef</b> de <i>Partie</i>'), 'Chef de Partie')
  assert.equal(tidy('Caf&#233; Manager &#x2013; Kandy'), 'Café Manager – Kandy')
  assert.equal(tidy(''), null)
  assert.equal(tidy({}), null)
  assert.equal(tidy('x'.repeat(500))?.length, 160)
})

test('dateKey: the date as written', () => {
  assert.equal(dateKey('2026-10-31'), '2026-10-31')
  assert.equal(dateKey('2026-10-31T23:59:59+05:30'), '2026-10-31')
  assert.equal(dateKey('2026-11-01T00:30:00-08:00'), '2026-11-01')
  assert.equal(dateKey('31 October 2026'), '2026-10-31')
  assert.equal(dateKey('Sat, 31 Oct 2026 23:59:59 GMT'), '2026-10-31')
  assert.equal(dateKey('soon'), null)
  assert.equal(dateKey('0001-01-01T00:00:00'), null)
  assert.equal(dateKey(null), null)
})

test('fromSlug', () => {
  assert.equal(fromSlug('senior-noc-engineer-sri-lanka'), 'Senior NOC Engineer Sri Lanka')
  assert.equal(fromSlug('head-of-qa-and-devops'), 'Head of QA and DevOps')
  assert.equal(fromSlug('engineer-%E2%80%93-operations-center'), 'Engineer Operations Center')
})

// ---------- structured data ----------

test('JobPosting data: everything in one place', () => {
  const html = page(
    `<title>Staff Nurse | Careers</title>${ld({
      '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Staff Nurse (ICU)',
      hiringOrganization: { '@type': 'Organization', name: 'Lakeview Hospitals (Pvt) Ltd' },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Kandy', addressRegion: 'Central Province', addressCountry: 'LK' } },
      validThrough: '2026-10-31T23:59:59+05:30', employmentType: 'FULL_TIME', datePosted: '2026-10-01',
      description: '<p>Long description…</p>',
    })}`,
    '<h1>Staff Nurse (ICU)</h1>',
  )
  assert.deepEqual(read(html, 'https://careers.lakeview.example/jobs/42'), {
    role: 'Staff Nurse (ICU)', company: 'Lakeview Hospitals (Pvt) Ltd', location: 'Kandy, Central Province, Sri Lanka',
    closes: '2026-10-31', type: 'Full-time',
  })
})

test('JobPosting data: inside @graph, arrays, raw line breaks, remote', () => {
  const graph = page(ld({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', name: 'Example' },
    { '@type': ['JobPosting'], title: 'Accountant', hiringOrganization: 'Perera &amp; Sons',
      jobLocation: [{ address: { addressLocality: 'Colombo', addressCountry: { '@type': 'Country', name: 'Sri Lanka' } } },
        { address: { addressLocality: 'Galle', addressCountry: 'Sri Lanka' } }],
      employmentType: ['PART_TIME', 'CONTRACTOR'] },
  ] }))
  assert.deepEqual(read(graph, 'https://example.com/j/1'), {
    role: 'Accountant', company: 'Perera & Sons', location: 'Colombo, Sri Lanka (+1 more)', closes: null, type: 'Part-time / Contract',
  })

  // Line breaks left inside a string make it invalid JSON; sites do this a lot
  const broken = page(`<script type="application/ld+json">{"@type":"JobPosting","title":"Graphic\nDesigner","hiringOrganization":{"name":"Studio Nine"},"jobLocationType":"TELECOMMUTE","applicantLocationRequirements":{"@type":"Country","name":"Sri Lanka"}}</script>`)
  assert.deepEqual(read(broken, 'https://example.com/j/2'), {
    role: 'Graphic Designer', company: 'Studio Nine', location: 'Remote (Sri Lanka)', closes: null, type: null,
  })
})

test('JobPosting data: several jobs on a page are ignored unless the heading says which', () => {
  const two = [{ '@type': 'JobPosting', title: 'Teacher', hiringOrganization: { name: 'A' } },
    { '@type': 'JobPosting', title: 'Librarian', hiringOrganization: { name: 'B' } }]
  assert.equal(read(page(`<title>Jobs</title>${ld(two)}`), 'https://example.com/jobs').role, null)
  assert.deepEqual(
    [read(page(ld(two), '<h1>Librarian</h1>'), 'https://example.com/jobs/2')].map((f) => [f.role, f.company]),
    [['Librarian', 'B']],
  )
})

// ---------- titles ----------

test('LinkedIn: "Company hiring Role in Place | LinkedIn"', () => {
  const html = page(
    `<title>Superloop hiring Senior NOC Engineer - Sri Lanka in Colombo, Western Province, Sri Lanka | LinkedIn</title>
     <meta property="og:title" content="Superloop hiring Senior NOC Engineer - Sri Lanka in Colombo, Western Province, Sri Lanka | LinkedIn">
     <meta property="og:site_name" content="LinkedIn">`,
    '<h1 class="top-card-layout__title">Senior NOC Engineer - Sri Lanka</h1>',
  )
  assert.deepEqual(read(html, 'https://lk.linkedin.com/jobs/view/senior-noc-engineer-sri-lanka-at-superloop-3705660537'), {
    role: 'Senior NOC Engineer - Sri Lanka', company: 'Superloop', location: 'Colombo, Western Province, Sri Lanka', closes: null, type: null,
  })
})

test('Role at Company - Place | Site (a Sri Lankan job board)', () => {
  const html = page(
    `<title>Senior Software Engineer at BitSlize Concepts - Colombo, Sri Lanka | ITPro.lk</title>
     <meta property="og:title" content="Senior Software Engineer at BitSlize Concepts - Colombo, Sri Lanka | ITPro.lk">`,
    '<h1>Senior Software Engineer</h1>',
  )
  assert.deepEqual(read(html, 'https://itpro.lk/job/13840/senior-software-engineer-at-bitslize-concepts/'), {
    role: 'Senior Software Engineer', company: 'BitSlize Concepts', location: 'Colombo, Sri Lanka', closes: null, type: null,
  })
})

test('Greenhouse: "Job Application for Role at Company"', () => {
  const html = page('<title>Job Application for Data Analyst at Northwind Labs</title><meta property="og:title" content="Data Analyst">')
  const facts = read(html, 'https://job-boards.greenhouse.io/northwindlabs/jobs/4064138009')
  assert.deepEqual([facts.role, facts.company], ['Data Analyst', 'Northwind Labs'])
})

test('Lever: company first, no heading', () => {
  const html = page('<title>Harbour Hotels - Front Office Executive</title><meta property="og:title" content="Harbour Hotels - Front Office Executive">', '<h2>Front Office Executive</h2>')
  const facts = read(html, 'https://jobs.lever.co/harbourhotels/fb388677-ac4d-45ac-bf78-99c3adc58009')
  assert.deepEqual([facts.role, facts.company], ['Front Office Executive', 'Harbour Hotels'])
})

test('Workday and friends: only the role in the title, employer from the address', () => {
  const html = page('<title>Credit Officer</title><meta property="og:title" content="Credit Officer">')
  const facts = read(html, 'https://ceylonbank.wd3.myworkdayjobs.com/en-US/External/job/Colombo/Credit-Officer_R-1024')
  assert.deepEqual([facts.role, facts.company], ['Credit Officer', 'Ceylonbank'])
})

test('A company\'s own careers site', () => {
  const a = page('<title>Civil Engineer | Maga Careers</title>', '<h1>Civil Engineer</h1>')
  assert.deepEqual(Object.values(read(a, 'https://careers.maga.example/openings/civil-engineer')).slice(0, 2), ['Civil Engineer', 'Maga'])

  // The site's own name is the employer here, unlike on a job board
  const b = page('<title>English Teacher - Kandy - Hillcrest</title><meta property="og:site_name" content="Hillcrest">', '<h1>English Teacher</h1>')
  assert.deepEqual(read(b, 'https://www.hillcrest.example/vacancies/12'), {
    role: 'English Teacher', company: 'Hillcrest', location: 'Kandy', closes: null, type: null,
  })

  // Company first, and a role with a hyphen in it: the heading settles both
  const c = page('<title>Acme, Inc. | Engineer - Backend | Remote</title>', '<h1>Engineer - Backend</h1>')
  assert.deepEqual(read(c, 'https://jobs.acme.example/123'), {
    role: 'Engineer - Backend', company: 'Acme, Inc.', location: 'Remote', closes: null, type: null,
  })

  const d = page('<title>Head of Careers - Rivergate School</title>', '<h1>Head of Careers</h1>')
  assert.deepEqual(Object.values(read(d, 'https://rivergate.example/jobs/9')).slice(0, 2), ['Head of Careers', 'Rivergate School'])
})

test('A template <title> with the role only in the sharing title (wso2.com/careers)', () => {
  const head = '<title>Vacancy Details | WSO2</title><meta property="og:title" content="Site Reliability Engineer"><meta name="twitter:title" content="Site Reliability Engineer">'
  const want = { role: 'Site Reliability Engineer', company: 'WSO2', location: null, closes: null, type: null }
  const url = 'https://wso2.com/careers/290/2026-10-site-reliability-engineer-sri-lanka'
  assert.deepEqual(read(page(head, '<h1>Site Reliability Engineer</h1>'), url), want)
  assert.deepEqual(read(page(head), url), want)
  // A template title that isn't on the list of empty phrases still loses to the sharing title
  assert.deepEqual(read(page('<title>Join the crew | Northwind</title><meta property="og:title" content="Deck Officer">'), 'https://northwind.example/jobs/5'),
    { ...want, role: 'Deck Officer', company: 'Northwind' })
})

test('Role @ Company, and "at" inside a role', () => {
  const a = page('<title>Product Designer @ Lumen</title>')
  assert.deepEqual(Object.values(read(a, 'https://jobs.ashbyhq.com/lumen/abc')).slice(0, 2), ['Product Designer', 'Lumen'])
  const b = page('<title>Chef at Large at Spice Route in Galle, Sri Lanka</title>')
  assert.deepEqual(read(b, 'https://example.com/x'), {
    role: 'Chef at Large', company: 'Spice Route', location: 'Galle, Sri Lanka', closes: null, type: null,
  })
})

test('A job site describing itself is not a job', () => {
  const home = page('<title>topjobs - Sri Lanka Job Network - jobs/vacancies, careers and employment</title>')
  assert.deepEqual(read(home, 'https://www.topjobs.lk/employer/JobAdvertismentServlet?jc=0001234567'), {
    role: null, company: null, location: null, closes: null, type: null,
  })
  const search = page('<title>372 Software Engineer jobs in Sri Lanka (24 new)</title><meta property="og:site_name" content="LinkedIn">')
  assert.equal(read(search, 'https://lk.linkedin.com/jobs/software-engineer-jobs').role, null)
  assert.equal(read(page('<title>Careers</title>'), 'https://acme.example/careers').role, null)
  assert.equal(read('', 'https://acme.example/careers').role, null)
})

test('Data from the page wins over the title, and the title fills the gaps', () => {
  const html = page(
    `<title>Pharmacist at Union Chemists - Colombo 03, Sri Lanka | Jobs</title>${ld({ '@type': 'JobPosting', title: 'Pharmacist (SLMC registered)', validThrough: '2026-11-15' })}`,
  )
  assert.deepEqual(read(html, 'https://example.com/jobs/7'), {
    role: 'Pharmacist (SLMC registered)', company: 'Union Chemists', location: 'Colombo 03, Sri Lanka', closes: '2026-11-15', type: null,
  })
})

// ---------- walls ----------

test('pageProblem: refused, gone, or fine', () => {
  const u = (s: string) => new URL(s)
  assert.equal(pageProblem(200, u('https://example.com/jobs/1'), 'Nurse at Acme'), null)
  assert.equal(pageProblem(999, u('https://www.linkedin.com/jobs/view/1'), null), 'blocked')
  assert.equal(pageProblem(403, u('https://www.indeed.com/viewjob?jk=1'), 'Just a moment...'), 'blocked')
  assert.equal(pageProblem(200, u('https://www.linkedin.com/authwall?trk=x&sessionRedirect=y'), 'Sign Up | LinkedIn'), 'blocked')
  assert.equal(pageProblem(200, u('https://example.com/x'), 'Just a moment...'), 'blocked')
  assert.equal(pageProblem(200, u('https://example.com/x'), 'Attention Required! | Cloudflare'), 'blocked')
  assert.equal(pageProblem(200, u('https://example.com/account/login?next=%2Fjobs%2F1'), 'Welcome'), 'blocked')
  assert.equal(pageProblem(404, u('https://example.com/x'), 'Not found'), 'gone')
  assert.equal(pageProblem(200, u('https://example.com/x'), 'Page not found - Acme'), 'gone')
  assert.equal(pageProblem(200, u('https://www.linkedin.com/jobs/search?trk=expired_jd_redirect'), 'Jobs'), 'gone')
  assert.equal(pageProblem(502, u('https://example.com/x'), null), 'down')
  // Words that also start real job titles
  assert.equal(pageProblem(200, u('https://example.com/x'), 'Sign Installer at Acme'), null)
  assert.equal(pageProblem(200, u('https://example.com/x'), 'LinkedIn hiring Engineer in Dublin | LinkedIn'), null)
  assert.equal(pageProblem(200, u('https://example.com/x'), 'Error Analyst - Acme'), null)
})

test('pageTitle', () => {
  assert.equal(pageTitle('<html><head><TITLE lang="en">\n  A &amp; B </TITLE></head></html>'), 'A & B')
  assert.equal(pageTitle('<p>none</p>'), null)
})

// ---------- guessing from the link ----------

test('guessFromLink: only when the link spells it out', () => {
  const g = (s: string) => guessFromLink(new URL(s))
  assert.deepEqual([g('https://lk.linkedin.com/jobs/view/senior-noc-engineer-sri-lanka-at-superloop-3705660537')].map((f) => [f.role, f.company]),
    [['Senior NOC Engineer Sri Lanka', 'Superloop']])
  assert.deepEqual([g('https://lk.linkedin.com/jobs/view/engineer-%E2%80%93-operations-center-at-wiley-sri-lanka-3320415250')].map((f) => [f.role, f.company]),
    [['Engineer Operations Center', 'Wiley Sri Lanka']])
  assert.deepEqual([g('https://www.linkedin.com/jobs/view/3705660537')].map((f) => [f.role, f.company]), [[null, null]])
  assert.deepEqual([g('https://boards.greenhouse.io/northwind-labs/jobs/6531265')].map((f) => [f.role, f.company]), [[null, 'Northwind Labs']])
  assert.deepEqual([g('https://www.indeed.com/viewjob?jk=abc123')].map((f) => [f.role, f.company]), [[null, null]])
})

test('siteKind: which Platform a link belongs to', () => {
  const k = (s: string, company: string | null = null) => siteKind(new URL(s), company)
  assert.equal(k('https://lk.linkedin.com/jobs/view/1'), 'linkedin')
  assert.equal(k('https://www.topjobs.lk/x'), 'board')
  assert.equal(k('https://uk.indeed.com/viewjob?jk=1'), 'board')
  assert.equal(k('https://job-boards.greenhouse.io/acme/jobs/1'), 'employer')
  assert.equal(k('https://acme.wd5.myworkdayjobs.com/x'), 'employer')
  assert.equal(k('https://careers.lakeview.example/jobs/42', 'Lakeview Hospitals (Pvt) Ltd'), 'employer')
  assert.equal(k('https://www.wso2.com/careers/1', 'WSO2'), 'employer')
  assert.equal(k('https://somejobsite.example/jobs/42', 'Lakeview Hospitals'), 'unknown')
  assert.equal(k('https://example.com/jobs/42', null), 'unknown')
})
