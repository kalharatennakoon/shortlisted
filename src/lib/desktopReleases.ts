import { isNewerVersion } from './desktop'

/** One version of the desktop app and what changed in it, in words for the people using it. */
export interface DesktopRelease {
  version: string
  notes: string[]
}

/**
 * What's new in each version of the desktop app, newest first. Shown under "Version … is available" in
 * Profile & settings. Add the new version here in the same change that bumps `version` in desktop/package.json.
 * The site deploys before the installers are built, and only versions up to the one on offer are shown.
 */
export const DESKTOP_RELEASES: DesktopRelease[] = [
  {
    version: '1.0.8',
    notes: ['You stay signed in after updating the app.'],
  },
  {
    version: '1.0.7',
    notes: [
      'Dark mode: choose Light, Dark or Match system in Profile & settings. The window and title bar follow it.',
    ],
  },
  {
    version: '1.0.6',
    notes: [
      'Updates on a Mac go in reliably: a copy left behind by an earlier update no longer stops the next one.',
      'Shortlisted no longer goes missing from Applications when an update can’t finish.',
    ],
  },
  {
    version: '1.0.5',
    notes: [
      'Shortlisted always opens with the newest version of the site, so no blank window after a release.',
      'After an update, the app opens again on the page you were on.',
    ],
  },
  { version: '1.0.4', notes: ['Small fixes to updating.'] },
  {
    version: '1.0.3',
    notes: ['Update the app from Profile & settings: check, download with progress, then install and restart.'],
  },
]

/** The releases after `installed`, up to and including `latest`, newest first. */
export function releasesBetween(installed: string, latest: string): DesktopRelease[] {
  return DESKTOP_RELEASES.filter((r) => isNewerVersion(r.version, installed) && !isNewerVersion(r.version, latest))
}
