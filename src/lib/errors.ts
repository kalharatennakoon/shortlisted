/** Readable message from anything thrown. Supabase errors are plain objects with `message`, not Error instances. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  // PostgREST: the app sent a column the database doesn't have yet (a file in supabase/migrations hasn't been run)
  if (e && typeof e === 'object' && (e as { code?: unknown }).code === 'PGRST204') {
    return "This couldn't be saved because the database hasn't had its latest update yet. Please try again later."
  }
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return String(e)
}
