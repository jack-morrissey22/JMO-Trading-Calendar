// Scheduled reminder sender. Runs from GitHub Actions every ~5 minutes (which
// also keeps the Supabase project awake). Finds due, unsent reminders that are
// flagged for email and/or push, delivers them, and stamps sent_at so each is
// sent at most once. The Supabase SERVICE ROLE key bypasses row-level security;
// it lives only in GitHub Actions secrets, never in the app.
//
// Email uses Resend (needs RESEND_API_KEY). Push uses Web Push / VAPID (needs
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT). Either channel is optional
// — a reminder only uses a channel that's both flagged on it and configured here.

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const resendKey = process.env.RESEND_API_KEY
const from = process.env.REMINDER_FROM || 'JMO Calendar <onboarding@resend.dev>'
const tz = process.env.REMINDER_TZ || 'Europe/Dublin'

const vapidPublic = process.env.VAPID_PUBLIC_KEY
const vapidPrivate = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT // e.g. mailto:you@example.com

if (!url || !key) {
  console.log('Supabase secrets not configured yet — skipping (expected before setup).')
  process.exit(0)
}

const emailEnabled = !!resendKey
const pushEnabled = !!(vapidPublic && vapidPrivate && vapidSubject)

let webpush = null
if (pushEnabled) {
  webpush = (await import('web-push')).default
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
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
// 3s lookahead: also catch reminders due within the next few seconds so a
// boundary reminder is never missed by a hair of clock skew (worst case it
// fires 2-3s early instead of ~1 min late). Matches the Cloudflare worker.
const dueIso = new Date(now + 3000).toISOString()
// Don't fire reminders that came due long ago (e.g. while setup was pending).
const floorIso = new Date(now - 12 * 60 * 60 * 1000).toISOString()

const query =
  `/rest/v1/reminders?select=id,user_id,fire_at,email,push,events(title,starts_at,all_day)` +
  `&or=(email.eq.true,push.eq.true)&sent_at=is.null` +
  `&fire_at=lte.${encodeURIComponent(dueIso)}&fire_at=gte.${encodeURIComponent(floorIso)}`

const due = await sb(query).then((r) => r.json())
if (!Array.isArray(due)) {
  console.error('Query failed:', JSON.stringify(due))
  process.exit(1)
}
console.log(`Due reminders: ${due.length} (email=${emailEnabled}, push=${pushEnabled})`)

for (const r of due) {
  const ev = r.events || {}
  const start = new Date(ev.starts_at)
  const title = ev.title || 'Event'

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
  const whenFull = ev.all_day
    ? start.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
    : start.toLocaleString('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' })

  let delivered = false

  // ---- Email ----
  if (r.email && emailEnabled) {
    const user = await sb(`/auth/v1/admin/users/${r.user_id}`).then((x) => x.json())
    const to = user?.email
    if (to) {
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
      if (res.ok) {
        delivered = true
        console.log(`Emailed ${to}: ${title}`)
      } else {
        console.error('Resend error', res.status, await res.text())
      }
    } else {
      console.error('No email for user', r.user_id)
    }
  }

  // ---- Push ----
  if (r.push && pushEnabled) {
    const subs = await sb(
      `/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${r.user_id}`,
    ).then((x) => x.json())
    if (Array.isArray(subs)) {
      const payload = JSON.stringify({ title: `⏰ ${title}`, body: whenFull, tag: r.id, url: '/' })
      for (const s of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            // High urgency so iOS/Android deliver promptly instead of batching to
            // save battery; TTL 1h so a late-created push still lands but a very
            // stale reminder doesn't surface hours later.
            { urgency: 'high', TTL: 3600 },
          )
          delivered = true
          console.log(`Pushed to device ${s.id}: ${title}`)
        } catch (err) {
          const code = err?.statusCode
          // 404/410 = subscription gone; prune it so we stop trying.
          if (code === 404 || code === 410) {
            await sb(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' })
            console.log(`Pruned dead subscription ${s.id}`)
          } else {
            console.error('Push error', code, err?.body || err?.message)
          }
        }
      }
    }
  }

  // Stamp sent_at once any channel delivered (or there was nothing to do for the
  // configured channels), so we don't re-attempt the same reminder every run.
  if (delivered || (!(r.email && emailEnabled) && !(r.push && pushEnabled))) {
    await sb(`/rest/v1/reminders?id=eq.${r.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ sent_at: new Date().toISOString() }),
    })
  }
}

console.log('Done.')
