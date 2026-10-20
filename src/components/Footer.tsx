import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { APP_VERSION, CONTACT_EMAIL, DESKTOP_VERSION, OWNER_NAME } from '../lib/config'
import { desktop, isDesktop, isNewerVersion, latestDesktopVersion } from '../lib/desktop'
import { Logo, MailIcon } from './Icons'

const mailto = `mailto:${CONTACT_EMAIL}?subject=Shortlisted`

// The desktop app shows this site, so the site itself is always current; only its window ("shell") can be out
// of date. When a newer installer has been published, point to the Desktop app card in settings, which updates it.
// Newer, not merely different: someone on the latest version must never be told to update.
// The version built into the page answers at once; the published one is asked for again whenever the window
// comes back into view, so a window left open over a release still finds out.
const RECHECK_MS = 10 * 60 * 1000

function useDesktopUpdate(): boolean {
  const [published, setPublished] = useState(DESKTOP_VERSION)
  useEffect(() => {
    if (!desktop) return
    let last = 0
    const check = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < RECHECK_MS) return
      last = Date.now()
      void latestDesktopVersion().then((v) => v && setPublished(v))
    }
    check()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return Boolean(desktop && published && isNewerVersion(published, desktop.version))
}

/**
 * Site footer. The full version (landing, privacy) has link columns; `compact` is a slim bar for
 * inside the app, where a big footer under the board would just be in the way.
 */
export default function Footer({ compact = false }: { compact?: boolean }) {
  const { session } = useAuth()
  const desktopUpdate = useDesktopUpdate()
  const year = new Date().getFullYear()

  const bottom = (
    <div className="footer-bottom">
      <p>
        <span>© {year} Shortlisted</span>
        <span>Built by {OWNER_NAME} in Sri&nbsp;Lanka</span>
      </p>
      {/* In the desktop app, its own window has a version of its own (desktop/package.json) */}
      <span className="version" title="App version">
        v{APP_VERSION}
        {desktop?.version && ` · Desktop app ${desktop.version}`}
      </span>
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
            {desktopUpdate && <Link to="/profile" state={{ section: 'desktop' }}>Update the desktop app</Link>}
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
            {/* the card is on the landing page, which signed-in people don't see: it shows when they sign out */}
            {DESKTOP_VERSION && !isDesktop && !session && <Link to="/" state={{ section: 'desktop' }}>Windows and Mac app</Link>}
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
