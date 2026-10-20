import { useEffect, useState } from 'react'
import { desktop } from './desktop'

// Light or dark. Chosen in Profile & settings, kept in this browser (not the account), light unless chosen.
// A script at the top of index.html sets `data-theme` before the page draws, so a dark page never flashes white;
// it repeats STORAGE_KEY and the rules in `resolve`, so change them together.

export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Match system' },
]

const STORAGE_KEY = 'shortlisted-theme'
/** The page background in each theme, for the browser's own bars (`theme-color`). Same as `--bg`. */
const THEME_COLOR = { light: '#ffffff', dark: '#0f1217' }

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'dark' || saved === 'system' ? saved : 'light'
  } catch {
    return 'light'
  }
}

const resolve = (choice: ThemeChoice): 'light' | 'dark' =>
  choice === 'system' ? (systemDark.matches ? 'dark' : 'light') : choice

function apply(choice: ThemeChoice) {
  const theme = resolve(choice)
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  // The app's window, title bar and offline page follow too (from 1.0.7; earlier copies have no setTheme).
  desktop?.setTheme?.(choice)
}

let current = readChoice()
const listeners = new Set<(choice: ThemeChoice) => void>()

apply(current)
systemDark.addEventListener('change', () => {
  if (current === 'system') apply(current)
})
// Another tab changed it
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return
  current = readChoice()
  apply(current)
  listeners.forEach((l) => l(current))
})

export function setTheme(choice: ThemeChoice) {
  current = choice
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // private window: it still applies until the page is closed
  }
  apply(choice)
  listeners.forEach((l) => l(choice))
}

/** The current choice, and a way to change it. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState(current)
  useEffect(() => {
    listeners.add(setChoice)
    return () => void listeners.delete(setChoice)
  }, [])
  return [choice, setTheme]
}
