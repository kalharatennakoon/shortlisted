import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import { Logo } from '../components/Icons'
import { useAuth } from '../lib/auth'
import { CONTACT_EMAIL, OWNER_NAME, PRIVACY_UPDATED } from '../lib/config'
import { CV_ANALYZER_NAME, CV_ANALYZER_URL, CV_LINK_SECONDS } from '../lib/cvCheck'

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
          Shortlistd is a free, personal project by {OWNER_NAME}. This page explains, in plain words, what happens to
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
          <li>
            The <strong>applications you add</strong>: role, company, dates, status, links, notes, next steps (like
            interview or follow-up dates and times) and a contact email for the employer, if you add one.
          </li>
          <li>
            Any <strong>documents you upload</strong> (such as CVs and cover letters), up to 5 MB each, and which
            applications you attached them to.
          </li>
        </ul>

        <h2>Who can see it</h2>
        <ul>
          <li><strong>Other users can't</strong> see your applications or documents. Database and storage security rules stop anyone else signed in to the app from reading them.</li>
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

        <h2>Email reminders</h2>
        <p>
          Reminders are <strong>off unless you turn them on</strong> in Profile &amp; settings. When they're on, you get
          an email on mornings when a next step is due, listing the roles and companies involved. Emails are sent from{' '}
          {CONTACT_EMAIL} through Gmail, so Google handles them in transit like any other email. Every reminder has a
          one-click unsubscribe link, and turning reminders off stops them straight away.
        </p>

        <h2>Email drafts and your calendar</h2>
        <p>
          <strong>Draft email</strong> and <strong>Add to calendar</strong> open your own mail app, Gmail, Google
          Calendar or a calendar file, with the role, company and date filled in. Shortlistd doesn't send the email
          or add the event itself, and it never gets access to your mailbox or calendar. Nothing leaves the app until
          you press one of those buttons.
        </p>

        <h2>Checking your CV</h2>
        <p>
          <strong>Check my CV</strong> opens{' '}
          <a href={CV_ANALYZER_URL} target="_blank" rel="noreferrer">{CV_ANALYZER_NAME}</a>, a separate free tool by
          the same developer, in a new tab. Only when you press that button, it is given the role, the job link and
          the CV you chose, through a private link that stops working after {CV_LINK_SECONDS / 60} minutes. Once you
          press Analyse there, {CV_ANALYZER_NAME} sends the text of your CV to an AI service to review it;{' '}
          {CV_ANALYZER_NAME} itself does not store your CV. Nothing is shared if you never use the button.
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
          <a href={`mailto:${CONTACT_EMAIL}?subject=Shortlistd`}>{CONTACT_EMAIL}</a>.
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
