# Shortlisted for Windows and Mac

The desktop app is a window onto the live site (`https://kalharatennakoon.github.io/shortlisted/`), built with
Electron. It always shows the current version of Shortlisted, so a new installer is only needed when something
in this folder changes.

| File | What it does |
|---|---|
| `main.js` | The window, the menu, links that open in the browser, `shortlisted://` sign-in links, downloads |
| `preload.js` | The few things the page can ask the app for (`window.shortlistedDesktop`) |
| `offline.html` | Shown when the site can't be reached |
| `build/` | App icons (`icon.icns` for Mac, `icon.ico` for Windows, `icon.png` is their source) |
| `package.json` | Version number and installer settings (the `build` section) |

## Try it on your computer

```
cd desktop
npm install
npm start                                           # opens the live site
SHORTLISTED_URL=http://localhost:5173/ npm start    # opens your local `npm run dev` instead
```

Google sign-in and email links only come back to an **installed** copy: `npm start` doesn't register
`shortlisted://` links. Email and password sign-in works either way.

## Making the installers

GitHub builds them (`.github/workflows/desktop.yml`), each on its own system:

- **Open a pull request** that changes this folder: both installers are built and attached to the run
  (Actions, the run, Artifacts). Nothing is published. Use this to try them first.
- **Merge to `main`**: they are built, saved as the `desktop-latest` release, and the site is redeployed with
  them at `/downloads/Shortlisted-Setup.exe` and `/downloads/Shortlisted.dmg`. The landing page shows its
  download section from then on.

To build on your own Mac instead: `npm run build:mac` (the `.dmg` appears in `desktop/dist/`). The Windows
installer needs Windows, or the workflow.

## Releasing a new version

Change `version` in `package.json`, then merge. Installed copies see the new number on the site and show
"Update the desktop app" in the footer.

## Good to know

- **Security warnings on first open.** The installers aren't signed with paid certificates (Apple Developer
  Program, a Windows code-signing certificate), so Windows shows "Windows protected your PC" and macOS says it
  can't check the app. The landing page explains how to get past both. Buying the certificates removes them.
- **If the site address changes**, update `LIVE_URL` in `main.js` and release a new version: installed copies
  keep opening the old address until people reinstall.
- **Sign-in from the app** goes through the browser and back (`src/lib/desktop.ts` explains how). It needs
  the site's address to stay in Supabase's Redirect URLs with `/**` at the end, as it is now.
