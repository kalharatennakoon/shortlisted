import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
import { releasesBetween } from '../lib/desktopReleases'
import { CheckIcon, DownloadIcon, MonitorIcon } from './Icons'

const megabytes = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const isMac = desktop?.platform === 'darwin'
const system = isMac ? 'Mac' : 'Windows'

/**
 * Settings card, only in the desktop app: the version installed, "Check for updates", then download (with
 * progress), install and start again. The work happens in desktop/main.js; this only shows where it has got to.
 */
export default function DesktopAppCard() {
  if (!desktop) return null
  return (
    <section className="card settings-card" id="desktop">
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

/** A check that answers at once would flash "Checking…" for a frame: it stays up at least this long. */
const MIN_CHECKING_MS = 900

/**
 * The update state from desktop/main.js, steadied for showing: a check's answer waits until "Checking…" has been
 * on screen for MIN_CHECKING_MS, so the card doesn't flicker between messages.
 */
function useUpdateState() {
  const [state, setState] = useState<DesktopUpdateState | null>(null)
  const checkStarted = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((next: DesktopUpdateState) => {
    window.clearTimeout(timer.current)
    if (next.status === 'checking') {
      if (!checkStarted.current) checkStarted.current = Date.now()
      setState(next)
      return
    }
    const wait = checkStarted.current + MIN_CHECKING_MS - Date.now()
    const apply = () => {
      checkStarted.current = 0
      setState(next)
    }
    if (checkStarted.current && wait > 0) timer.current = window.setTimeout(apply, wait)
    else apply()
  }, [])

  const startCheck = useCallback(() => {
    show({ status: 'checking', current: desktop!.version })
    void desktop!.update!('check').then((s) => s && show(s))
  }, [show])

  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { state, show, startCheck }
}

function Updater() {
  const { state: update, show, startCheck } = useUpdateState()

  useEffect(() => {
    const bridge = desktop!
    const stop = bridge.onUpdateState!(show)
    // Check on opening the page, unless something is already under way
    void bridge.update!('state').then((s) => {
      if (!s || ['idle', 'up-to-date', 'error'].includes(s.status)) startCheck()
      else show(s)
    })
    return stop
  }, [show, startCheck])

  const act = (action: 'download' | 'cancel' | 'install') => void desktop!.update!(action).then((s) => s && show(s))
  const status = update?.status ?? 'checking'
  const installed = desktop!.version
  const notes = update?.latest && ['available', 'downloading', 'ready'].includes(status)
    ? <WhatsNew installed={installed} latest={update.latest} />
    : null

  let tone: StatusTone = 'busy'
  let title: ReactNode
  let detail: ReactNode = null
  let body: ReactNode = null
  let actions: ReactNode = null
  switch (status) {
    case 'checking':
    case 'idle':
      title = 'Checking for updates…'
      detail = `You have version ${installed}.`
      actions = <button type="button" className="secondary" disabled>Checking…</button>
      break
    case 'up-to-date':
      tone = 'ok'
      title = 'You have the latest version'
      detail = `Version ${installed}${update?.checkedAt ? ` · checked at ${checkedTime(update.checkedAt)}` : ''}.`
      actions = <button type="button" className="secondary" onClick={startCheck}>Check for updates</button>
      break
    case 'available':
      tone = 'new'
      title = <>Version {update?.latest} is available</>
      detail = `You have version ${installed} · download ${megabytes(update?.total)}.`
      actions = <button type="button" className="primary" onClick={() => act('download')}>Download update</button>
      break
    case 'downloading':
      tone = 'new'
      title = <>Downloading version {update?.latest}…</>
      body = <DownloadProgress received={update?.received} total={update?.total} />
      actions = <button type="button" className="secondary" onClick={() => act('cancel')}>Cancel</button>
      break
    case 'ready':
      tone = 'new'
      title = <>Version {update?.latest} is ready to install</>
      detail = 'Shortlisted will close, update and open again.'
      actions = <button type="button" className="primary" onClick={() => act('install')}>Install and restart</button>
      break
    case 'installing':
      title = 'Installing…'
      detail = 'Shortlisted will open again in a moment.'
      actions = <button type="button" className="secondary" disabled>Installing…</button>
      break
    case 'manual':
      tone = 'new'
      title = <>Version {update?.latest} is downloaded</>
      detail = isMac ? (
        <>
          It couldn't be put in place by itself, so it's open in Finder: drag <strong>Shortlisted</strong> into
          Applications, choose <strong>Replace</strong>, then quit Shortlisted and open it again.
        </>
      ) : (
        'The installer is open: follow its steps, then open Shortlisted again.'
      )
      break
    case 'unsupported':
      tone = 'bad'
      title = "Updates aren't available on this system"
      break
    case 'error':
      tone = 'bad'
      title =
        update?.error === 'download'
          ? "The download didn't finish"
          : update?.error === 'install'
            ? "This copy can't update itself"
            : "Couldn't check for updates"
      detail =
        update?.error === 'install'
          ? 'Only an installed copy of Shortlisted can update itself.'
          : 'Check your connection and try again.'
      actions = <button type="button" className="secondary" onClick={startCheck}>Try again</button>
      break
  }

  return (
    <>
      <UpdateStatus tone={tone} title={title} detail={detail} alert={status === 'error'}>
        {body}
      </UpdateStatus>
      {notes}
      {actions && (
        <div className="settings-actions">
          <span className="spacer" />
          {actions}
        </div>
      )}
    </>
  )
}

type StatusTone = 'busy' | 'ok' | 'new' | 'bad'

const checkedTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** One steady row: an icon for the kind of news, a short title and a line under it. */
function UpdateStatus({ tone, title, detail, alert, children }: {
  tone: StatusTone
  title: ReactNode
  detail?: ReactNode
  alert?: boolean
  children?: ReactNode
}) {
  return (
    <div className={`update-status ${tone}`} role={alert ? 'alert' : 'status'} aria-live="polite">
      <span className="update-status-icon" aria-hidden="true">
        {tone === 'busy' ? <span className="update-spinner" /> : tone === 'ok' ? <CheckIcon size={15} /> : tone === 'new' ? <DownloadIcon size={15} /> : '!'}
      </span>
      <div className="update-status-text">
        <p className="update-status-title">{title}</p>
        {detail && <p className="muted small">{detail}</p>}
        {children}
      </div>
    </div>
  )
}

/** "What's new" for every version between the installed one and the one on offer, newest first. */
function WhatsNew({ installed, latest }: { installed: string; latest: string }) {
  const releases = releasesBetween(installed, latest)
  if (!releases.length) return null
  const several = releases.length > 1
  return (
    <div className="update-notes">
      <h3>What's new</h3>
      {releases.map((r) => (
        <div key={r.version}>
          {several && <p className="update-notes-version">Version {r.version}</p>}
          <ul>
            {r.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}

function DownloadProgress({ version, received = 0, total = 0 }: { version?: string; received?: number; total?: number }) {
  const percent = total ? Math.min(100, Math.round((received / total) * 100)) : 0
  return (
    <div className="update-progress-wrap">
      {version && <p>Downloading version {version}…</p>}
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
          <WhatsNew installed={desktop!.version} latest={state.version} />
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
          <WhatsNew installed={desktop!.version} latest={state.installer.version} />
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
