import { Link } from 'react-router-dom'
import { Logo } from '../components/Icons'
import { useAuth } from '../lib/auth'
import { CONTACT_LABEL, CONTACT_URL, OWNER_NAME, PRIVACY_UPDATED } from '../lib/config'

export default function Privacy() {
  const { session } = useAuth()
  return (
    <div className="doc-wrap">
      <article className="card doc">
        <header className="doc-head">
          <Logo size={36} />
          <div>
            <h1>Privacy</h1>
            <p className="muted small">Last updated {PRIVACY_UPDATED}</p>
          </div>
        </header>

        <p>
          Job Tracker is a free, personal project by {OWNER_NAME}. This page explains, in plain words, what happens to
          your data.
        </p>

        <h2>What is stored</h2>
        <ul>
          <li>Your <strong>email address</strong>, so you can sign in.</li>
          <li>
            Your <strong>password</strong>, stored only as a one-way hash. Nobody can read it, including the site
            owner. If you sign in with Google, no password is stored at all.
          </li>
          <li>The <strong>applications you add</strong>: role, company, dates, status, links, notes and next steps (like interview or follow-up dates).</li>
        </ul>

        <h2>Who can see it</h2>
        <ul>
          <li><strong>Only you</strong> can see your applications in the app. Database security rules stop other users from reading them.</li>
          <li>
            As the person running the service, the site owner can technically see email addresses and data in the
            database admin panel. They <strong>do not look at, share, or sell</strong> your applications.
          </li>
          <li>There are no ads, no analytics and no tracking cookies.</li>
        </ul>

        <h2>Where it is stored</h2>
        <p>
          Data is stored with <a href="https://supabase.com" target="_blank" rel="noreferrer">Supabase</a> (the
          database and sign-in provider). If you choose Google sign-in, Google shares only your name and email address.
          The website is hosted on GitHub Pages.
        </p>

        <h2>Deleting your data</h2>
        <p>
          You can delete your account at any time from the account menu (your initial in the top-right corner) →{' '}
          <strong>Delete account</strong>. This permanently removes your account and every application you added,
          straight away.
        </p>

        <h2>Questions</h2>
        <p>
          Something unclear? <a href={CONTACT_URL} target="_blank" rel="noreferrer">{CONTACT_LABEL}</a>.
        </p>

        <footer className="doc-foot">
          <Link to={session ? '/' : '/login'}>← Back to {session ? 'my applications' : 'sign in'}</Link>
        </footer>
      </article>
    </div>
  )
}
