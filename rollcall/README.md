# 📇 RollCall

**Check in now. Connect after.**

A micro app for networking events: put a QR code at the door, attendees check in
in ~15 seconds, and when the organizer ends the event, everyone who opted in gets
the contact list by email. No more "let me find you on LinkedIn" that never happens.

## How it works

1. **Organizer creates an event** on the landing page → gets a QR code + a private
   host dashboard link.
2. **Attendees scan the QR** → `/e/{code}` → name, email, company, LinkedIn, plus a
   clear opt-in checkbox to share their contact info.
3. **Organizer hits "End event"** → check-in closes and the contact list (opt-ins
   only) is emailed to every opted-in attendee and the organizer.

Consent-safe by design: attendees who don't opt in are never included in the list
and never emailed.

## Stack

- **Frontend** — Vite + React + TypeScript, static build (deploys free on Vercel/Netlify)
- **Database** — Supabase Postgres. RLS is enabled with **no policies**; every read/write
  goes through `SECURITY DEFINER` RPCs so the public anon key can never dump attendee
  emails or host tokens.
- **Email** — Supabase Edge Function (`end-event`) + [Resend](https://resend.com)

## Demo mode (zero setup)

```bash
npm install
npm run dev
```

With no `.env`, the app runs fully in the browser (localStorage): create an event,
check people in, end the event and see a preview of the email that would go out.
Perfect for demos and development.

## Going live (~10 minutes)

1. **Create a Supabase project** at [database.new](https://database.new) (free tier).
2. **Run the schema**: open the SQL editor, paste `supabase/schema.sql`, run it.
3. **Deploy the edge function**:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy end-event
   npx supabase secrets set RESEND_API_KEY=re_xxx
   # optional, once you've verified a domain in Resend:
   npx supabase secrets set FROM_EMAIL="RollCall <hello@yourdomain.com>"
   ```
4. **Configure the frontend**: copy `.env.example` to `.env` and fill in your
   project URL and anon key (Supabase → Settings → API).
5. **Deploy the frontend**: push to GitHub and import into
   [Vercel](https://vercel.com) (set the two `VITE_*` env vars in project settings).
   `vercel.json` already handles SPA routing.

## Roadmap ideas

- Organizer accounts (Supabase Auth) + event history
- CSV export of attendees
- vCard / "add to contacts" links in the roster email
- Rate limiting on check-in (Supabase edge middleware or Cloudflare Turnstile)
- Custom branding per event

## Security notes

- The host dashboard is protected by an unguessable token in the URL — anyone with
  the link can manage the event, so hosts should keep it private.
- The anon key is public by design; the SQL schema revokes all direct table access
  and exposes only the four RPCs.
- `end-event` runs with the service role key server-side only and validates the
  host token before doing anything.
