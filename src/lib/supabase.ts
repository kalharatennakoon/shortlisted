import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

// Placeholder values keep the app rendering (with a setup notice) before .env exists.
// One client per page. Dev hot-reload re-runs this module; a second client would share the same stored
// session and race it on token refresh, and the loser clears the stored session ("Auth session missing!").
const g = globalThis as typeof globalThis & { __jtSupabase?: SupabaseClient }
export const supabase: SupabaseClient =
  g.__jtSupabase ??
  (g.__jtSupabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder-key', {
    auth: {
      // PKCE returns to the app with ?code=… (query string) instead of #access_token=… (hash),
      // which would collide with HashRouter. The library exchanges the code and cleans the URL.
      flowType: 'pkce',
    },
  }))

/** Where Supabase email links and OAuth should send people back to: this app's root. */
export const appUrl = () => window.location.origin + window.location.pathname

export type OAuthProvider = 'google' | 'github'

/** Asks Supabase which OAuth providers are switched on, so the UI only shows working buttons. */
export async function enabledOAuthProviders(): Promise<OAuthProvider[]> {
  if (!isConfigured) return []
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey! } })
    if (!res.ok) return []
    const settings = (await res.json()) as { external?: Record<string, boolean> }
    return (['google', 'github'] as const).filter((p) => settings.external?.[p])
  } catch {
    return []
  }
}
