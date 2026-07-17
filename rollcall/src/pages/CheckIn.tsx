import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { EventPublic } from '../lib/types'

type Phase = 'loading' | 'form' | 'done' | 'not-found' | 'ended'

export default function CheckIn() {
  const { code = '' } = useParams()
  const [event, setEvent] = useState<EventPublic | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [share, setShare] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getEventPublic(code)
      .then((ev) => {
        if (!ev) return setPhase('not-found')
        setEvent(ev)
        setPhase(ev.status === 'open' ? 'form' : 'ended')
      })
      .catch(() => setPhase('not-found'))
  }, [code])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const ev = await api.checkIn(code, {
        name,
        email,
        company: company || undefined,
        linkedin: linkedin || undefined,
        share_contact: share,
      })
      setEvent(ev)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed — try again')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'loading') return <div className="page center">Loading…</div>

  if (phase === 'not-found')
    return (
      <div className="page center">
        <div className="card">
          <h2>Event not found</h2>
          <p>Double-check the link or QR code with your host.</p>
        </div>
      </div>
    )

  if (phase === 'ended')
    return (
      <div className="page center">
        <div className="card">
          <h2>{event?.name}</h2>
          <p>
            This event has ended and check-in is closed. If you checked in and opted to share,
            the contact list is on its way to your inbox. 📬
          </p>
        </div>
      </div>
    )

  if (phase === 'done')
    return (
      <div className="page center">
        <div className="card">
          <h2>You're checked in! ✅</h2>
          <p>
            <strong>{event?.name}</strong> · {event?.checkin_count}{' '}
            {event?.checkin_count === 1 ? 'person' : 'people'} here so far
          </p>
          <p>
            {share
              ? 'When the event wraps up, the contact list of everyone who opted in will land in your inbox.'
              : "You chose not to share your contact info — you won't appear on the list and won't receive it."}
          </p>
          <p className="sub">Now go meet someone new. 👋</p>
        </div>
      </div>
    )

  return (
    <div className="page center">
      <div className="card">
        <p className="eyebrow">Check in to</p>
        <h2>{event?.name}</h2>
        <form onSubmit={onSubmit}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} autoComplete="email" />
          </label>
          <label>
            Company / role <span className="opt">(optional)</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={160} autoComplete="organization" />
          </label>
          <label>
            LinkedIn <span className="opt">(optional)</span>
            <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} maxLength={255} placeholder="linkedin.com/in/…" />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
            <span>
              Share my contact info with other attendees who opt in, and email me the list when
              the event ends
            </span>
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Checking in…' : 'Check in'}
          </button>
        </form>
      </div>
    </div>
  )
}
