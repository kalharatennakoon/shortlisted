// Site-owner details shown on the privacy page.
export const OWNER_NAME = 'Kalhara Tennakoon'
export const CONTACT_EMAIL = 'jobtracker.app.lk@gmail.com'
export const PRIVACY_UPDATED = '7 October 2026'
export const APP_VERSION = '3.0'

// Windows and Mac app (the `desktop/` folder). The installers are built by `.github/workflows/desktop.yml` and
// copied next to the site by the deploy workflow, which also sets the version. Null until the first one is
// published, and in local builds: the landing page then leaves the download section out.
export const DESKTOP_VERSION = (import.meta.env.VITE_DESKTOP_VERSION as string | undefined) || null
export const DESKTOP_DOWNLOADS = {
  windows: `${import.meta.env.BASE_URL}downloads/Shortlisted-Setup.exe`,
  mac: `${import.meta.env.BASE_URL}downloads/Shortlisted.dmg`,
}
