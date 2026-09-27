import { supabase } from './supabase'
import type { Application, ApplicationInput } from './types'

export async function listApplications(): Promise<Application[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('applied_on', { ascending: false, nullsFirst: false })
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
