import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AccountMenu from './AccountMenu'
import Footer from './Footer'
import { Logo } from './Icons'

/** Signed-in page frame: sticky top bar (logo + account menu), content, footer. */
export default function AppShell({ children }: { children: ReactNode }) {
  const nav = useRef<HTMLElement>(null)
  // Share the bar's height as --nav-h so sticky things (the table header) sit just below it
  useLayoutEffect(() => {
    const el = nav.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--nav-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="app">
      <nav className="navbar" ref={nav}>
        <div className="navbar-inner">
          <Link to="/" className="brand" aria-label="Shortlisted home">
            <Logo size={30} />
            <span>Shortlisted</span>
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
