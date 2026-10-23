import { useEffect, useRef } from 'react'
import { SearchIcon, XIcon } from './Icons'

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

function isTyping(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

// Search field for the board, table and calendar. ⌘K / Ctrl+K or "/" jumps to it, Escape clears it,
// and while searching it says how many applications match.
export default function SearchBox({
  value,
  onChange,
  matches,
  total,
}: {
  value: string
  onChange: (v: string) => void
  matches: number
  total: number
}) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Leave the keys alone while a dialog (the form, email, calendar…) is open
      if (document.querySelector('[aria-modal="true"]')) return
      const combo = e.key.toLowerCase() === 'k' && (IS_MAC ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)
      if (!combo && !slash) return
      e.preventDefault()
      input.current?.focus()
      input.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const searching = value.trim() !== ''

  return (
    <div className={`search${searching ? ' active' : ''}`} role="search">
      <SearchIcon />
      <input
        ref={input}
        type="search"
        aria-label="Search applications"
        placeholder="Search applications"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          // First Escape clears, the next one leaves the field
          if (value) onChange('')
          else input.current?.blur()
          e.preventDefault()
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {searching ? (
        <>
          <span className="search-count" aria-live="polite">
            {matches} of {total}
          </span>
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            onClick={() => {
              onChange('')
              input.current?.focus()
            }}
          >
            <XIcon />
          </button>
        </>
      ) : (
        <kbd className="search-kbd" aria-hidden="true">{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>
      )}
    </div>
  )
}
