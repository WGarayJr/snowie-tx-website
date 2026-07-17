import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, DEMO_MODE } from '../lib/api'

export default function Landing() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [organizerName, setOrganizerName] = useState('')
  const [organizerEmail, setOrganizerEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await api.createEvent(name, organizerName, organizerEmail)
      navigate(`/host/${created.code}?t=${created.organizer_token}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      {DEMO_MODE && (
        <div className="banner">
          Demo mode — events are stored in this browser only. Connect Supabase to go live.
        </div>
      )}
      <header className="hero">
        <h1>
          <span className="logo">📇 RollCall</span>
        </h1>
        <p className="tagline">Check in now. Connect after.</p>
        <p className="sub">
          Put a QR code at the door. Attendees check in in 15 seconds. When the event ends,
          everyone who opted in gets the contact list by email — no more "let me find you on
          LinkedIn" that never happens.
        </p>
      </header>

      <main className="card">
        <h2>Create your event</h2>
        <form onSubmit={onSubmit}>
          <label>
            Event name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Houston Founders Mixer"
              required
              maxLength={120}
            />
          </label>
          <label>
            Your name
            <input
              value={organizerName}
              onChange={(e) => setOrganizerName(e.target.value)}
              placeholder="William Garay"
              required
              maxLength={120}
            />
          </label>
          <label>
            Your email
            <input
              type="email"
              value={organizerEmail}
              onChange={(e) => setOrganizerEmail(e.target.value)}
              placeholder="you@example.com"
              required
              maxLength={255}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create event — free'}
          </button>
        </form>
      </main>

      <section className="how">
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Create an event.</strong> You get a QR code and a private host dashboard.
          </li>
          <li>
            <strong>Attendees scan &amp; check in.</strong> Name, email, company, LinkedIn — plus
            a clear opt-in to share their info.
          </li>
          <li>
            <strong>End the event.</strong> Everyone who opted in automatically gets the contact
            list. Consent-safe: opt-outs are counted but never shared.
          </li>
        </ol>
      </section>

      <footer className="footer">RollCall · made for networking events</footer>
    </div>
  )
}
