// Document library + links to applications. Files are in the private 'documents' Storage bucket at
// <user id>/<document id>/<safe file name>; metadata rows in public.documents; links in application_documents.

import { supabase } from './supabase'
import type { DocumentKind, DocumentLink, JobDocument } from './types'

const BUCKET = 'documents'
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENTS = 30

// Extension -> MIME type. Some systems give .docx files an empty type, so we go by extension.
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}
export const ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(',')

const ext = (fileName: string) => fileName.split('.').pop()?.toLowerCase() ?? ''

/** Checks a file before upload; returns a message, or null if it's fine. */
export function validateFile(file: File): string | null {
  if (!TYPES[ext(file.name)]) return `"${file.name}" isn't a supported type. Use PDF, Word, ODT, TXT or an image.`
  if (file.size === 0) return `"${file.name}" is empty.`
  if (file.size > MAX_DOCUMENT_BYTES) return `"${file.name}" is over 5 MB.`
  return null
}

/** Best guess at the kind from the file name ("Kalhara_CV_v3.pdf" -> CV). */
export function guessKind(fileName: string): DocumentKind {
  // split on anything that isn't a letter, so "My_CV-v3", "resume2026" and "CoverLetter" all work
  const words = fileName.replace(/\.[^.]+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-zé]+/)
  const has = (...w: string[]) => words.some((x) => w.includes(x))
  if (has('cv', 'resume', 'résumé')) return 'CV'
  if (has('cover')) return 'Cover letter'
  if (has('portfolio')) return 'Portfolio'
  if (has('certificate', 'cert', 'certification')) return 'Certificate'
  return 'Other'
}

/** File name without extension, tidied, as the default display name. */
export const defaultName = (fileName: string) =>
  fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 200) || fileName

// Storage keys: keep them to safe ASCII (spaces and non-Latin characters are rejected or awkward)
const safeKey = (fileName: string) => {
  const e = ext(fileName)
  const base = fileName.replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')
  return `${(base || 'file').slice(0, 80)}.${e}`
}

export async function listDocuments(): Promise<JobDocument[]> {
  const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as JobDocument[]
}

export async function listLinks(): Promise<DocumentLink[]> {
  const { data, error } = await supabase.from('application_documents').select('application_id, document_id')
  if (error) throw error
  return data as DocumentLink[]
}

export async function uploadDocument(file: File, kind: DocumentKind, name = defaultName(file.name)): Promise<JobDocument> {
  const problem = validateFile(file)
  if (problem) throw new Error(problem)
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in')

  const id = crypto.randomUUID()
  const path = `${uid}/${id}/${safeKey(file.name)}`
  const contentType = TYPES[ext(file.name)]
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType, upsert: false })
  if (up.error) throw friendlyStorageError(up.error)

  const { data, error } = await supabase
    .from('documents')
    .insert({ id, name, kind, file_name: file.name, storage_path: path, size_bytes: file.size, mime_type: contentType })
    .select()
    .single()
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]) // don't leave an orphaned file behind
    throw error
  }
  return data as JobDocument
}

export async function updateDocument(id: string, patch: { name?: string; kind?: DocumentKind }): Promise<JobDocument> {
  const { data, error } = await supabase.from('documents').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as JobDocument
}

/** Deletes the document everywhere: its links (cascade), the row, then the file. */
export async function deleteDocument(doc: JobDocument): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', doc.id)
  if (error) throw error
  await supabase.storage.from(BUCKET).remove([doc.storage_path])
}

/** Removes every file in the signed-in user's folder (used before account deletion). */
export async function deleteAllMyFiles(): Promise<void> {
  const docs = await listDocuments()
  const paths = docs.map((d) => d.storage_path)
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
}

/**
 * Opens a document in a new tab via a short-lived signed URL. The tab is opened synchronously
 * (inside the click) so pop-up blockers allow it, then pointed at the URL once it's ready.
 */
export async function openDocument(doc: JobDocument, download = false): Promise<void> {
  const tab = download ? null : window.open('', '_blank')
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60, download ? { download: doc.file_name } : undefined)
    if (error) throw error
    if (tab) tab.location.href = data.signedUrl
    else window.location.assign(data.signedUrl)
  } catch (e) {
    tab?.close()
    throw e
  }
}

/**
 * A link to the file that works for `seconds`, for anyone who has it. Only for handing one document to something
 * the person asked for by name (the CV check); everything else opens documents with openDocument().
 */
export async function signedDocumentUrl(doc: JobDocument, seconds: number): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, seconds)
  if (error) throw error
  return data.signedUrl
}

/** Makes the application's links match `documentIds` (adds and removes as needed). */
export async function setApplicationDocuments(applicationId: string, current: string[], next: string[]): Promise<void> {
  const add = next.filter((id) => !current.includes(id))
  const remove = current.filter((id) => !next.includes(id))
  if (add.length) {
    const { error } = await supabase
      .from('application_documents')
      .insert(add.map((document_id) => ({ application_id: applicationId, document_id })))
    if (error) throw error
  }
  if (remove.length) {
    const { error } = await supabase
      .from('application_documents')
      .delete()
      .eq('application_id', applicationId)
      .in('document_id', remove)
    if (error) throw error
  }
}

function friendlyStorageError(e: { message: string }) {
  const m = e.message.toLowerCase()
  if (m.includes('row-level security') || m.includes('unauthorized')) {
    return new Error(`You can keep up to ${MAX_DOCUMENTS} documents. Delete one you no longer need to upload another.`)
  }
  if (m.includes('bucket not found')) return new Error('Document storage isn\'t set up yet. Please try again later.')
  if (m.includes('mime type') || m.includes('not supported')) return new Error('That file type isn\'t supported.')
  if (m.includes('size') || m.includes('too large')) return new Error('That file is over 5 MB.')
  return new Error(e.message)
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
