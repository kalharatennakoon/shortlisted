import { useEffect } from 'react'
import { Logo } from '../components/Icons'
import type { DesktopReturn as Back } from '../lib/desktop'
import { appUrl } from '../lib/supabase'

const TEXT: Record<Back['kind'], { title: string; body: string }> = {
  code: { title: 'One more step', body: 'Go back to the Shortlisted app to finish.' },
  confirmed: { title: 'Your email is confirmed', body: 'Go back to the Shortlisted app and sign in.' },
  error: { title: "That link didn't work", body: 'Go back to the Shortlisted app and try again.' },
}

/**
 * Shown in a browser, instead of the site, when the desktop app asked for the link that was just opened: a
 * Google sign-in, a password reset or a sign-up confirmation (see lib/desktop.ts). It opens the app; the
 * button is for browsers that want a click first, and for when their "Open Shortlisted?" question was dismissed.
 */
export default function DesktopReturn({ back }: { back: Back }) {
  useEffect(() => {
    if (back.kind !== 'error') window.location.href = back.link
  }, [back])

  const { title, body } = TEXT[back.kind]
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-brand">
          <Logo size={40} />
          <h1>{title}</h1>
          <p className="muted">{back.problem ?? body}</p>
          {back.problem && <p className="muted">{body}</p>}
        </div>
        <a className="btn primary" href={back.link}>Open Shortlisted</a>
        <p className="auth-foot">
          Nothing happens? Open this link on the computer where the Shortlisted app is installed, and allow your
          browser to open it. <a href={appUrl()}>Use Shortlisted in the browser instead</a>
        </p>
      </div>
    </div>
  )
}
