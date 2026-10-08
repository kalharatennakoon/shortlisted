'use strict'

// The only things the desktop app adds to the page. The web app finds them as
// `window.shortlistedDesktop` (see src/lib/desktop.ts) and behaves as a normal site without it.

const { contextBridge, ipcRenderer } = require('electron')

const versionArg = process.argv.find((a) => a.startsWith('--shortlisted-desktop='))

contextBridge.exposeInMainWorld('shortlistedDesktop', {
  platform: process.platform,
  version: versionArg ? versionArg.split('=')[1] : '',

  /** Opens an https or mailto link in the person's own browser or mail app. */
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', String(url)),

  /**
   * Calls back with `{ code, flowId }` when a sign-in link comes back from the browser (code is
   * null if the link was no use). Returns a function that stops listening.
   */
  onAuthCallback: (callback) => {
    const deliver = async () => {
      const auth = await ipcRenderer.invoke('desktop:take-auth')
      if (auth) callback(auth)
    }
    const listener = () => void deliver()
    ipcRenderer.on('desktop:auth-callback', listener)
    void deliver() // one may have arrived while the page was still loading
    return () => ipcRenderer.removeListener('desktop:auth-callback', listener)
  },

  /** Used by the offline page: load the site again. */
  retry: () => ipcRenderer.send('desktop:retry'),
})
