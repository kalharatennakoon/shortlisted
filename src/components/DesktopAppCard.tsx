import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { DESKTOP_DOWNLOADS } from '../lib/config'
import {
  desktop,
  downloadInstaller,
  isNewerVersion,
  latestDesktopVersion,
  publishedInstaller,
  type DesktopUpdateState,
  type PublishedInstaller,
} from '../lib/desktop'
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
        <DownloadProgress version={update?.latest} received={update?.received} total={update?.total} />
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

function DownloadProgress({ version, received = 0, total = 0 }: { version?: string; received?: number; total?: number }) {
  const percent = total ? Math.min(100, Math.round((received / total) * 100)) : 0
  return (
    <div className="update-progress-wrap">
      <p>Downloading version {version}…</p>
      <div className="update-progress" role="progressbar" aria-label="Download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="muted small">
        {megabytes(received)} of {megabytes(total)} · {percent}%
      </p>
    </div>
  )
}

type Manual =
  | { step: 'checking' }
  | { step: 'latest' }
  | { step: 'available'; installer: PublishedInstaller }
  | { step: 'downloading'; installer: PublishedInstaller; received: number }
  | { step: 'saved'; installer: PublishedInstaller; url: string }
  | { step: 'failed'; installer: PublishedInstaller }
  | { step: 'link'; version: string } // no latest.json: a plain link, as before

/**
 * Copies from before 1.0.3 can't update themselves. The page downloads the installer instead (with progress and a
 * checksum), then hands the finished file over to be saved. Opening it is up to the person, once.
 */
function ManualUpdate() {
  const [state, setState] = useState<Manual>({ step: 'checking' })
  const abort = useRef<AbortController | null>(null)
  const saveLink = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    void (async () => {
      const installer = await publishedInstaller(desktop!.platform)
      if (installer) {
        setState(isNewerVersion(installer.version, desktop!.version) ? { step: 'available', installer } : { step: 'latest' })
        return
      }
      const version = await latestDesktopVersion()
      setState(version && isNewerVersion(version, desktop!.version) ? { step: 'link', version } : { step: 'latest' })
    })()
    return () => abort.current?.abort()
  }, [])

  // Free the downloaded file when leaving the page
  const savedUrl = state.step === 'saved' ? state.url : null
  useEffect(() => () => {
    if (savedUrl) URL.revokeObjectURL(savedUrl)
  }, [savedUrl])

  // The "Save as" window opens once the file is complete
  useEffect(() => {
    if (state.step === 'saved') saveLink.current?.click()
  }, [state.step])

  async function download(installer: PublishedInstaller) {
    const controller = new AbortController()
    abort.current = controller
    setState({ step: 'downloading', installer, received: 0 })
    let shown = 0
    try {
      const blob = await downloadInstaller(
        installer,
        (received) => {
          if (Date.now() - shown < 120 && received < installer.size) return
          shown = Date.now()
          setState({ step: 'downloading', installer, received })
        },
        controller.signal,
      )
      setState({ step: 'saved', installer, url: URL.createObjectURL(blob) })
    } catch {
      setState(controller.signal.aborted ? { step: 'available', installer } : { step: 'failed', installer })
    }
  }

  const fileUrl = DESKTOP_DOWNLOADS[isMac ? 'mac' : 'windows']
  const steps = isMac
    ? 'open it, drag Shortlisted into Applications, choose Replace, then quit Shortlisted and open it again'
    : 'run it, then open Shortlisted again'
  const actionsRow = (children: ReactNode) => (
    <div className="settings-actions">
      <span className="spacer" />
      {children}
    </div>
  )

  switch (state.step) {
    case 'checking':
      return <p className="muted">Checking for updates…</p>
    case 'latest':
      return <p className="success">You have the latest version.</p>
    case 'link':
      return (
        <>
          <p>
            Version <strong>{state.version}</strong> is available. Download the installer and {steps}. Wait until it
            has finished downloading before opening it.
          </p>
          {actionsRow(<a className="link-button primary" href={fileUrl} download>Download version {state.version}</a>)}
        </>
      )
    case 'available':
      return (
        <>
          <p>
            Version <strong>{state.installer.version}</strong> is available ({megabytes(state.installer.size)}). This
            copy can't install it by itself: download it here, then {steps}. After that, updates install right here.
          </p>
          {actionsRow(
            <button type="button" className="primary" onClick={() => void download(state.installer)}>
              Download version {state.installer.version}
            </button>,
          )}
        </>
      )
    case 'downloading':
      return (
        <>
          <div aria-live="polite">
            <DownloadProgress version={state.installer.version} received={state.received} total={state.installer.size} />
          </div>
          {actionsRow(<button type="button" className="secondary" onClick={() => abort.current?.abort()}>Cancel</button>)}
        </>
      )
    case 'saved':
      return (
        <>
          <p className="success" role="status">
            Version {state.installer.version} is downloaded. Save it, then {steps}.
          </p>
          {actionsRow(
            <a ref={saveLink} className="link-button primary" href={state.url} download={state.installer.file}>
              Save the installer again
            </a>,
          )}
        </>
      )
    case 'failed':
      return (
        <>
          <p className="error" role="alert">The download didn't finish. Check your connection and try again.</p>
          {actionsRow(
            <button type="button" className="secondary" onClick={() => void download(state.installer)}>
              Try again
            </button>,
          )}
        </>
      )
  }
}
