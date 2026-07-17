import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { api, DEMO_MODE } from '../lib/api'
import type { EndEventResult, EventHost } from '../lib/types'

export default function Host() {
  const { code = '' } = useParams()
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const [event, setEvent] = useState<EventHost | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [ending, setEnding] = useState(false)
  const [ended, setEnded] = useState<EndEventResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const checkinUrl = `${window.location.origin}/e/${code}`

  const refresh = useCallback(async () => {
    try {
      const ev = await api.getEventHost(code, token)
      if (!ev) setNotFound(true)
      else setEvent(ev)
    } catch {
      // Malformed token (e.g. bad uuid) errors instead of returning null;
      // treat a failure before first load as not-found, otherwise keep last state.
      setEvent((prev) => {
        if (!prev) setNotFound(true)
        return prev
      })
    }
  }, [code, token])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    if (canvasRef.current && event) {
      QRCode.toCanvas(canvasRef.current, checkinUrl, { width: 260, margin: 2 })
    }
  }, [checkinUrl, event])

  async function copyLink() {
    await navigator.clipboard.writeText(checkinUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function onEndEvent() {
    if (!window.confirm('End the event and email the contact list to everyone who opted in?')) return
    setEnding(true)
    setError(null)
    try {
      const result = await api.endEvent(code, token)
      setEnded(result)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end event')
    } finally {
      setEnding(false)
    }
  }

  if (notFound)
    return (
      <div className="page center">
        <div className="card">
          <h2>Dashboard not found</h2>
          <p>This link is invalid or missing its host key. Use the exact link you got when you created the event.</p>
        </div>
      </div>
    )

  if (!event) return <div className="page center">Loading…</div>

  const optedIn = event.attendees.filter((a) => a.share_contact).length

  return (
    <div className="page">
      {DEMO_MODE && (
        <div className="banner">Demo mode — data lives in this browser only. Emails are previewed, not sent.</div>
      )}
      <header className="hero small">
        <p className="eyebrow">Host dashboard</p>
        <h1>{event.name}</h1>
        <p className="sub">
          {event.status === 'open' ? '🟢 Check-in open' : '🔴 Event ended'} ·{' '}
          {event.checkin_count} checked in · {optedIn} sharing contact info
        </p>
      </header>

      <div className="grid">
        <div className="card">
          <h2>Check-in QR</h2>
          <p className="sub">Put this on a screen or print it at the door.</p>
          <canvas ref={canvasRef} className="qr" />
          <p className="mono">{checkinUrl}</p>
          <button className="secondary" onClick={copyLink}>
            {copied ? 'Copied ✓' : 'Copy check-in link'}
          </button>
        </div>

        <div className="card">
          <h2>Attendees ({event.checkin_count})</h2>
          {event.attendees.length === 0 ? (
            <p className="sub">No check-ins yet — updates live every few seconds.</p>
          ) : (
            <ul className="attendees">
              {[...event.attendees].reverse().map((a) => (
                <li key={a.email}>
                  <strong>{a.name}</strong>
                  {a.company ? <span className="sub"> · {a.company}</span> : null}
                  <span className="pill">{a.share_contact ? 'sharing' : 'private'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        {event.status === 'open' ? (
          <>
            <h2>Wrap up</h2>
            <p className="sub">
              Ending the event closes check-in and emails the contact list to the {optedIn}{' '}
              {optedIn === 1 ? 'person' : 'people'} who opted in (plus you).
            </p>
            {error && <p className="error">{error}</p>}
            <button className="danger" onClick={onEndEvent} disabled={ending}>
              {ending ? 'Ending & sending…' : 'End event & send contact list'}
            </button>
          </>
        ) : (
          <>
            <h2>Event ended 🎉</h2>
            {ended?.preview ? (
              <>
                <p className="sub">Demo mode — here's the email that would have gone out:</p>
                <pre className="preview">{ended.preview}</pre>
              </>
            ) : (
              <p className="sub">
                The contact list went out to {ended?.emails_sent ?? optedIn} inboxes.
              </p>
            )}
          </>
        )}
      </div>

      <footer className="footer">
        Keep this link private — anyone with it can manage your event.
      </footer>
    </div>
  )
}
