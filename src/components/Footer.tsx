import { Link } from 'react-router-dom'
import { APP_VERSION, CONTACT_EMAIL, OWNER_NAME } from '../lib/config'
import { Logo } from './Icons'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <Logo size={22} />
          <span>Job Tracker</span>
          <span className="version">v{APP_VERSION}</span>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <Link to="/privacy">Privacy</Link>
          <a href={`mailto:${CONTACT_EMAIL}?subject=Job%20Tracker`}>Contact</a>
          <span>Built by {OWNER_NAME}</span>
        </nav>
        <p className="footer-copy">© {new Date().getFullYear()} Job Tracker</p>
      </div>
    </footer>
  )
}
