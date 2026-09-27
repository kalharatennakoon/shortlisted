// Minimal RFC 4180 CSV reader/writer. Handles quoted fields, "" escapes, commas and newlines inside
// quotes, CRLF/LF line endings and a UTF-8 BOM (Excel adds one). No dependencies.

export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0

  // Excel in some locales saves with ';' instead of ','. Pick whichever appears more in the first line.
  const firstLine = src.slice(0, src.search(/\r?\n|$/))
  const delim = count(firstLine, ';') > count(firstLine, ',') ? ';' : ','

  while (i < src.length) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
      } else {
        field += c
      }
      i++
      continue
    }
    if (c === '"' && field === '') {
      quoted = true
    } else if (c === delim) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      if (c === '\r' && src[i + 1] === '\n') i++
    } else {
      field += c
    }
    i++
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Drop fully blank lines (trailing newline, empty rows Excel leaves behind)
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

function count(s: string, ch: string) {
  let n = 0
  for (const c of s) if (c === ch) n++
  return n
}

export function toCsv(rows: (string | null | undefined)[][]): string {
  // CRLF + BOM so Excel opens it as UTF-8 (names with non-ASCII characters stay intact)
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

function cell(v: string | null | undefined): string {
  let s = v ?? ''
  // Spreadsheet formula injection: a cell starting with = + - @ runs as a formula in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
