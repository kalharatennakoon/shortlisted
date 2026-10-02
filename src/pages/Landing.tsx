import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import {
  BellIcon,
  BoardIcon,
  CalendarIcon,
  CalendarPlusIcon,
  ChartIcon,
  CheckIcon,
  FileIcon,
  Logo,
  MailIcon,
  PauseIcon,
  PlayIcon,
  ShieldIcon,
  TableIcon,
  UploadIcon,
} from '../components/Icons'

const img = (name: string) => `${import.meta.env.BASE_URL}landing/${name}`

const PhoneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="6" y="2" width="12" height="20" rx="2.5" />
    <path d="M11 18h2" />
  </svg>
)

// ---------- small hooks ----------

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

/** True while the element is on screen: animations only run when someone can see them. */
function useInView<T extends Element>(threshold = 0.25) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return [ref, inView] as const
}

// ---------- hero: a tour of the four views ----------

// Screenshots live in public/landing: <id>.webp (desktop, 1600x1091) and m-<id>.webp (phone screen, 804x1624)
const VIEWS = [
  { id: 'board', label: 'Board', icon: BoardIcon, caption: 'Move a card when you hear back.', alt: 'Board view: upcoming next steps, then applications in columns from Applied to No Response' },
  { id: 'table', label: 'Table', icon: TableIcon, caption: 'Sort by date, priority or status.', alt: 'Table view: every application in a sortable list with platform, priority, next step and status' },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon, caption: 'Applications and next steps by date.', alt: 'Calendar view: a month showing the days you applied and upcoming interviews and follow-ups' },
  { id: 'stats', label: 'Stats', icon: ChartIcon, caption: 'Response rate, funnel and weekly pace.', alt: 'Stats view: totals, response rate, interviews and a chart of applications per week' },
] as const

function Showcase() {
  const wide = useMediaQuery('(min-width: 861px)')
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [active, setActive] = useState(0)
  const [auto, setAuto] = useState(true)
  const [hover, setHover] = useState(false)
  const [ref, inView] = useInView<HTMLDivElement>(0.3)
  // Load a screenshot the first time it is shown, plus the next one so the switch is instant
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0, 1]))
  const show = (i: number) => {
    setActive(i)
    setSeen((s) => new Set([...s, i, (i + 1) % VIEWS.length]))
  }
  const playing = auto && !reduced
  const paused = !inView || hover

  return (
    <div
      ref={ref}
      className={`lp-show${paused ? ' paused' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="lp-show-bar lp-rise" style={{ '--d': 3 } as CSSProperties}>
        <div className="lp-tabs" role="group" aria-label="Choose a view to preview">
          {VIEWS.map((v, i) => (
            <button
              key={v.id}
              className={`lp-tab${i === active ? ' on' : ''}`}
              aria-pressed={i === active}
              onClick={() => {
                show(i)
                setAuto(false)
              }}
            >
              <v.icon size={16} />
              <span>{v.label}</span>
              {/* The progress line doubles as the timer: when its animation ends, show the next view */}
              {i === active && playing && (
                <span key={active} className="lp-tab-progress" onAnimationEnd={() => show((active + 1) % VIEWS.length)} />
              )}
            </button>
          ))}
        </div>
        <p className="lp-show-caption">{VIEWS[active].caption}</p>
        {!reduced && (
          <button
            className="lp-show-toggle"
            onClick={() => setAuto((a) => !a)}
            aria-label={auto ? 'Pause the preview' : 'Play the preview'}
            title={auto ? 'Pause' : 'Play'}
          >
            {auto ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>
        )}
      </div>

      <div className="lp-stage lp-rise" style={{ '--d': 4 } as CSSProperties}>
        {wide && (
          <figure className="lp-browser">
            <div className="lp-browser-bar" aria-hidden="true">
              <i /><i /><i />
              <span>Job Tracker</span>
            </div>
            <div className="lp-screens">
              {VIEWS.map((v, i) =>
                seen.has(i) ? (
                  <img key={v.id} src={img(`${v.id}.webp`)} width={1600} height={1091} alt={i === active ? v.alt : ''} className={i === active ? 'on' : ''} />
                ) : null,
              )}
            </div>
          </figure>
        )}
        <figure className="lp-phone">
          <div className="lp-phone-screen">
            {VIEWS.map((v, i) =>
              seen.has(i) ? (
                <img
                  key={v.id}
                  src={img(`m-${v.id}.webp`)}
                  width={804}
                  height={1624}
                  alt={i === active && !wide ? v.alt : ''}
                  className={i === active ? 'on' : ''}
                />
              ) : null,
            )}
          </div>
          <img className="lp-phone-frame" src={img('iphone.webp')} width={880} height={1808} alt="" />
        </figure>
      </div>
    </div>
  )
}

// ---------- roles ticker ----------

const ROLES = [
  ['Staff Nurse', 'Accountant', 'Primary Teacher', 'Civil Engineer', 'Graphic Designer', 'Pharmacist', 'Chef', 'Software Engineer', 'HR Officer', 'Journalist', 'Electrician', 'Lawyer'],
  ['Marketing Executive', 'Quantity Surveyor', 'Lab Technician', 'Hotel Receptionist', 'Data Analyst', 'Lecturer', 'Sales Executive', 'Architect', 'Bank Officer', 'Physiotherapist', 'Project Manager', 'Translator'],
]

function Ticker() {
  return (
    <div className="lp-ticker" aria-hidden="true">
      {ROLES.map((row, r) => (
        <div key={r} className={`lp-ticker-row${r ? ' rev' : ''}`}>
          {/* The list is repeated once so the loop has no visible seam */}
          {[0, 1].map((copy) => (
            <ul key={copy} className={copy ? 'dup' : ''}>
              {row.map((role) => (
                <li key={role}>{role}</li>
              ))}
            </ul>
          ))}
        </div>
      ))}
    </div>
  )
}

// ---------- one application, from applied to accepted ----------

const STAGES = [
  { status: 'Applied', cls: 'status-applied', meta: 'Applied today', text: 'Add the role, company and date, and attach the CV you sent.' },
  { status: 'Interviewed', cls: 'status-interviewed', meta: 'Interview on Thursday', text: 'Set the interview as a next step and it shows in Up next.' },
  { status: 'Offered', cls: 'status-offered', meta: 'Offer received', text: 'Every reply counts toward your response rate in Stats.' },
  { status: 'Accepted', cls: 'status-accepted', meta: 'Accepted', text: 'Mark it accepted. Your history stays for the next search.' },
]
const PEOPLE = [
  { role: 'Staff Nurse', company: 'Lakemont General Hospital' },
  { role: 'Accountant', company: 'Bluepeak Finance' },
  { role: 'Primary Teacher', company: 'Northgate Academy' },
  { role: 'Civil Engineer', company: 'Summit & Stone Builders' },
  { role: 'Graphic Designer', company: 'Brightline Media' },
  { role: 'Front Office Associate', company: 'Harbor View Hotel' },
]

function Journey() {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [ref, inView] = useInView<HTMLDivElement>(0.4)
  const [tick, setTick] = useState(0)
  const run = inView && !reduced
  const step = tick % STAGES.length
  const person = PEOPLE[Math.floor(tick / STAGES.length) % PEOPLE.length]

  useEffect(() => {
    if (!run) return
    // linger on "Accepted" a little before the next application starts
    const id = setTimeout(() => setTick((t) => t + 1), step === STAGES.length - 1 ? 2600 : 1900)
    return () => clearTimeout(id)
  }, [run, step, tick])

  return (
    <div ref={ref} className="lp-journey">
      <div className="lp-track" style={{ '--step': step } as CSSProperties} aria-hidden="true">
        {STAGES.map((s, i) => (
          <div key={s.status} className={`lp-lane ${s.cls}${i === step ? ' on' : ''}`}>
            <span className="lp-lane-head">
              <span className="dot" />
              {s.status}
            </span>
            <span className="lp-lane-slot" />
          </div>
        ))}
        {/* key = the person, so a new application pops in at "Applied" instead of sliding back */}
        <div key={person.role} className={`lp-card ${STAGES[step].cls}`}>
          <strong>{person.role}</strong>
          <span className="lp-card-co">{person.company}</span>
          <span className="lp-card-meta">
            {step === 1 ? <BellIcon size={12} /> : step === 3 ? <CheckIcon size={12} /> : <span className="dot" />}
            {STAGES[step].meta}
          </span>
        </div>
      </div>
      <ol className="lp-stage-notes">
        {STAGES.map((s, i) => (
          <li key={s.status} className={i === step ? 'on' : ''}>
            <strong>{s.status}</strong>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------- feature tiles ----------

const UP_NEXT = [
  { urgency: 'today', when: 'Today · 2:30 PM', step: 'Interview', role: 'Primary Teacher', company: 'Northgate Academy' },
  { urgency: 'soon', when: 'Tomorrow', step: 'Follow up', role: 'Accountant', company: 'Bluepeak Finance' },
  { urgency: 'soon', when: 'Saturday', step: 'Call', role: 'Marketing Executive', company: 'Cedar & Sage' },
]
const DOCS = [
  { name: 'Nursing CV', kind: 'CV', used: 'Sent with 3 applications' },
  { name: 'Cover letter, Lakemont', kind: 'Cover letter', used: 'Sent with 1 application' },
  { name: 'Teaching CV', kind: 'CV', used: 'Sent with 2 applications' },
]

const EMAIL_KINDS = ['Follow up', 'Thank you', 'Check in']

function Tile({ icon, title, text, children, className = '', isNew = false }: { icon: ReactNode; title: string; text: string; children?: ReactNode; className?: string; isNew?: boolean }) {
  return (
    <article className={`lp-tile ${className}`}>
      <div className="lp-tile-text">
        <span className="lp-tile-top">
          <span className="lp-tile-icon">{icon}</span>
          {isNew && <span className="lp-new">New in v2</span>}
        </span>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      {children}
    </article>
  )
}

/** Public home page for signed-out visitors. */
export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-inner landing-nav-inner">
          <Link to="/" className="brand">
            <Logo size={30} />
            <span>Job Tracker</span>
          </Link>
          <span className="spacer" />
          <Link to="/login" className="btn ghost">Sign in</Link>
          <Link to="/login?mode=signup" className="btn primary">Get started</Link>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="landing-inner">
            <div className="lp-hero-head">
              <h1 className="lp-rise" style={{ '--d': 0 } as CSSProperties}>Know where every job application stands.</h1>
              <div className="lp-hero-side lp-rise" style={{ '--d': 1 } as CSSProperties}>
                <p className="lp-lead">
                  A free board for your job hunt, whatever your field. Log each application, get reminded about
                  interviews and follow-ups, and see which platforms actually reply.
                </p>
                <div className="lp-ctas">
                  <Link to="/login?mode=signup" className="btn primary btn-lg">Get started free</Link>
                  <Link to="/login" className="btn secondary btn-lg">Sign in</Link>
                </div>
                <ul className="lp-trust">
                  <li><CheckIcon size={14} /> Free to use</li>
                  <li><CheckIcon size={14} /> No ads or tracking</li>
                  <li><CheckIcon size={14} /> Nothing to install</li>
                </ul>
              </div>
            </div>
            <Showcase />
          </div>
        </section>

        <section className="lp-section lp-fields">
          <div className="landing-inner">
            <div className="lp-section-head">
              <h2>Built for any field, not only tech</h2>
              <p>
                An application looks the same whether you are a nurse, a teacher or an engineer: a role, a company, a
                date and what happens next.
              </p>
            </div>
          </div>
          <Ticker />
          <p className="sr-only">Examples: {ROLES.flat().join(', ')}.</p>
        </section>

        <section className="lp-section">
          <div className="landing-inner">
            <div className="lp-section-head">
              <h2>Follow each application from applied to accepted</h2>
              <p>Move a card when you hear back. The board, your reminders and your stats update with it.</p>
            </div>
            <Journey />
          </div>
        </section>

        <section className="lp-section lp-tinted">
          <div className="landing-inner">
            <div className="lp-section-head">
              <h2>The parts of a job hunt that are easy to lose</h2>
              <p>Dates, documents, follow-up emails and the spreadsheet you started with all live next to the board.</p>
            </div>
            <div className="lp-tiles">
              <Tile
                className="wide"
                icon={<BellIcon size={20} />}
                title="Never miss a next step"
                text="Add interviews, assessments and follow-ups with a date. “Up next” shows what is due, and an optional morning email reminds you."
              >
                <ul className="lp-mini upnext-list" aria-hidden="true">
                  {UP_NEXT.map((u) => (
                    <li key={u.role} className={`upnext-item urgency-${u.urgency}`}>
                      <div className="upnext-body">
                        <span className="upnext-when">{u.when}</span>
                        <span className="upnext-what">
                          <strong>{u.step}</strong>
                          <span className="upnext-role">
                            {u.role}
                            <span className="muted"> · {u.company}</span>
                          </span>
                        </span>
                      </div>
                      <span className="upnext-done lp-mini-done"><CheckIcon size={16} /></span>
                    </li>
                  ))}
                </ul>
              </Tile>
              <Tile
                icon={<FileIcon size={20} />}
                title="Know which CV you sent"
                text="Keep every CV and cover letter version together and attach them to the applications you sent them with."
              >
                <ul className="lp-mini lp-docs" aria-hidden="true">
                  {DOCS.map((d) => (
                    <li key={d.name}>
                      <FileIcon size={16} />
                      <span>
                        <strong>{d.name}</strong>
                        <small>{d.used}</small>
                      </span>
                      <span className="tag">{d.kind}</span>
                    </li>
                  ))}
                </ul>
              </Tile>
              <Tile
                isNew
                icon={<CalendarPlusIcon size={20} />}
                title="Interviews in your calendar"
                text="Give a next step a time, then add it to Google Calendar, Apple Calendar or Outlook in two taps."
              >
                <div className="lp-mini lp-calmock" aria-hidden="true">
                  <div className="cal-event">
                    <span className="cal-event-icon"><CalendarPlusIcon size={18} /></span>
                    <span>
                      <strong>Interview: Primary Teacher</strong>
                      <span className="muted small block">Mon, 5 Oct · 2:30 PM – 3:30 PM</span>
                    </span>
                  </div>
                  <div className="lp-pills">
                    <span>Google Calendar</span>
                    <span>Apple / Outlook</span>
                  </div>
                </div>
              </Tile>
              <Tile
                isNew
                className="wide"
                icon={<MailIcon size={20} />}
                title="Follow up without a blank page"
                text="Choose a follow-up, a thank-you or a check-in. The email is already filled in with the role, the company and the date you applied, and it opens in your own Gmail or mail app to edit and send."
              >
                <div className="lp-mini lp-mail" aria-hidden="true">
                  <div className="lp-mail-kinds">
                    {EMAIL_KINDS.map((k, i) => (
                      <span key={k} className={i === 0 ? 'on' : ''}>{k}</span>
                    ))}
                  </div>
                  <div className="lp-mail-row">
                    <small>To</small>
                    <span>recruitment@lakemont.example</span>
                  </div>
                  <div className="lp-mail-row">
                    <small>Subject</small>
                    <span>Following up on my application: Staff Nurse</span>
                  </div>
                  <p className="lp-mail-body">
                    I applied for the Staff Nurse position at Lakemont Hospital on 12 September 2026, and I am
                    writing to ask whether there is any update on my application.
                  </p>
                  <div className="lp-mail-foot">
                    <span className="lp-fake-btn">Open in mail app</span>
                    <span className="lp-fake-btn primary">Open in Gmail</span>
                  </div>
                </div>
              </Tile>
              <Tile
                icon={<UploadIcon size={20} />}
                title="Bring the list you already have"
                text="Import applications from a Notion, Excel or Google Sheets CSV, and export them whenever you like."
              />
              <Tile
                icon={<CalendarIcon size={20} />}
                title="See your month"
                text="Applications and next steps on a calendar, so a busy week does not catch you out."
              />
              <Tile
                icon={<PhoneIcon />}
                title="Works on your phone"
                text="Use it in any browser, or add it to your home screen like an app."
              />
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="landing-inner">
            <div className="lp-split">
              <div className="lp-section-head">
                <h2>See what is working</h2>
                <p>
                  Are LinkedIn applications getting more replies than email? Is your pace slipping? The Stats tab
                  answers it at a glance.
                </p>
              </div>
              <ul className="lp-checks">
                <li><CheckIcon size={16} /> Response rate for each platform you apply through</li>
                <li><CheckIcon size={16} /> A funnel from applied to accepted</li>
                <li><CheckIcon size={16} /> Applications per week, and your weekly streak</li>
              </ul>
            </div>
            <figure className="lp-shot">
              <picture>
                {/* phones get the stacked version, which stays readable at that width */}
                <source media="(max-width: 700px)" srcSet={img('m-insights.webp')} width={740} height={1562} />
                <img
                  src={img('insights.webp')}
                  width={1600}
                  height={598}
                  alt="Stats: a hiring funnel from applied to accepted, and response rate by platform"
                  loading="lazy"
                />
              </picture>
            </figure>
          </div>
        </section>

        <section className="lp-section lp-privacy-wrap">
          <div className="landing-inner">
            <div className="lp-privacy">
              <span className="lp-tile-icon big"><ShieldIcon size={24} /></span>
              <div>
                <h2>Your job hunt stays yours</h2>
                <p>
                  Other users can never see your applications or documents, and the site owner doesn't look at them.
                  Passwords are never visible to anyone. No ads, no tracking, and you can delete your account and all
                  your data from your profile at any time.{' '}
                  <Link to="/privacy">Read the privacy page</Link>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-cta">
          <div className="landing-inner">
            <div>
              <h2>Ready to organise your job hunt?</h2>
              <p>It takes less than a minute to add your first application.</p>
            </div>
            <Link to="/login?mode=signup" className="btn btn-lg btn-light">Get started free</Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
