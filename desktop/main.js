'use strict'

// Shortlisted for Windows and Mac: a window onto the live site, so the desktop app is always the
// current version and nothing has to be shipped again when the web app changes.
// What this file adds: its own window and icon, links that open in the person's browser, sign-in
// links that come back from the browser (shortlisted://), downloads, updates of the app itself, and
// a page for when the site can't be reached.

const { app, BrowserWindow, Menu, ipcMain, net, screen, session, shell } = require('electron')
const { execFile, spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { promisify } = require('node:util')

/** The site. Change it here if the address changes, then ship a new installer (see README.md). */
const LIVE_URL = 'https://kalharatennakoon.github.io/shortlisted/'
const CONTACT_EMAIL = 'kalharatennakoonmck@gmail.com'
/** Links that start with shortlisted:// open this app (registered by the installers). */
const PROTOCOL = 'shortlisted'

// `npm start` can show a local copy instead: SHORTLISTED_URL=http://localhost:5173/ npm start
const APP_URL = new URL((!app.isPackaged && process.env.SHORTLISTED_URL) || LIVE_URL)
const OFFLINE_PAGE = path.join(__dirname, 'offline.html')

let mainWindow = null
/** A sign-in link that arrived before the page was ready to take it. */
let pendingAuth = null

// ---------- which addresses belong to the app ----------

function parse(url) {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** True for the app's own pages. The host also serves other sites, so the path has to match too. */
function isAppUrl(url) {
  const u = parse(url)
  return Boolean(u && u.origin === APP_URL.origin && u.pathname.startsWith(APP_URL.pathname))
}

function isOfflinePage(url) {
  const u = parse(url)
  return Boolean(u && u.protocol === 'file:' && path.normalize(decodeURIComponent(u.pathname)).endsWith('offline.html'))
}

/** Somewhere that isn't the app: hand it to the browser or mail app instead of showing it in the window. */
function openOutside(url, contents) {
  const u = parse(url)
  if (!u) return
  if (u.protocol === 'mailto:') {
    shell.openExternal(url)
    return
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return // about:blank, javascript:, file: …
  // "Download" on a document is a signed Storage link that asks to be saved: keep that in the app.
  if (contents && u.pathname.includes('/storage/v1/object/') && u.searchParams.has('download')) {
    contents.downloadURL(url)
    return
  }
  shell.openExternal(url)
}

// ---------- sign-in links coming back from the browser ----------

/**
 * shortlisted://auth?code=…  finishes a Google sign-in or password reset that this app started
 * shortlisted://open         just brings the window forward
 * Only the code (and Supabase's flow id, when it sends one) is passed on, never text to display.
 * The code is useless without the matching secret this app kept when it started the sign-in, so
 * a link made by someone else can't sign anyone in.
 */
function handleDeepLink(raw) {
  const u = parse(raw)
  if (!u || u.protocol !== `${PROTOCOL}:`) return
  showWindow()
  if (u.hostname !== 'auth') return
  const code = u.searchParams.get('code')
  const flow = u.searchParams.get('flow')
  pendingAuth = {
    code: code && code.length <= 512 ? code : null,
    flowId: flow && /^[a-zA-Z0-9_-]{8,64}$/.test(flow) ? flow : null,
  }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:auth-callback')
}

const deepLinkIn = (argv) => argv.find((a) => a.startsWith(`${PROTOCOL}://`))

// ---------- window ----------

const stateFile = () => path.join(app.getPath('userData'), 'window.json')

function readWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    const ok = [s.x, s.y, s.width, s.height].every(Number.isFinite)
    // Ignore a position on a screen that is no longer plugged in.
    const visible = ok && screen.getAllDisplays().some(({ workArea: a }) =>
      s.x < a.x + a.width - 80 && s.x + s.width > a.x + 80 && s.y >= a.y - 10 && s.y < a.y + a.height - 80)
    return visible ? s : null
  } catch {
    return null
  }
}

function saveWindowState(win) {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }))
  } catch {
    // not worth interrupting anyone over
  }
}

/** Shared by the main window and any second window the app opens. */
const windowOptions = () => ({
  title: 'Shortlisted',
  backgroundColor: '#ffffff',
  autoHideMenuBar: true, // Windows: no menu bar under the title (Alt shows it); macOS ignores this
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    additionalArguments: [`--shortlisted-desktop=${app.getVersion()}`],
  },
})

function createWindow() {
  const state = readWindowState()
  const win = new BrowserWindow({
    ...windowOptions(),
    width: 1320,
    height: 880,
    ...(state ? { x: state.x, y: state.y, width: state.width, height: state.height } : {}),
    minWidth: 380,
    minHeight: 560,
    show: false,
  })
  mainWindow = win
  if (state?.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())
  win.on('close', () => saveWindowState(win))
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  loadSite(win.webContents)
  return win
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (app.isReady()) createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// A failed load is reported by 'did-fail-load' below, which shows the offline page; nothing more to do here.
const quiet = () => {}
const loadSite = (contents) => contents.loadURL(APP_URL.href).catch(quiet)
const loadOffline = (contents, extra = {}) =>
  contents.loadFile(OFFLINE_PAGE, { query: { site: LIVE_URL, ...extra } }).catch(quiet)

/** Rules for every page the app shows, including second windows it opens. */
function protect(contents) {
  // The window only ever shows the app. Anything else goes to the browser.
  const stayInApp = (event, url) => {
    if (isAppUrl(url) || isOfflinePage(url)) return
    event.preventDefault()
    openOutside(url, contents)
  }
  contents.on('will-navigate', stayInApp)
  contents.on('will-redirect', stayInApp)

  // New tabs: the app's own pages (e.g. "Manage documents") get a second window, signed in like
  // the first; everything else opens in the browser.
  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) return { action: 'allow', overrideBrowserWindowOptions: { ...windowOptions(), width: 1100, height: 800 } }
    openOutside(url, contents)
    return { action: 'deny' }
  })

  contents.on('context-menu', (_event, params) => showContextMenu(contents, params))

  // No connection, or the site didn't answer: show the bundled page with a "Try again" button.
  contents.on('did-fail-load', (_event, errorCode, _description, url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* cancelled, e.g. by a download */ || isOfflinePage(url)) return
    loadOffline(contents)
  })
  contents.on('did-navigate', (_event, url, httpResponseCode) => {
    if (isAppUrl(url) && httpResponseCode >= 400) loadOffline(contents, { moved: '1' })
  })
}

// ---------- right-click menu ----------

/** Electron has no right-click menu of its own: give text fields the usual one, with spelling fixes. */
function showContextMenu(contents, params) {
  const items = []
  for (const word of params.dictionarySuggestions.slice(0, 5)) {
    items.push({ label: word, click: () => contents.replaceMisspelling(word) })
  }
  if (items.length) items.push({ type: 'separator' })
  if (params.isEditable) {
    items.push({ role: 'cut', enabled: params.editFlags.canCut }, { role: 'copy', enabled: params.editFlags.canCopy })
    items.push({ role: 'paste', enabled: params.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll' })
  } else if (params.selectionText.trim()) {
    items.push({ role: 'copy' })
  }
  if (items.length) Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(contents) ?? undefined })
}

// ---------- downloads ----------

function uniquePath(dir, name) {
  const { name: base, ext } = path.parse(name)
  let candidate = path.join(dir, name)
  for (let n = 1; fs.existsSync(candidate); n++) candidate = path.join(dir, `${base} (${n})${ext}`)
  return candidate
}

/**
 * CSV exports and documents get the usual "Save as" window. A calendar file (.ics) is what
 * "Add to calendar" makes: save it to Downloads and open it, so the event lands in the person's
 * calendar app in one click. If nothing on the computer opens .ics files, show the file instead.
 */
function handleDownload(_event, item) {
  const name = path.basename(item.getFilename())
  if (path.extname(name).toLowerCase() !== '.ics') return
  const folder = app.getPath('downloads')
  try {
    fs.mkdirSync(folder, { recursive: true })
  } catch {
    return // no Downloads folder to write to: fall back to the "Save as" window
  }
  const target = uniquePath(folder, name)
  item.setSavePath(target)
  item.once('done', async (_e, state) => {
    if (state !== 'completed') return
    const problem = await shell.openPath(target)
    if (problem) shell.showItemInFolder(target)
  })
}

// ---------- updates of the app itself ----------
//
// The site is always current; only this window around it needs updating. The deploy publishes
// downloads/latest.json next to the installers (see .github/workflows/desktop.yml):
//   { "version": "1.0.3", "mac": { "file", "size", "sha256" }, "windows": { … } }
// The page can only ask for "check", "download", "cancel" or "install": the address, the file and its
// checksum come from that list, never from the page.
//
// There is no paid certificate, so macOS's own updater (which needs one) can't be used. Instead:
// - Mac: open the .dmg out of sight, copy the new app next to the old one, swap the two, start again.
//   When the app's folder can't be written to (or it runs from the .dmg itself) the .dmg is opened in
//   Finder for the person to drag across, as on first install.
// - Windows: run the downloaded setup silently; it closes this copy, installs and opens the new one.

const run = promisify(execFile)
const UPDATE_KEYS = { darwin: 'mac', win32: 'windows' }
const updateDir = () => path.join(app.getPath('temp'), 'shortlisted-update')

/** True when `published` is later than `installed` (the same rule as isNewerVersion in src/lib/desktop.ts). */
function isNewerVersion(published, installed) {
  const numbers = (v) => /^v?(\d+(?:\.\d+)*)/i.exec(String(v).trim())?.[1].split('.').map(Number)
  const a = numbers(published)
  const b = numbers(installed)
  if (!a || !b) return false
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

/** What the settings page shows. `error` says which step failed: check, download or install. */
let updateState = { status: 'idle', current: app.getVersion() }
/** The version on offer: { version, url, size, sha256 } from latest.json */
let offered = null
let downloaded = null // path of the checked installer
let downloadAbort = null

function setUpdate(next) {
  updateState = { current: app.getVersion(), ...next }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('desktop:update-state', updateState)
  }
  return updateState
}

async function checkForUpdate() {
  if (['checking', 'downloading', 'ready', 'installing'].includes(updateState.status)) return updateState
  const key = UPDATE_KEYS[process.platform]
  if (!key) return setUpdate({ status: 'unsupported' })
  setUpdate({ status: 'checking' })
  try {
    const list = new URL('downloads/latest.json', APP_URL)
    list.searchParams.set('t', String(Date.now())) // past every cache
    const res = await net.fetch(list.href, { cache: 'no-store' })
    if (!res.ok) throw new Error(`latest.json: ${res.status}`)
    const data = await res.json()
    const entry = data?.[key]
    const ok =
      typeof data?.version === 'string' && /^\d+(\.\d+){0,3}$/.test(data.version) &&
      /^[\w.-]+$/.test(entry?.file ?? '') && /^[a-f0-9]{64}$/.test(entry?.sha256 ?? '') &&
      Number.isSafeInteger(entry?.size) && entry.size > 0
    if (!ok) throw new Error('latest.json is not in the expected shape')
    if (!isNewerVersion(data.version, app.getVersion())) return setUpdate({ status: 'up-to-date', checkedAt: Date.now() })
    offered = { version: data.version, url: new URL(`downloads/${entry.file}`, APP_URL).href, size: entry.size, sha256: entry.sha256, file: entry.file }
    return setUpdate({ status: 'available', latest: offered.version, total: offered.size })
  } catch (error) {
    console.error('Update check failed:', error)
    return setUpdate({ status: 'error', error: 'check' })
  }
}

async function downloadUpdate() {
  if (!offered || updateState.status !== 'available') return
  const update = offered
  const controller = new AbortController()
  downloadAbort = controller
  const dir = updateDir()
  const target = path.join(dir, update.file)
  let out = null
  setUpdate({ status: 'downloading', latest: update.version, received: 0, total: update.size })
  try {
    await fs.promises.rm(dir, { recursive: true, force: true })
    await fs.promises.mkdir(dir, { recursive: true })
    const res = await net.fetch(`${update.url}?v=${update.version}`, { cache: 'no-store', signal: controller.signal })
    if (!res.ok || !res.body) throw new Error(`download: ${res.status}`)
    const hash = crypto.createHash('sha256')
    out = fs.createWriteStream(target)
    let received = 0
    let shown = 0
    for await (const chunk of res.body) {
      received += chunk.length
      if (received > update.size) throw new Error('download is larger than expected')
      hash.update(chunk)
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve))
      if (Date.now() - shown > 120) {
        shown = Date.now()
        setUpdate({ status: 'downloading', latest: update.version, received, total: update.size })
      }
    }
    await new Promise((resolve, reject) => out.end((error) => (error ? reject(error) : resolve())))
    if (received !== update.size || hash.digest('hex') !== update.sha256) throw new Error('download is damaged')
    downloaded = target
    setUpdate({ status: 'ready', latest: update.version })
  } catch (error) {
    out?.destroy()
    await fs.promises.rm(target, { force: true }).catch(quiet)
    if (controller.signal.aborted) setUpdate({ status: 'available', latest: update.version, total: update.size })
    else {
      console.error('Update download failed:', error)
      setUpdate({ status: 'error', error: 'download', latest: update.version })
    }
  } finally {
    downloadAbort = null
  }
}

const writable = (p) => {
  try {
    fs.accessSync(p, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** /Applications/Shortlisted.app, worked out from the running program inside it. */
const macBundle = () => path.resolve(process.execPath, '../../..')
const asideOf = (bundle, what) => path.join(path.dirname(bundle), `.${path.basename(bundle, '.app')}-${what}.app`)

async function installMac(dmg) {
  const bundle = macBundle()
  const replaceable =
    bundle.endsWith('.app') && !bundle.startsWith('/Volumes/') && !bundle.includes('/AppTranslocation/') &&
    writable(path.dirname(bundle)) && writable(bundle)
  if (!replaceable) {
    await shell.openPath(dmg)
    return setUpdate({ status: 'manual', latest: offered?.version })
  }
  const mount = path.join(updateDir(), 'mount')
  const staged = asideOf(bundle, 'update')
  await fs.promises.rm(staged, { recursive: true, force: true })
  await run('hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount])
  try {
    const name = (await fs.promises.readdir(mount)).find((f) => f.endsWith('.app'))
    if (!name) throw new Error('no app in the disk image')
    await run('ditto', [path.join(mount, name), staged])
  } finally {
    await run('hdiutil', ['detach', mount, '-force']).catch(quiet)
  }
  await run('codesign', ['--verify', '--deep', '--strict', staged]) // copied whole and unchanged
  // Swap: the running copy keeps working from the files it has open; the old one is removed at the next start.
  const old = asideOf(bundle, 'old')
  await fs.promises.rm(old, { recursive: true, force: true })
  await fs.promises.rename(bundle, old)
  try {
    await fs.promises.rename(staged, bundle)
  } catch (error) {
    await fs.promises.rename(old, bundle)
    throw error
  }
  app.relaunch() // the same path, now the new version
  app.exit(0)
  return updateState
}

function installWindows(exe) {
  // The installer's own switches: an update, no questions, open the app when done.
  spawn(exe, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
  setTimeout(() => app.quit(), 300)
  return updateState
}

async function installUpdate() {
  if (updateState.status !== 'ready' || !downloaded) return updateState
  if (!app.isPackaged) return setUpdate({ status: 'error', error: 'install', latest: offered?.version })
  setUpdate({ status: 'installing', latest: offered?.version })
  try {
    return process.platform === 'darwin' ? await installMac(downloaded) : installWindows(downloaded)
  } catch (error) {
    console.error('Update install failed:', error)
    // The download is still good: offer it the way it was first installed.
    await shell.openPath(downloaded).catch(quiet)
    return setUpdate({ status: 'manual', latest: offered?.version })
  }
}

/** Left over from an earlier update: the downloaded installer and, on a Mac, the previous app. */
function cleanUpAfterUpdate() {
  fs.promises.rm(updateDir(), { recursive: true, force: true }).catch(quiet)
  if (process.platform === 'darwin' && app.isPackaged) {
    for (const what of ['old', 'update']) fs.promises.rm(asideOf(macBundle(), what), { recursive: true, force: true }).catch(quiet)
  }
}

// ---------- menu ----------

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const active = () => BrowserWindow.getFocusedWindow() ?? mainWindow
  const history = (step) => () => {
    const nav = active()?.webContents.navigationHistory
    if (!nav) return
    if (step < 0 && nav.canGoBack()) nav.goBack()
    if (step > 0 && nav.canGoForward()) nav.goForward()
  }
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : [{ label: 'File', submenu: [{ role: 'quit' }] }]),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Back', accelerator: isMac ? 'Cmd+[' : 'Alt+Left', click: history(-1) },
        { label: 'Forward', accelerator: isMac ? 'Cmd+]' : 'Alt+Right', click: history(1) },
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Shortlisted on the web', click: () => shell.openExternal(LIVE_URL) },
        { label: 'Contact', click: () => shell.openExternal(`mailto:${CONTACT_EMAIL}?subject=Shortlisted`) },
      ],
    },
  ])
}

// ---------- start ----------

// One copy at a time: opening the app again (or following a shortlisted:// link on Windows, which
// starts a second copy) hands over to the one already running.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const link = deepLinkIn(argv)
    if (link) handleDeepLink(link)
    else showWindow()
  })
  // macOS delivers links here, possibly before the app has finished starting.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleDeepLink(url)
  })
  app.on('web-contents-created', (_event, contents) => protect(contents))
  // Keep every window titled with the app's name instead of the page's long title.
  app.on('browser-window-created', (_event, win) => win.on('page-title-updated', (event) => event.preventDefault()))

  // Only pages of the app itself (or the bundled offline page) may talk to this file.
  const trusted = (event) => {
    const url = event.senderFrame?.url ?? ''
    return isAppUrl(url) || isOfflinePage(url)
  }
  ipcMain.handle('desktop:open-external', (event, url) => {
    const u = typeof url === 'string' ? parse(url) : null
    if (!trusted(event) || !u || !['https:', 'http:', 'mailto:'].includes(u.protocol)) return false
    shell.openExternal(u.href)
    return true
  })
  ipcMain.handle('desktop:take-auth', (event) => {
    if (!trusted(event)) return null
    const auth = pendingAuth
    pendingAuth = null
    return auth
  })
  ipcMain.on('desktop:retry', (event) => {
    if (trusted(event)) loadSite(event.sender)
  })
  ipcMain.handle('desktop:update', (event, action) => {
    if (!trusted(event)) return null
    switch (action) {
      case 'state':
        return updateState
      case 'check':
        return checkForUpdate()
      case 'download':
        void downloadUpdate() // progress arrives as desktop:update-state
        return updateState
      case 'cancel':
        downloadAbort?.abort()
        return updateState
      case 'install':
        return installUpdate()
      default:
        return null
    }
  })

  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: 'Shortlisted',
      applicationVersion: app.getVersion(),
      copyright: `© ${new Date().getFullYear()} Kalhara Tennakoon`,
    })
    // The installed app answers shortlisted:// links. Not while developing, so `npm start`
    // doesn't register a bare copy of Electron as the handler.
    if (app.isPackaged) app.setAsDefaultProtocolClient(PROTOCOL)

    // The site asks for no camera, location or notifications; copying an email draft is all it needs.
    session.defaultSession.setPermissionRequestHandler((_contents, permission, allow) =>
      allow(permission === 'clipboard-sanitized-write'))
    session.defaultSession.on('will-download', handleDownload)
    cleanUpAfterUpdate()

    Menu.setApplicationMenu(buildMenu())
    createWindow()
    const link = deepLinkIn(process.argv) // Windows: started by a link while the app was closed
    if (link) handleDeepLink(link)

    app.on('activate', () => showWindow()) // macOS: clicking the Dock icon with no window open
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
