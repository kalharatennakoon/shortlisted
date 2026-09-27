import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AccountMenu from './AccountMenu'
import Footer from './Footer'
import { Logo } from './Icons'

/** Signed-in page frame: sticky top bar (logo + account menu), content, footer. */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/" className="brand" aria-label="Job Tracker home">
            <Logo size={30} />
            <span>Job Tracker</span>
          </Link>
          <span className="spacer" />
          <AccountMenu />
        </div>
      </nav>
      <main className="page">{children}</main>
      <Footer compact />
    </div>
  )
}
