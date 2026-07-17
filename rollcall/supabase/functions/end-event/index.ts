// RollCall — end-event edge function
//
// POST { code, token }
//  1. Validates the host token
//  2. Marks the event ended (closes check-in)
//  3. Emails the contact list (opt-ins only) to every opted-in attendee + the organizer
//
// Secrets required (supabase secrets set KEY=value):
//   RESEND_API_KEY  — from https://resend.com (free tier is fine to start)
//   FROM_EMAIL      — optional; defaults to "RollCall <onboarding@resend.dev>".
//                     Set to an address on your verified Resend domain in production.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

interface Attendee {
  name: string
  email: string
  company: string | null
  linkedin: string | null
  share_contact: boolean
}

function rosterText(eventName: string, shared: Attendee[]): string {
  const lines = shared.map((a) => {
    const extras = [a.company, a.linkedin].filter(Boolean).join(' · ')
    return `• ${a.name} — ${a.email}${extras ? ` (${extras})` : ''}`
  })
  return [
    `Thanks for coming to ${eventName}!`,
    '',
    shared.length === 1
      ? 'Here is the 1 person who chose to share their contact info:'
      : `Here are the ${shared.length} people who chose to share their contact info:`,
    '',
    ...lines,
    '',
    'Sent with RollCall — check in now, connect after.',
  ].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let code: string, token: string
  try {
    ;({ code, token } = await req.json())
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!code || !token) return json({ error: 'code and token are required' }, 400)

  // Service role client — runs server-side only; RLS does not apply.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id, name, status, organizer_name, organizer_email, organizer_token')
    .eq('code', code)
    .single()

  if (eventErr || !event) return json({ error: 'Event not found' }, 404)
  if (event.organizer_token !== token) return json({ error: 'Not authorized' }, 403)
  if (event.status === 'ended') return json({ error: 'Event already ended' }, 409)

  const { error: updateErr } = await supabase
    .from('events')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', event.id)
  if (updateErr) return json({ error: 'Failed to end event' }, 500)

  const { data: attendees, error: attErr } = await supabase
    .from('checkins')
    .select('name, email, company, linkedin, share_contact')
    .eq('event_id', event.id)
    .order('created_at')
  if (attErr) return json({ error: 'Failed to load attendees' }, 500)

  const shared = (attendees ?? []).filter((a: Attendee) => a.share_contact)
  const body = rosterText(event.name, shared)
  const from = Deno.env.get('FROM_EMAIL') ?? 'RollCall <onboarding@resend.dev>'
  const resendKey = Deno.env.get('RESEND_API_KEY')

  // Recipients: every opted-in attendee, plus the organizer (deduped).
  const recipients = [...new Set([...shared.map((a: Attendee) => a.email), event.organizer_email])]

  if (!resendKey) {
    // No email provider configured — event still ends, but nothing is sent.
    return json({ emails_sent: 0, opted_in: shared.length, warning: 'RESEND_API_KEY not set — no emails sent' })
  }

  let sent = 0
  // Resend batch endpoint accepts up to 100 messages per call.
  for (let i = 0; i < recipients.length; i += 100) {
    const batch = recipients.slice(i, i + 100).map((to) => ({
      from,
      to: [to],
      subject: `Your contacts from ${event.name}`,
      text: body,
    }))
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    })
    if (res.ok) sent += batch.length
    else console.error('Resend batch failed', res.status, await res.text())
  }

  return json({ emails_sent: sent, opted_in: shared.length })
})
