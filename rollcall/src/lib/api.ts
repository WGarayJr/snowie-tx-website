import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  Attendee,
  CheckInInput,
  CreatedEvent,
  EndEventResult,
  EventHost,
  EventPublic,
} from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when no Supabase project is configured — data lives in this browser only. */
export const DEMO_MODE = !SUPABASE_URL || !SUPABASE_ANON_KEY

export interface Api {
  createEvent(name: string, organizerName: string, organizerEmail: string): Promise<CreatedEvent>
  getEventPublic(code: string): Promise<EventPublic | null>
  checkIn(code: string, input: CheckInInput): Promise<EventPublic>
  getEventHost(code: string, token: string): Promise<EventHost | null>
  endEvent(code: string, token: string): Promise<EndEventResult>
}

/* ------------------------------------------------------------------ */
/* Supabase backend — all access goes through SECURITY DEFINER RPCs   */
/* so the anon key can never read attendee emails or host tokens.     */
/* ------------------------------------------------------------------ */

function supabaseApi(client: SupabaseClient, url: string, anonKey: string): Api {
  return {
    async createEvent(name, organizerName, organizerEmail) {
      const { data, error } = await client.rpc('create_event', {
        p_name: name,
        p_organizer_name: organizerName,
        p_organizer_email: organizerEmail,
      })
      if (error) throw new Error(error.message)
      return data as CreatedEvent
    },

    async getEventPublic(code) {
      const { data, error } = await client.rpc('get_event_public', { p_code: code })
      if (error) throw new Error(error.message)
      return (data ?? null) as EventPublic | null
    },

    async checkIn(code, input) {
      const { data, error } = await client.rpc('check_in', {
        p_code: code,
        p_name: input.name,
        p_email: input.email,
        p_company: input.company ?? null,
        p_linkedin: input.linkedin ?? null,
        p_share: input.share_contact,
      })
      if (error) throw new Error(error.message)
      return data as EventPublic
    },

    async getEventHost(code, token) {
      const { data, error } = await client.rpc('get_event_host', {
        p_code: code,
        p_token: token,
      })
      if (error) throw new Error(error.message)
      return (data ?? null) as EventHost | null
    },

    async endEvent(code, token) {
      const res = await fetch(`${url}/functions/v1/end-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ code, token }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `End event failed (${res.status})`)
      return body as EndEventResult
    },
  }
}

/* ------------------------------------------------------------------ */
/* Demo backend — localStorage, so the app is playable with no setup. */
/* ------------------------------------------------------------------ */

interface DemoEvent {
  code: string
  name: string
  organizer_name: string
  organizer_email: string
  organizer_token: string
  status: 'open' | 'ended'
  attendees: Attendee[]
}

const DEMO_KEY = 'rollcall-demo-events'

function demoLoad(): Record<string, DemoEvent> {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function demoSave(events: Record<string, DemoEvent>) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(events))
}

function randomCode(len: number): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789' // no 0/O/1/l/i lookalikes
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function rosterText(eventName: string, attendees: Attendee[]): string {
  const shared = attendees.filter((a) => a.share_contact)
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

function demoApi(): Api {
  return {
    async createEvent(name, organizerName, organizerEmail) {
      const events = demoLoad()
      const code = randomCode(6)
      events[code] = {
        code,
        name,
        organizer_name: organizerName,
        organizer_email: organizerEmail,
        organizer_token: randomCode(24),
        status: 'open',
        attendees: [],
      }
      demoSave(events)
      return { code, organizer_token: events[code].organizer_token }
    },

    async getEventPublic(code) {
      const ev = demoLoad()[code]
      if (!ev) return null
      return { code, name: ev.name, status: ev.status, checkin_count: ev.attendees.length }
    },

    async checkIn(code, input) {
      const events = demoLoad()
      const ev = events[code]
      if (!ev) throw new Error('Event not found')
      if (ev.status !== 'open') throw new Error('This event has ended — check-in is closed.')
      const email = input.email.trim().toLowerCase()
      const existing = ev.attendees.find((a) => a.email === email)
      const attendee: Attendee = {
        name: input.name.trim(),
        email,
        company: input.company?.trim() || null,
        linkedin: input.linkedin?.trim() || null,
        share_contact: input.share_contact,
        created_at: new Date().toISOString(),
      }
      if (existing) Object.assign(existing, attendee)
      else ev.attendees.push(attendee)
      demoSave(events)
      return { code, name: ev.name, status: ev.status, checkin_count: ev.attendees.length }
    },

    async getEventHost(code, token) {
      const ev = demoLoad()[code]
      if (!ev || ev.organizer_token !== token) return null
      return {
        code,
        name: ev.name,
        status: ev.status,
        checkin_count: ev.attendees.length,
        organizer_name: ev.organizer_name,
        organizer_email: ev.organizer_email,
        attendees: ev.attendees,
      }
    },

    async endEvent(code, token) {
      const events = demoLoad()
      const ev = events[code]
      if (!ev || ev.organizer_token !== token) throw new Error('Not authorized')
      ev.status = 'ended'
      demoSave(events)
      const optedIn = ev.attendees.filter((a) => a.share_contact)
      return {
        emails_sent: 0,
        opted_in: optedIn.length,
        preview: rosterText(ev.name, ev.attendees),
      }
    },
  }
}

export const api: Api = DEMO_MODE
  ? demoApi()
  : supabaseApi(createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!), SUPABASE_URL!, SUPABASE_ANON_KEY!)
