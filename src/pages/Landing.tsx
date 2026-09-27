import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import {
  BellIcon,
  BoardIcon,
  CalendarIcon,
  ChartIcon,
  CheckIcon,
  Logo,
  ShieldIcon,
} from '../components/Icons'

const img = (name: string) => `${import.meta.env.BASE_URL}landing/${name}`

const PhoneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="6" y="2" width="12" height="20" rx="2.5" />
    <path d="M11 18h2" />
  </svg>
)

const FEATURES = [
  {
    icon: <BoardIcon size={20} />,
    title: 'Drag-and-drop board',
    text: 'See every application by status, from Applied to Offered, and move cards as things change.',
  },
  {
    icon: <BellIcon size={20} />,
    title: 'Never miss a next step',
    text: 'Add interviews and follow-ups with a date. "Up next" shows what’s due, overdue items first.',
  },
  {
    icon: <CalendarIcon size={20} />,
    title: 'Calendar view',
    text: 'When you applied and what’s coming up, laid out by month.',
  },
  {
    icon: <ChartIcon size={20} />,
    title: 'Stats that matter',
    text: 'Applications per week and your response rate by platform: LinkedIn, email or company site.',
  },
  {
    icon: <ShieldIcon size={20} />,
    title: 'Private by design',
    text: 'Only you can see your applications. No ads, no tracking, and you can delete everything anytime.',
  },
  {
    icon: <PhoneIcon />,
    title: 'Works on your phone',
    text: 'Use it in any browser, or add it to your home screen like an app.',
  },
]

const STEPS = [
  { title: 'Create a free account', text: 'Sign up with your email or Google in seconds.' },
  { title: 'Add your applications', text: 'Role, company, date, and the next step if there is one.' },
  { title: 'Stay on top of it', text: 'Move cards as you hear back, tick off next steps and follow up on time.' },
]

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
        <section className="hero">
          <div className="landing-inner hero-text">
            <span className="eyebrow">
              <CheckIcon size={14} /> Free · Private · No ads
            </span>
            <h1>
              Track every job application <span className="grad">in one place.</span>
            </h1>
            <p className="lead">
              A simple board for your job hunt. See where every application stands, never miss an interview or
              follow-up, and learn which platforms actually reply.
            </p>
            <div className="hero-ctas">
              <Link to="/login?mode=signup" className="btn primary btn-lg">Get started free</Link>
              <Link to="/login" className="btn secondary btn-lg">Sign in</Link>
            </div>
            <p className="muted small">Sign up with email or Google. No credit card, nothing to install.</p>
          </div>

          <div className="landing-inner hero-visual">
            <figure className="browser-frame show-desktop">
              <div className="browser-bar" aria-hidden="true">
                <i /><i /><i />
              </div>
              <img
                src={img('board.webp')}
                width={1600}
                height={1111}
                alt="The Job Tracker board: an Up next strip with interviews and follow-ups, and applications in columns from Applied to No Response"
              />
            </figure>
            <figure className="phone-frame">
              <img
                src={img('iphone.webp')}
                width={880}
                height={1808}
                alt="Job Tracker on an iPhone 17 Pro, showing the Up next reminders"
                loading="lazy"
              />
            </figure>
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-inner">
            <h2 className="section-title">Everything your job hunt needs, nothing it doesn’t</h2>
            <div className="feature-grid">
              {FEATURES.map((f) => (
                <article key={f.title} className="feature card">
                  <span className="feature-icon">{f.icon}</span>
                  <h3>{f.title}</h3>
                  <p className="muted">{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section alt">
          <div className="landing-inner split">
            <div>
              <h2 className="section-title left">See what’s working</h2>
              <p className="lead">
                Are LinkedIn applications getting more replies than email? Is your pace slipping? Your stats page
                answers it at a glance.
              </p>
              <ol className="steps">
                {STEPS.map((s, i) => (
                  <li key={s.title}>
                    <span className="step-num">{i + 1}</span>
                    <div>
                      <strong>{s.title}</strong>
                      <p className="muted">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <figure className="browser-frame">
              <div className="browser-bar" aria-hidden="true">
                <i /><i /><i />
              </div>
              <img
                src={img('stats.webp')}
                width={1600}
                height={1111}
                alt="Stats page: totals, response rate, applications per week and response rate by platform"
                loading="lazy"
              />
            </figure>
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-inner privacy-band card">
            <span className="feature-icon big"><ShieldIcon size={24} /></span>
            <div>
              <h2>Your job hunt stays yours</h2>
              <p className="muted">
                Only you can see your applications. Passwords are never visible to anyone. No ads, no tracking, and
                you can delete your account and all your data from your profile at any time.{' '}
                <Link to="/privacy">Read the privacy page</Link>
              </p>
            </div>
          </div>
        </section>

        <section className="cta-band">
          <div className="landing-inner">
            <h2>Ready to organise your job hunt?</h2>
            <p>It takes less than a minute to add your first application.</p>
            <Link to="/login?mode=signup" className="btn btn-lg btn-light">Get started free</Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
