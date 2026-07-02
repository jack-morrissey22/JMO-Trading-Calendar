// Cloudflare Worker for the JMO Trading Calendar.
//   fetch()     — serves the built SPA (static assets).
//   scheduled() — the reminder sender, run every minute by a Cron Trigger. This
//                 replaces the GitHub Actions schedule, which was unreliable
//                 (scheduled runs on GitHub's free tier lag 15-30 min under load).
// Same logic as scripts/send-reminders.mjs but push uses the Web Crypto sender
// in ./webpush.js (the Node `web-push` package can't run in a Worker).

import { sendPush } from './webpush.js'

export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sendDueReminders(env))
  },
}

function whenStrings(startsAt, allDay, tz) {
  const start = new Date(startsAt)
  const fmt = (opts) => {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(start)
    } catch {
      return new Intl.DateTimeFormat('en-GB', opts).format(start)
    }
  }
  const dateShort = fmt({ weekday: 'short', day: 'numeric', month: 'short' })
  const timeShort = fmt({ hour: '2-digit', minute: '2-digit', hour12: false })
  const subjectWhen = allDay ? dateShort : `${dateShort} ${timeShort}`
  const whenFull = allDay
    ? fmt({ weekday: 'long', day: 'numeric', month: 'long' })
    : fmt({ weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })
  return { subjectWhen, whenFull }
}

async function sendDueReminders(env) {
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log('Supabase secrets not set — skipping.')
    return
  }
  const resendKey = env.RESEND_API_KEY
  const from = env.REMINDER_FROM || 'JMO Calendar <onboarding@resend.dev>'
  const tz = env.REMINDER_TZ || 'Europe/Dublin'
  const emailEnabled = !!resendKey
  const vapid =
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
      ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
      : null

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
  const floorIso = new Date(now - 12 * 60 * 60 * 1000).toISOString()

  const query =
    `/rest/v1/reminders?select=id,user_id,fire_at,email,push,events(title,starts_at,all_day)` +
    `&or=(email.eq.true,push.eq.true)&sent_at=is.null` +
    `&fire_at=lte.${encodeURIComponent(nowIso)}&fire_at=gte.${encodeURIComponent(floorIso)}`

  const due = await sb(query).then((r) => r.json())
  if (!Array.isArray(due)) {
    console.error('Query failed:', JSON.stringify(due))
    return
  }
  if (due.length === 0) return
  console.log(`Due reminders: ${due.length} (email=${emailEnabled}, push=${!!vapid})`)

  for (const r of due) {
    const ev = r.events || {}
    const title = ev.title || 'Event'
    const { subjectWhen, whenFull } = whenStrings(ev.starts_at, ev.all_day, tz)
    let delivered = false

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
        if (res.ok) delivered = true
        else console.error('Resend error', res.status, await res.text())
      }
    }

    if (r.push && vapid) {
      const subs = await sb(
        `/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${r.user_id}`,
      ).then((x) => x.json())
      if (Array.isArray(subs)) {
        const payload = JSON.stringify({ title: `⏰ ${title}`, body: whenFull, tag: r.id, url: '/' })
        for (const s of subs) {
          try {
            await sendPush(s, payload, vapid)
            delivered = true
          } catch (err) {
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await sb(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' })
              console.log(`Pruned dead subscription ${s.id}`)
            } else {
              console.error('Push error', err?.statusCode, err?.body || err?.message)
            }
          }
        }
      }
    }

    if (delivered || (!(r.email && emailEnabled) && !(r.push && vapid))) {
      await sb(`/rest/v1/reminders?id=eq.${r.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ sent_at: new Date().toISOString() }),
      })
    }
  }
  console.log('Done.')
}
