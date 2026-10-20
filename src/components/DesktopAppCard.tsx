import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { DESKTOP_DOWNLOADS } from '../lib/config'
import { desktop, isNewerVersion, latestDesktopVersion, type DesktopUpdateState } from '../lib/desktop'
import { MonitorIcon } from './Icons'

const megabytes = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const isMac = desktop?.platform === 'darwin'
const system = isMac ? 'Mac' : 'Windows'

/**
 * Settings card, only in the desktop app: the version installed, "Check for updates", then download (with
 * progress), install and start again. The work happens in desktop/main.js; this only shows where it has got to.
 */
export default function DesktopAppCard() {
  const { state } = useLocation() as { state: { section?: string } | null }
  const card = useRef<HTMLElement>(null)

  // "Update the desktop app" in the footer comes here
  useEffect(() => {
    if (state?.section === 'desktop') card.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [state])

  if (!desktop) return null
  return (
    <section className="card settings-card" id="desktop" ref={card}>
      <header className="settings-head">
        <span className="settings-icon"><MonitorIcon size={18} /></span>
        <div>
          <h2>Desktop app</h2>
          <p className="muted small">Shortlisted for {system}, version {desktop.version || 'unknown'}.</p>
        </div>
      </header>
      {desktop.update ? <Updater /> : <ManualUpdate />}
    </section>
  )
}

function Updater() {
  const [update, setUpdate] = useState<DesktopUpdateState | null>(null)

  useEffect(() => {
    const bridge = desktop!
    const stop = bridge.onUpdateState!(setUpdate)
    // Check on opening the page, unless something is already under way
    void bridge.update!('state').then((s) => {
      if (!s || ['idle', 'up-to-date', 'error'].includes(s.status)) void bridge.update!('check')
      else setUpdate(s)
    })
    return stop
  }, [])

  const act = (action: 'check' | 'download' | 'cancel' | 'install') => void desktop!.update!(action).then((s) => s && setUpdate(s))
  const status = update?.status ?? 'checking'
  const percent = update?.total ? Math.min(100, Math.round(((update.received ?? 0) / update.total) * 100)) : 0

  let message: ReactNode
  let actions: ReactNode = null
  switch (status) {
    case 'checking':
    case 'idle':
      message = <p className="muted">Checking for updates…</p>
      break
    case 'up-to-date':
      message = <p className="success">You have the latest version.</p>
      actions = <button type="button" className="secondary" onClick={() => act('check')}>Check for updates</button>
      break
    case 'available':
      message = (
        <p>
          Version <strong>{update?.latest}</strong> is available ({megabytes(update?.total)}).
        </p>
      )
      actions = <button type="button" className="primary" onClick={() => act('download')}>Download update</button>
      break
    case 'downloading':
      message = (
        <div className="update-progress-wrap">
          <p>Downloading version {update?.latest}…</p>
          <div
            className="update-progress"
            role="progressbar"
            aria-label="Download progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="muted small">
            {megabytes(update?.received)} of {megabytes(update?.total)} · {percent}%
          </p>
        </div>
      )
      actions = <button type="button" className="secondary" onClick={() => act('cancel')}>Cancel</button>
      break
    case 'ready':
      message = (
        <p>
          Version <strong>{update?.latest}</strong> is downloaded. Shortlisted will close, update and open again.
        </p>
      )
      actions = <button type="button" className="primary" onClick={() => act('install')}>Install and restart</button>
      break
    case 'installing':
      message = <p className="muted">Installing… Shortlisted will open again in a moment.</p>
      break
    case 'manual':
      message = isMac ? (
        <p>
          The update couldn't be put in place by itself, so it's open in Finder: drag <strong>Shortlisted</strong> into
          Applications, choose <strong>Replace</strong>, then quit Shortlisted and open it again.
        </p>
      ) : (
        <p>The installer is open: follow its steps, then open Shortlisted again.</p>
      )
      break
    case 'unsupported':
      message = <p className="muted">Updates aren't available on this system.</p>
      break
    case 'error':
      message = (
        <p className="error" role="alert">
          {update?.error === 'download'
            ? "The download didn't finish. Check your connection and try again."
            : update?.error === 'install'
              ? 'Only an installed copy of Shortlisted can update itself.'
              : "Couldn't check for updates. Check your connection and try again."}
        </p>
      )
      actions = <button type="button" className="secondary" onClick={() => act('check')}>Try again</button>
      break
  }

  return (
    <>
      <div aria-live="polite">{message}</div>
      {actions && (
        <div className="settings-actions">
          <span className="spacer" />
          {actions}
        </div>
      )}
    </>
  )
}

/** Copies from before 1.0.3 can't update themselves: offer the installer once, and say what comes after. */
function ManualUpdate() {
  const [latest, setLatest] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    void latestDesktopVersion().then(setLatest)
  }, [])

  if (latest === undefined) return <p className="muted">Checking for updates…</p>
  if (!latest || !isNewerVersion(latest, desktop!.version)) return <p className="success">You have the latest version.</p>
  return (
    <>
      <p>
        Version <strong>{latest}</strong> is available. This copy can't update itself, so download the installer once
        {isMac ? ', open it, drag Shortlisted into Applications and choose Replace' : ' and run it'}. After that,
        updates download and install right here.
      </p>
      <div className="settings-actions">
        <span className="spacer" />
        <a className="link-button primary" href={DESKTOP_DOWNLOADS[isMac ? 'mac' : 'windows']} download>
          Download version {latest}
        </a>
      </div>
    </>
  )
}
