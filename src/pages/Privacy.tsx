import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import { Logo } from '../components/Icons'
import { useAuth } from '../lib/auth'
import { CONTACT_EMAIL, OWNER_NAME, PRIVACY_UPDATED } from '../lib/config'

export default function Privacy() {
  const { session } = useAuth()
  return (
    <div className="doc-page">
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
          <li>
            Any <strong>profile details</strong> you choose to add (name, target role, location, LinkedIn link).
          </li>
          <li>The <strong>applications you add</strong>: role, company, dates, status, links, notes and next steps (like interview or follow-up dates).</li>
          <li>
            Any <strong>documents you upload</strong> (such as CVs and cover letters), up to 5 MB each, and which
            applications you attached them to.
          </li>
        </ul>

        <h2>Who can see it</h2>
        <ul>
          <li><strong>Only you</strong> can see your applications in the app. Database security rules stop other users from reading them.</li>
          <li>
            Documents are kept in <strong>private</strong> file storage. They are never public: the app opens them
            with a link that works only for you and expires after a minute.
          </li>
          <li>
            As the person running the service, the site owner can technically see email addresses, applications and
            uploaded documents in the Supabase admin dashboard. They <strong>do not open, look at, share, or sell</strong>{' '}
            your applications or documents.
          </li>
          <li>There are no ads, no analytics and no tracking cookies.</li>
        </ul>

        <h2>Where it is stored</h2>
        <p>
          Data is stored with <a href="https://supabase.com" target="_blank" rel="noreferrer">Supabase</a> (the
          database and sign-in provider). If you choose Google sign-in, Google shares only your name and email address.
          The website is hosted on GitHub Pages.
        </p>

        <h2>Taking your data with you</h2>
        <p>
          On the Applications page, <strong>Import / export</strong> → <strong>Download CSV</strong> gives you every
          application you've added, in a file that opens in Excel or Google Sheets. CSV files you import are read in
          your browser; only the rows you confirm are saved to your account. Documents can be downloaded one by one
          on the Documents page.
        </p>

        <h2>Deleting your data</h2>
        <p>
          You can delete your account at any time: open the account menu (your initial in the top-right corner) →{' '}
          <strong>Profile &amp; settings</strong> → <strong>Delete account</strong>. This permanently removes your account, every application you added and
          every document you uploaded, straight away. You can also delete single documents on the Documents page.
        </p>

        <h2>Questions</h2>
        <p>
          Something unclear, or want your data removed? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Job%20Tracker`}>{CONTACT_EMAIL}</a>.
        </p>

        <footer className="doc-foot">
          <Link to={session ? '/' : '/login'}>← Back to {session ? 'my applications' : 'sign in'}</Link>
        </footer>
      </article>
    </div>
    <Footer />
    </div>
  )
}
