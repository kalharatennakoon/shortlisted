import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { APP_VERSION, CONTACT_EMAIL, OWNER_NAME } from '../lib/config'
import { Logo, MailIcon } from './Icons'

const mailto = `mailto:${CONTACT_EMAIL}?subject=Shortlisted`

/**
 * Site footer. The full version (landing, privacy) has link columns; `compact` is a slim bar for
 * inside the app, where a big footer under the board would just be in the way.
 */
export default function Footer({ compact = false }: { compact?: boolean }) {
  const { session } = useAuth()
  const year = new Date().getFullYear()

  const bottom = (
    <div className="footer-bottom">
      <p>
        <span>© {year} Shortlisted</span>
        <span>Built by {OWNER_NAME} in Sri&nbsp;Lanka</span>
      </p>
      <span className="version" title="App version">v{APP_VERSION}</span>
    </div>
  )

  if (compact) {
    return (
      <footer className="site-footer compact">
        <div className="footer-inner footer-compact">
          <Link to="/" className="footer-brand">
            <Logo size={22} />
            <span>Shortlisted</span>
          </Link>
          <nav className="footer-inline" aria-label="Footer">
            <Link to="/privacy">Privacy</Link>
            <a href={mailto}>Contact</a>
          </nav>
          {bottom}
        </div>
      </footer>
    )
  }

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-about">
            <Link to="/" className="footer-brand">
              <Logo size={28} />
              <span>Shortlisted</span>
            </Link>
            <p>A simple, private board for your job hunt. Track every application, never miss a follow-up.</p>
            <ul className="footer-tags" aria-label="Highlights">
              <li>Free</li>
              <li>Private</li>
              <li>No ads</li>
            </ul>
          </div>

          <nav className="footer-col" aria-label="Product">
            <h2>Product</h2>
            {session ? (
              <>
                <Link to="/">Your applications</Link>
                <Link to="/profile">Profile &amp; settings</Link>
              </>
            ) : (
              <>
                <Link to="/login?mode=signup">Create an account</Link>
                <Link to="/login">Sign in</Link>
              </>
            )}
          </nav>

          <nav className="footer-col" aria-label="Trust">
            <h2>Privacy</h2>
            <Link to="/privacy">Privacy policy</Link>
            <Link to={session ? '/profile' : '/privacy'}>Delete your data</Link>
          </nav>

          <div className="footer-col">
            <h2>Get in touch</h2>
            <p className="footer-muted">Questions, ideas or a bug to report?</p>
            <a className="footer-mail" href={mailto}>
              <MailIcon size={15} />
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
        {bottom}
      </div>
    </footer>
  )
}
