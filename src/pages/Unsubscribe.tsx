import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Icons'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { unsubscribe } from '../lib/reminders'

/**
 * #/unsubscribe?token=… (link in every reminder email). Works signed out. Needs a click rather than
 * unsubscribing on load, so link scanners that open emails don't switch reminders off by accident.
 */
export default function Unsubscribe() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { session } = useAuth()
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onClick() {
    setState('busy')
    setError(null)
    try {
      await unsubscribe(token)
      setState('done')
    } catch (e) {
      setError(errorMessage(e))
      setState('idle')
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-brand">
          <Logo size={44} />
          <h1>{state === 'done' ? "You're unsubscribed" : 'Stop reminder emails?'}</h1>
        </div>
        {state === 'done' ? (
          <p className="muted center-text">
            You won't get reminder emails any more. You can turn them back on anytime in{' '}
            <strong>Profile &amp; settings</strong>.
          </p>
        ) : !token ? (
          <p className="error">This link is missing its code. Use the link in the latest reminder email, or turn reminders off in Profile &amp; settings.</p>
        ) : (
          <>
            <p className="muted center-text">You'll stop getting the daily next-step reminders from Shortlisted. Your applications aren't affected.</p>
            {error && <p className="error">{error}</p>}
            <button className="primary" onClick={onClick} disabled={state === 'busy'}>
              {state === 'busy' ? 'Unsubscribing…' : 'Stop reminder emails'}
            </button>
          </>
        )}
        <p className="auth-foot">
          <Link to={session ? '/profile' : '/'}>{session ? 'Go to Profile & settings' : 'Go to Shortlisted'}</Link>
        </p>
      </div>
    </div>
  )
}
