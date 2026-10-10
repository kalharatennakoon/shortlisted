// "Check my CV": hands the role, the job link and a CV over to StrongCV, Kalhara's other app (a separate site).
//
// Everything travels in the URL fragment (after the #). Browsers never send that part to a server, so the private
// link to the CV stays out of the other site's request logs; its page reads the fragment and removes it from the
// address bar straight away. Nothing is analysed there until the person presses "Analyse".
// The receiving end is src/lib/handoff.ts in the strongcv repo: keep the parameter names in step with it.

import type { JobDocument } from './types'

export const CV_ANALYZER_NAME = 'StrongCV'
// VITE_CV_ANALYZER_URL (see .env.example) points the button at a local copy of StrongCV while testing
const override = (import.meta.env?.VITE_CV_ANALYZER_URL as string | undefined)?.trim()
export const CV_ANALYZER_URL = (override || 'https://strongcv.vercel.app').replace(/\/*$/, '/')
/** How long the private link to the CV works: long enough for the other site to load on a slow phone. */
export const CV_LINK_SECONDS = 300
/** StrongCV's own upload limit (its src/lib/extract.ts) */
export const CV_ANALYZER_MAX_BYTES = 4 * 1024 * 1024
/** The file types it can read. The library here also takes .doc, .odt and images, which it can't. */
const READABLE = ['pdf', 'docx', 'txt']

const ext = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? ''

/** Why StrongCV can't take this document (finishes "…can't read it: "), or null if it can. */
export function cvProblem(doc: Pick<JobDocument, 'file_name' | 'size_bytes'>): string | null {
  if (!READABLE.includes(ext(doc.file_name))) return 'it takes PDF, Word (.docx) and TXT files'
  if (doc.size_bytes > CV_ANALYZER_MAX_BYTES) return 'its limit is 4 MB'
  return null
}

/**
 * The CVs that can be sent: the ones attached to this application first (in the order they were attached), then the
 * rest of the library. Only documents filed as a CV; a cover letter or certificate is never offered.
 */
export function cvChoices(docs: JobDocument[], attachedIds: string[]): JobDocument[] {
  const cvs = docs.filter((d) => d.kind === 'CV' && !cvProblem(d))
  const attached = attachedIds.map((id) => cvs.find((d) => d.id === id)).filter((d): d is JobDocument => Boolean(d))
  return [...attached, ...cvs.filter((d) => !attachedIds.includes(d.id))]
}

/** CVs attached to this application that can't be sent, to explain why they are missing from the choices. */
export function unreadableCvs(docs: JobDocument[], attachedIds: string[]): JobDocument[] {
  return docs.filter((d) => d.kind === 'CV' && attachedIds.includes(d.id) && cvProblem(d))
}

export interface CvHandoff {
  /** The role, as typed in the form */
  position: string
  /** The job posting, already checked to be an http(s) link (postingUrl), or null */
  jobUrl: string | null
  /** Short-lived signed link to the CV, or null to let the person upload one over there */
  cvUrl: string | null
  /** The CV's original file name: the other site shows it and tells the file type from it */
  cvName: string | null
}

/** The address that opens StrongCV with the form filled in. */
export function handoffUrl({ position, jobUrl, cvUrl, cvName }: CvHandoff): string {
  const params = new URLSearchParams({ from: 'shortlisted' })
  if (position.trim()) params.set('position', position.trim().slice(0, 200))
  if (jobUrl) params.set('jobUrl', jobUrl)
  if (cvUrl) {
    params.set('cv', cvUrl)
    if (cvName) params.set('cvName', cvName)
  }
  return `${CV_ANALYZER_URL}#${params}`
}
