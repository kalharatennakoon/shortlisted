// Supabase Edge Function: email reminders (daily digest of next steps).
//
//   POST {action:"run"}          from pg_cron every hour, header x-cron-secret: <CRON_SECRET>
//   POST {action:"test"}         from the app (user's JWT): send me a test email now (max 1/minute)
//   POST {action:"unsubscribe", token}  from the app's #/unsubscribe page (no sign-in needed)
//   POST ?unsubscribe=<token>    one-click unsubscribe from Gmail/Outlook (List-Unsubscribe-Post)
//
// Deploy with JWT verification OFF (unsubscribe links work signed out); every action checks its own auth.
// Secrets: SMTP_USER, SMTP_PASS (Gmail app password), CRON_SECRET, APP_URL. See README.md.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import {
  buildDigest, isDue, isEmpty, localParts, renderHtml, renderText, subjectFor, type AppRow,
} from './digest.ts'

const env = (k: string) => {
  const v = Deno.env.get(k)
  if (!v) throw new Error(`Missing secret ${k}`)
  return v
}

const SUPABASE_URL = env('SUPABASE_URL')
const admin = createClient(SUPABASE_URL, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://kalharatennakoon.github.io/job-tracker/').replace(/\/?$/, '/')
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/reminders`

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const oneClick = new URL(req.url).searchParams.get('unsubscribe')
    if (oneClick) return await unsubscribe(oneClick)

    const body = await req.json().catch(() => ({}))
    switch (body.action) {
      case 'run':
        if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json({ error: 'Forbidden' }, 403)
        return json(await runAll())
      case 'test':
        return await sendTest(req, typeof body.time_zone === 'string' ? body.time_zone : null)
      case 'unsubscribe':
        return await unsubscribe(String(body.token ?? ''))
      default:
        return json({ error: 'Unknown action' }, 400)
    }
  } catch (e) {
    console.error(e)
    return json({ error: 'Something went wrong. Please try again later.' }, 500)
  }
})

// ---------- actions ----------

async function runAll() {
  const now = new Date()
  const { data: recipients, error } = await admin.rpc('reminder_recipients')
  if (error) throw error
  const due = (recipients ?? []).filter((r: Recipient) => isDue(now, r))
  let sent = 0, skipped = 0, failed = 0
  let mailer: SMTPClient | null = null
  try {
    for (const r of due as Recipient[]) {
      const { date, weekday } = localParts(now, r.time_zone)
      try {
        const apps = await appsOf(r.user_id)
        const digest = buildDigest(apps, date, r.include_follow_ups && weekday === 1) // follow-ups on Mondays
        if (isEmpty(digest)) {
          skipped++
        } else {
          mailer ??= smtp()
          await send(mailer, r.email, r.unsubscribe_token, digest, date, false)
          sent++
        }
        // Mark the day done either way (a failed send above skips this, so it's retried next hour)
        await admin.from('reminder_settings').update({ last_sent_on: date }).eq('user_id', r.user_id)
      } catch (e) {
        failed++
        console.error(`reminder for ${r.user_id} failed:`, e)
      }
    }
  } finally {
    if (mailer) await closeQuietly(mailer)
  }
  return { considered: recipients?.length ?? 0, due: due.length, sent, skipped, failed }
}

async function sendTest(req: Request, timeZone: string | null) {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const { data: auth, error: authError } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null }, error: null }
  const user = auth?.user
  if (authError || !user?.email) return json({ error: 'Please sign in again.' }, 401)

  // Settings row (created with defaults if the user never saved any)
  let { data: s } = await admin.from('reminder_settings').select('*').eq('user_id', user.id).maybeSingle()
  if (!s) {
    const ins = await admin
      .from('reminder_settings')
      .insert({ user_id: user.id, enabled: false, ...(timeZone ? { time_zone: timeZone } : {}) })
      .select()
      .single()
    if (ins.error) throw ins.error
    s = ins.data
  }
  if (s.last_test_at && Date.now() - new Date(s.last_test_at).getTime() < 60_000) {
    return json({ error: 'Test email already sent. Please wait a minute before sending another.' }, 429)
  }
  await admin.from('reminder_settings').update({ last_test_at: new Date().toISOString() }).eq('user_id', user.id)

  const { date } = localParts(new Date(), s.time_zone)
  const digest = buildDigest(await appsOf(user.id), date, true)
  const mailer = smtp()
  try {
    await send(mailer, user.email, s.unsubscribe_token, digest, date, true)
  } finally {
    await closeQuietly(mailer)
  }
  return json({ ok: true, email: user.email })
}

async function unsubscribe(token: string) {
  if (!UUID.test(token)) return json({ error: 'That unsubscribe link is not valid.' }, 400)
  const { data, error } = await admin
    .from('reminder_settings')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .select('user_id')
  if (error) throw error
  // Same answer whether or not the token matched, so tokens can't be probed
  return json({ ok: true, changed: (data?.length ?? 0) > 0 })
}

// ---------- helpers ----------

interface Recipient {
  user_id: string
  email: string
  time_zone: string
  send_hour: number
  include_follow_ups: boolean
  unsubscribe_token: string
  last_sent_on: string | null
}

async function appsOf(userId: string): Promise<AppRow[]> {
  const { data, error } = await admin
    .from('applications')
    .select('id, name, company, status, applied_on, next_step, next_date')
    .eq('user_id', userId)
  if (error) throw error
  return data as AppRow[]
}

// Gmail over implicit TLS on 465 (Supabase Edge Functions block outbound 25 and 587)
function smtp() {
  return new SMTPClient({
    connection: {
      hostname: Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com',
      port: Number(Deno.env.get('SMTP_PORT') ?? 465),
      tls: true,
      auth: { username: env('SMTP_USER'), password: env('SMTP_PASS') },
    },
  })
}

/** UTF-8 -> base64, wrapped at 76 characters per line (RFC 2045). */
function base64Lines(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return (btoa(bin).match(/.{1,76}/g) ?? []).join('\r\n')
}

async function closeQuietly(mailer: SMTPClient) {
  try {
    await mailer.close()
  } catch {
    /* connection already gone */
  }
}

async function send(
  mailer: SMTPClient, to: string, token: string, digest: ReturnType<typeof buildDigest>, today: string, test: boolean,
) {
  const unsubscribePage = `${APP_URL}#/unsubscribe?token=${token}`
  await mailer.send({
    from: `Shortlistd <${env('SMTP_USER')}>`,
    to,
    subject: (test ? '[Test] ' : '') + subjectFor(digest),
    // Pre-encoded as base64: denomailer's own quoted-printable encoder leaves stray "=20"s in some mail apps
    mimeContent: [
      { mimeType: 'text/plain; charset="utf-8"', content: base64Lines(renderText(digest, today, APP_URL, unsubscribePage, test)), transferEncoding: 'base64' },
      { mimeType: 'text/html; charset="utf-8"', content: base64Lines(renderHtml(digest, today, APP_URL, unsubscribePage, test)), transferEncoding: 'base64' },
    ],
    headers: {
      'List-Unsubscribe': `<${FUNCTION_URL}?unsubscribe=${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
}
