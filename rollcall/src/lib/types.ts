export type EventStatus = 'open' | 'ended'

export interface EventPublic {
  code: string
  name: string
  status: EventStatus
  checkin_count: number
}

export interface Attendee {
  name: string
  email: string
  company: string | null
  linkedin: string | null
  share_contact: boolean
  created_at: string
}

export interface EventHost extends EventPublic {
  organizer_name: string
  organizer_email: string
  attendees: Attendee[]
}

export interface CreatedEvent {
  code: string
  organizer_token: string
}

export interface CheckInInput {
  name: string
  email: string
  company?: string
  linkedin?: string
  share_contact: boolean
}

export interface EndEventResult {
  emails_sent: number
  opted_in: number
  /** Demo mode only: the email body that would have been sent */
  preview?: string
}
