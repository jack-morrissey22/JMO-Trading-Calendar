// Scheduled email-reminder sender. Runs from GitHub Actions every ~15 minutes
// (which also keeps the Supabase project awake). No dependencies — pure fetch.
//
// Finds due, unsent email reminders (email=true, sent_at is null, fire_at just
// passed), emails the event to the owner via Resend, and stamps sent_at so it is
// sent at most once. The Supabase SERVICE ROLE key bypasses row-level security;
// it lives only in GitHub Actions secrets, never in the app.

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const resendKey = process.env.RESEND_API_KEY
const from = process.env.REMINDER_FROM || 'JMO Calendar <onboarding@resend.dev>'
const tz = process.env.REMINDER_TZ || 'Europe/Dublin'

if (!url || !key || !resendKey) {
  console.log('Secrets not configured yet — skipping (this is expected before setup).')
  process.exit(0)
}

const sb = (path, init = {}) =>
  fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

const now = Date.now()
const nowIso = new Date(now).toISOString()
// Don't email reminders that came due long ago (e.g. while setup was pending).
const floorIso = new Date(now - 12 * 60 * 60 * 1000).toISOString()

const query =
  `/rest/v1/reminders?select=id,user_id,fire_at,events(title,starts_at,all_day)` +
  `&email=eq.true&sent_at=is.null` +
  `&fire_at=lte.${encodeURIComponent(nowIso)}&fire_at=gte.${encodeURIComponent(floorIso)}`

const due = await sb(query).then((r) => r.json())
if (!Array.isArray(due)) {
  console.error('Query failed:', JSON.stringify(due))
  process.exit(1)
}
console.log(`Due email reminders: ${due.length}`)

for (const r of due) {
  const user = await sb(`/auth/v1/admin/users/${r.user_id}`).then((x) => x.json())
  const to = user?.email
  if (!to) {
    console.error('No email for user', r.user_id)
    continue
  }

  const ev = r.events || {}
  const start = new Date(ev.starts_at)
  const title = ev.title || 'Event'

  // Compact date/time for the subject (so a day-before email shows *when*).
  const dateShort = start.toLocaleDateString('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const timeShort = start.toLocaleTimeString('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const subjectWhen = ev.all_day ? dateShort : `${dateShort} ${timeShort}`

  // Full form for the body.
  const whenFull = ev.all_day
    ? start.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
    : start.toLocaleString('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: `Reminder: ${title} — ${subjectWhen}`,
      text: `${title}\n${whenFull}\n\n— JMO Trading Calendar`,
    }),
  })
  if (!res.ok) {
    console.error('Resend error', res.status, await res.text())
    continue
  }

  await sb(`/rest/v1/reminders?id=eq.${r.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ sent_at: new Date().toISOString() }),
  })
  console.log(`Sent to ${to}: ${title}`)
}

console.log('Done.')
