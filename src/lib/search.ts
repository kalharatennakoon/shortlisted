import type { Application } from './types'

// What a search looks through: role, company, status, platform, contact and notes
function haystack(a: Application): string {
  return [a.name, a.company, a.status, a.platform, a.contact_email, a.notes].filter(Boolean).join(' ').toLowerCase()
}

// Every word typed must appear somewhere, in any order ("nurse kandy" finds "Staff Nurse" with "Kandy" in the notes)
export function searchApplications(apps: Application[], query: string): Application[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return apps
  return apps.filter((a) => {
    const text = haystack(a)
    return words.every((w) => text.includes(w))
  })
}
