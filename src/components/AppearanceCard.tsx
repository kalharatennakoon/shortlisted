import { THEME_CHOICES, useTheme } from '../lib/theme'
import { MonitorIcon, MoonIcon, SunIcon } from './Icons'

const ICONS = { light: SunIcon, dark: MoonIcon, system: MonitorIcon }

/** Profile & settings: light, dark or match the device. Saved in this browser only. */
export default function AppearanceCard() {
  const [theme, setTheme] = useTheme()

  return (
    <section className="card settings-card">
      <header className="settings-head">
        <span className="settings-icon"><MoonIcon size={18} /></span>
        <div>
          <h2 id="appearance-title">Appearance</h2>
          <p className="muted small">Light or dark. Saved on this device, so each browser can have its own.</p>
        </div>
      </header>
      <div className="segmented theme-switch" role="radiogroup" aria-labelledby="appearance-title">
        {THEME_CHOICES.map(({ id, label }) => {
          const ThemeIcon = ICONS[id]
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={theme === id}
              className={theme === id ? 'active' : ''}
              onClick={() => setTheme(id)}
            >
              <ThemeIcon size={15} /> {label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
