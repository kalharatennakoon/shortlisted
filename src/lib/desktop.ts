// The Windows and Mac app (the `desktop/` folder) is this same site in its own window. Two things differ there:
// links to other sites open in the person's browser, and anything that comes back by email or from Google
// arrives in that browser, not in the app, and has to be handed over.

/** Where an update of the desktop app has got to (`updateState` in desktop/main.js). */
export interface DesktopUpdateState {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'installing' | 'manual' | 'error' | 'unsupported'
  /** The installed version */
  current: string
  /** The version on offer, once there is one */
  latest?: string
  /** Bytes so far and in all, while downloading (total is also there while available) */
  received?: number
  total?: number
  /** Which step failed */
  error?: 'check' | 'download' | 'install'
}

export type DesktopUpdateAction = 'state' | 'check' | 'download' | 'cancel' | 'install'

/** What the desktop app adds to the page (`desktop/preload.js`). Undefined in a normal browser. */
export interface DesktopBridge {
  platform: string
  version: string
  /** Opens an https or mailto link in the person's own browser or mail app. */
  openExternal: (url: string) => Promise<boolean>
  /** A sign-in link came back from the browser; `code` is null when it was no use. Returns "stop listening". */
  onAuthCallback: (callback: (auth: { code: string | null; flowId: string | null }) => void) => () => void
  /** Updates of the app itself. Missing before 1.0.3: those copies are updated by downloading the installer. */
  update?: (action: DesktopUpdateAction) => Promise<DesktopUpdateState | null>
  onUpdateState?: (callback: (state: DesktopUpdateState) => void) => () => void
}

export const desktop: DesktopBridge | undefined = (window as Window & { shortlistedDesktop?: DesktopBridge })
  .shortlistedDesktop

export const isDesktop = Boolean(desktop)

/**
 * True when `published` is a later version than `installed`: "1.0.10" is later than "1.0.9", "1.1" than "1.0.4".
 * Only later counts, never just different. The app shows whichever copy of the site it has loaded, and that copy
 * can be older than the app: a window left open over a release, or one opened again minutes after installing the
 * new version (the browser cache still holds the page that offered it). Text that isn't a version is never later.
 */
export function isNewerVersion(published: string, installed: string): boolean {
  const numbers = (version: string) => /^v?(\d+(?:\.\d+)*)/i.exec(version.trim())?.[1].split('.').map(Number)
  const a = numbers(published)
  const b = numbers(installed)
  if (!a || !b) return false
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}

/**
 * The version of the installers the site serves now, read from `downloads/version.txt` (put there by the deploy)
 * past every cache. The version built into the page is only as new as the page, and a window that stays open (on
 * a Mac, closing the window doesn't quit the app) keeps its page for days. Null when it can't be read.
 */
export async function latestDesktopVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}downloads/version.txt`, { cache: 'no-store' })
    if (!res.ok) return null
    const text = (await res.text()).trim()
    return /^\d+(\.\d+){0,3}$/.test(text) ? text : null
  } catch {
    return null
  }
}

/** Added to the address Supabase sends people back to when the desktop app asked (sign-in, reset, confirm). */
export const DESKTOP_PARAM = 'desktop'

/** Links starting with this open the desktop app; `desktop/main.js` reads them. */
const APP_LINK = 'shortlisted://'
/** The sign-up marker, CONFIRM_PARAM in lib/auth.tsx (which can't be imported here: it imports this file). */
const CONFIRMED = 'confirmed'

export interface DesktopReturn {
  kind: 'code' | 'confirmed' | 'error'
  /** Opens the desktop app, carrying the sign-in code when there is one. */
  link: string
  /** Supabase's own words for what went wrong (expired link, sign-in cancelled…). */
  problem: string | null
}

/**
 * Set when this page was opened, in a browser, by a link the desktop app asked for. The page then shows
 * "go back to the app" (pages/DesktopReturn.tsx) instead of the site, and must not use the code itself: only
 * the app holds the secret that goes with it (PKCE), and a code works once.
 *
 * Read once, as this file loads, and taken out of the address bar straight away. `supabase.ts` imports this
 * file before it creates the client, so the library never sees the code.
 */
export const desktopReturn: DesktopReturn | null = (() => {
  const params = new URLSearchParams(window.location.search)
  if (isDesktop || !params.has(DESKTOP_PARAM)) return null

  const code = params.get('code')
  const problem = params.get('error_description')?.replace(/\+/g, ' ') ?? null
  const url = new URL(window.location.href)
  ;[DESKTOP_PARAM, CONFIRMED, 'code', 'sb_flow_id', 'error', 'error_code', 'error_description'].forEach((k) =>
    url.searchParams.delete(k),
  )
  window.history.replaceState(window.history.state, '', url.toString())

  if (problem) return { kind: 'error', link: `${APP_LINK}auth?error=1`, problem }
  // A confirmed sign-up needs no code: the address is confirmed by now, and the app asks them to sign in.
  if (params.has(CONFIRMED)) return { kind: 'confirmed', link: `${APP_LINK}open`, problem: null }
  if (code) {
    // sb_flow_id: which of the app's sign-ins this answers, if the library was set up to send it
    const link = new URLSearchParams({ code })
    const flow = params.get('sb_flow_id')
    if (flow) link.set('flow', flow)
    return { kind: 'code', link: `${APP_LINK}auth?${link}`, problem: null }
  }
  return { kind: 'error', link: `${APP_LINK}open`, problem: null }
})()

/** Shown in the app when a link came back without a usable code, or the code was refused. */
export const DESKTOP_LINK_FAILED = "That didn't work. The link may have expired or been used already. Please try again."
