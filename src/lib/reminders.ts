// Email reminder preferences (table public.reminder_settings) and calls to the `reminders` Edge Function.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface ReminderSettings {
  enabled: boolean
  send_hour: number
  time_zone: string
  include_follow_ups: boolean
}

export const deviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Colombo'
  } catch {
    return 'Asia/Colombo'
  }
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false,
  send_hour: 7,
  time_zone: deviceTimeZone(),
  include_follow_ups: true,
}

/** null = never saved (reminders are off). */
export async function getReminderSettings(): Promise<ReminderSettings | null> {
  const { data, error } = await supabase
    .from('reminder_settings')
    .select('enabled, send_hour, time_zone, include_follow_ups')
    .maybeSingle()
  if (error) throw error
  return data as ReminderSettings | null
}

export async function saveReminderSettings(s: ReminderSettings): Promise<void> {
  const existing = await getReminderSettings()
  const { error } = existing
    ? await supabase
        .from('reminder_settings')
        .update({ ...s, updated_at: new Date().toISOString() })
        .not('user_id', 'is', null) // RLS limits it to the caller's row; PostgREST wants a filter on updates
    : await supabase.from('reminder_settings').insert(s)
  if (error) throw error
}

async function invoke(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('reminders', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error ?? 'The reminder service returned an error.')
    }
    throw new Error("Couldn't reach the reminder service. Please try again in a moment.")
  }
  return data
}

/** Sends a test digest to the signed-in user's email. Returns the address it went to. */
export async function sendTestEmail(): Promise<string> {
  const res = await invoke({ action: 'test', time_zone: deviceTimeZone() })
  return String(res.email ?? '')
}

export async function unsubscribe(token: string): Promise<void> {
  await invoke({ action: 'unsubscribe', token })
}

/** "7:00 AM" style label for an hour 0–23. */
export const hourLabel = (h: number) =>
  new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
