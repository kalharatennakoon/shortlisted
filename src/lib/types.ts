// Keep these in sync with supabase/migrations (the enum values must match exactly).

export const STATUSES = ['Applied', 'Interviewed', 'Offered', 'Accepted', 'Rejected', 'No Response'] as const
export const PRIORITIES = ['Low', 'Medium', 'High'] as const
export const PLATFORMS = ['Email', 'Company Website', 'LinkedIn', 'Other'] as const
export const NEXT_STEPS = ['Interview', 'Follow up', 'Assessment', 'Call', 'Other'] as const

export type Status = (typeof STATUSES)[number]
export type Priority = (typeof PRIORITIES)[number]
export type Platform = (typeof PLATFORMS)[number]
export type NextStep = (typeof NEXT_STEPS)[number]

export interface Application {
  id: string
  user_id: string
  name: string
  company: string | null
  applied_on: string | null
  platform: Platform | null
  priority: Priority | null
  status: Status
  job_url: string | null
  notes: string | null
  next_step: NextStep | null
  next_date: string | null // YYYY-MM-DD
  // Next-step time and contact email (migration 20261002120000). Optional, like the posting check below:
  // only sent when set, so the app keeps working if the code is deployed before the migration is applied.
  /** Time of the next step, 'HH:MM' from the form or 'HH:MM:SS' from Postgres; null/absent = all day */
  next_time?: string | null
  /** Recruiter / hiring contact, used as the recipient of follow-up emails */
  contact_email?: string | null
  // Posting check (migration 20261002000000). Optional: rows loaded before that migration is applied don't have them.
  /** Day the user last opened the job posting to check it (YYYY-MM-DD) */
  posting_checked_on?: string | null
  /** The posting has been taken down */
  posting_closed?: boolean
  created_at: string
  updated_at: string
}

export type ApplicationInput = Omit<Application, 'id' | 'user_id' | 'created_at' | 'updated_at'>

// ---------- Timeline (supabase/migrations/20261009000000_application_stages.sql) ----------

export const STAGE_OUTCOMES = ['Waiting', 'Passed', 'Not selected'] as const
export type StageOutcome = (typeof STAGE_OUTCOMES)[number]

/** One stage of an application after someone replied: a phone screen, an interview, an assessment… */
export interface Stage {
  id: string
  application_id: string
  user_id: string
  /** What it was, in the person's own words: "Phone screen", "Panel interview" */
  title: string
  stage_date: string // YYYY-MM-DD
  /** 'HH:MM' from the form or 'HH:MM:SS' from Postgres; null = no particular time */
  stage_time: string | null
  outcome: StageOutcome
  notes: string | null
  created_at: string
  updated_at: string
}

/** A stage as the form holds it: new ones have an id already (made in the browser) so saving twice can't add it twice. */
export type StageDraft = Pick<Stage, 'id' | 'title' | 'stage_date' | 'stage_time' | 'outcome' | 'notes'>

// ---------- Documents (supabase/migrations/20260928000000_documents.sql) ----------

export const DOCUMENT_KINDS = ['CV', 'Cover letter', 'Portfolio', 'Certificate', 'Other'] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export interface JobDocument {
  id: string
  user_id: string
  name: string
  kind: DocumentKind
  file_name: string
  storage_path: string
  size_bytes: number
  mime_type: string | null
  created_at: string
}

/** Link row: which document was sent with which application */
export interface DocumentLink {
  application_id: string
  document_id: string
}
