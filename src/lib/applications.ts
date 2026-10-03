import { supabase } from './supabase'
import type { Application, ApplicationInput } from './types'

export async function listApplications(): Promise<Application[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('applied_on', { ascending: false, nullsFirst: false })
    // tie-breaker: without it, applications with the same Applied On date come back in a different order on each load
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Application[]
}

export async function createApplication(input: ApplicationInput): Promise<Application> {
  const { data, error } = await supabase.from('applications').insert(input).select().single()
  if (error) throw error
  return data as Application
}

export async function updateApplication(id: string, patch: Partial<ApplicationInput>): Promise<Application> {
  const { data, error } = await supabase.from('applications').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as Application
}

export async function deleteApplication(id: string): Promise<void> {
  const { error } = await supabase.from('applications').delete().eq('id', id)
  if (error) throw error
}

/** Bulk insert (CSV import). Chunked so a big file stays under request size limits. */
export async function createApplications(inputs: ApplicationInput[]): Promise<Application[]> {
  const created: Application[] = []
  for (let i = 0; i < inputs.length; i += 200) {
    const { data, error } = await supabase.from('applications').insert(inputs.slice(i, i + 200)).select()
    if (error) {
      if (created.length) throw new Error(`Imported ${created.length} of ${inputs.length}, then stopped: ${error.message}`)
      throw error
    }
    created.push(...(data as Application[]))
  }
  return created
}
