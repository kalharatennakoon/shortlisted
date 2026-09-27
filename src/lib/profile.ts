import { isAuthSessionMissingError, type User } from '@supabase/supabase-js'
import { reportSessionLost } from './sessionLost'
import { supabase } from './supabase'

/**
 * Basic profile details, stored in the Supabase user's metadata (no extra table needed).
 * We use our own keys (display_name, …) because Google sign-in rewrites its own keys
 * (full_name, name, avatar_url) on every login and would overwrite a user's edits.
 */
export interface Profile {
  display_name: string
  target_role: string
  location: string
  linkedin_url: string
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function readProfile(user: User | null | undefined): Profile {
  const m = (user?.user_metadata ?? {}) as Record<string, unknown>
  return {
    // fall back to the name Google gave us until the user sets their own
    display_name: str(m.display_name) || str(m.full_name) || str(m.name),
    target_role: str(m.target_role),
    location: str(m.location),
    linkedin_url: str(m.linkedin_url),
  }
}

/** Name to greet/show: display name, else the part of the email before the @. */
export function displayName(user: User | null | undefined): string {
  return readProfile(user).display_name || (user?.email ?? '').split('@')[0]
}

export async function updateProfile(p: Profile): Promise<void> {
  const trimmed = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.trim()])) as unknown as Profile
  const { error } = await supabase.auth.updateUser({ data: trimmed })
  if (error) throw reportIfSessionLost(error)
}

/** True if the account can sign in with email + password (as opposed to Google only). */
export function hasPassword(user: User | null | undefined): boolean {
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [user?.app_metadata?.provider]
  return providers.includes('email')
}

export function signInMethods(user: User | null | undefined): string {
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [user?.app_metadata?.provider ?? 'email']
  return providers.map((p) => (p === 'email' ? 'Email & password' : p.charAt(0).toUpperCase() + p.slice(1))).join(' · ')
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Your current password is incorrect.')
  }
}

/** Checks the current password first (re-signing in), then sets the new one. */
export async function changePassword(email: string, current: string, next: string): Promise<void> {
  const check = await supabase.auth.signInWithPassword({ email, password: current })
  if (check.error) throw new WrongPasswordError()
  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) throw reportIfSessionLost(error)
}

/** The browser lost the stored login (e.g. a failed background refresh): send the user to sign in. */
function reportIfSessionLost(error: Error): Error {
  if (isAuthSessionMissingError(error)) {
    reportSessionLost()
    return new Error('Your session expired. Please sign in again.')
  }
  return error
}
