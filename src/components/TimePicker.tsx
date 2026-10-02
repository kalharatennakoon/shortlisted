import { useEffect, useRef, useState } from 'react'
import { timeKey } from '../lib/dates'
import { fmtTime } from '../lib/format'
import { ClockIcon, XIcon } from './Icons'

interface Props {
  /** 'HH:MM' (or Postgres' 'HH:MM:SS'); null when no time is set */
  value: string | null | undefined
  onChange: (value: string | null) => void
  disabled?: boolean
  /** id of the visible label, for screen readers */
  labelledBy?: string
  /** Shown as a tooltip while disabled */
  disabledHint?: string
}

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
const pad = (n: number) => String(n).padStart(2, '0')

/** Does this device write times as 2:30 PM (true) or 14:30 (false)? The picker follows it, like fmtTime does. */
function uses12Hour(): boolean {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? true
  } catch {
    return true
  }
}

/**
 * Time field with its own picker, used instead of <input type="time"> (whose pop-up looks different, and dated,
 * in every browser). Tap an hour, then the minutes; each tap saves straight away.
 * Contains several buttons, so never wrap it in a <label>: pass `labelledBy` instead.
 */
export default function TimePicker({ value, onChange, disabled = false, labelledBy, disabledHint }: Props) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const twelve = uses12Hour()

  const key = timeKey(value)
  const hour = key ? Number(key.slice(0, 2)) : null // 0-23
  const minute = key ? Number(key.slice(3)) : null
  const period = hour === null ? null : hour >= 12 ? 'PM' : 'AM'

  const close = (refocus = false) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation() // closes the picker only, not the dialog it sits in
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    // Bring the whole panel into view (the form scrolls) and start on the chosen hour
    panel.current?.scrollIntoView({ block: 'nearest' })
    panel.current?.querySelector<HTMLButtonElement>('.tp-hours [aria-pressed="true"], .tp-hours button')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const set = (h: number, m: number) => onChange(`${pad(h)}:${pad(m)}`)

  function pickHour(h: number) {
    if (!twelve) return set(h, minute ?? 0)
    // No AM/PM chosen yet: 7 to 11 is almost always a morning, 12 to 6 an afternoon
    const p = period ?? (h >= 7 && h <= 11 ? 'AM' : 'PM')
    set((h % 12) + (p === 'PM' ? 12 : 0), minute ?? 0)
  }
  const pickMinute = (m: number) => set(hour ?? 9, m)
  const pickPeriod = (p: 'AM' | 'PM') => set(((hour ?? 9) % 12) + (p === 'PM' ? 12 : 0), minute ?? 0)

  const hourSelected = (h: number) => hour !== null && (twelve ? (hour % 12 || 12) === h : hour === h)

  return (
    <div className={`time-field${open ? ' open' : ''}`} ref={wrap}>
      <button
        type="button"
        ref={trigger}
        className={`time-trigger${key ? '' : ' empty'}`}
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelledBy}
        onClick={() => setOpen((o) => !o)}
      >
        <ClockIcon size={15} />
        <span>{key ? fmtTime(key) : 'Add time'}</span>
      </button>
      {key && !disabled && (
        <button
          type="button"
          className="time-clear"
          aria-label="Remove the time"
          title="Remove the time"
          onClick={() => {
            onChange(null)
            close()
          }}
        >
          <XIcon size={14} />
        </button>
      )}

      {open && (
        <div className="time-panel card" role="dialog" aria-label="Choose a time" ref={panel}>
          <div className="tp-top">
            <span className={`tp-readout${key ? '' : ' muted'}`} aria-live="polite">
              {key ? fmtTime(key) : 'No time yet'}
            </span>
            {twelve && (
              <span className="tp-period" role="group" aria-label="Morning or afternoon">
                {(['AM', 'PM'] as const).map((p) => (
                  <button key={p} type="button" aria-pressed={period === p} className={period === p ? 'active' : ''} onClick={() => pickPeriod(p)}>
                    {p}
                  </button>
                ))}
              </span>
            )}
          </div>

          <span className="tp-label" id="tp-hour">Hour</span>
          <div className="tp-grid tp-hours" role="group" aria-labelledby="tp-hour">
            {(twelve ? HOURS_12 : HOURS_24).map((h) => (
              <button key={h} type="button" aria-pressed={hourSelected(h)} className={hourSelected(h) ? 'active' : ''} onClick={() => pickHour(h)}>
                {twelve ? h : pad(h)}
              </button>
            ))}
          </div>

          <span className="tp-label" id="tp-minute">Minutes</span>
          <div className="tp-grid" role="group" aria-labelledby="tp-minute">
            {MINUTES.map((m) => (
              <button key={m} type="button" aria-pressed={minute === m} className={minute === m ? 'active' : ''} onClick={() => pickMinute(m)}>
                {pad(m)}
              </button>
            ))}
          </div>

          <div className="tp-foot">
            <button type="button" className="primary small-btn" onClick={() => close(true)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
