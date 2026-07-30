// Cloudflare Worker for the JMO Trading Calendar.
//   fetch()     — serves the built SPA (static assets).
//   scheduled() — the reminder sender, run every minute by a Cron Trigger. This
//                 replaces the GitHub Actions schedule, which was unreliable
//                 (scheduled runs on GitHub's free tier lag 15-30 min under load).
// Same logic as scripts/send-reminders.mjs but push uses the Web Crypto sender
// in ./webpush.js (the Node `web-push` package can't run in a Worker).

import { sendPush } from './webpush.js'

const MINUTE_CRON = '* * * * *' // the reminder sender + heartbeat trigger.

export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  },

  async scheduled(event, env, ctx) {
    // The every-minute trigger is the sender; any other trigger (the weekly
    // Saturday one) runs the digest. Keying off the minute cron avoids relying
    // on the exact weekly cron string, which Cloudflare may normalise.
    if (event.cron === MINUTE_CRON) ctx.waitUntil(sendDueReminders(env))
    else ctx.waitUntil(sendWeeklyDigest(env))
  },
}

// Shared PostgREST/Supabase fetch wrapper (service-role key bypasses RLS).
function makeSb(url, key) {
  return (path, init = {}) =>
    fetch(`${url}${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    })
}

// Format an ISO timestamp for the digest email, in the reminder timezone.
function fmtWhen(iso, tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

// UTF-8 safe base64 for Resend attachment content.
function b64(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  return btoa(bin)
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

  const sb = makeSb(url, key)

  // Heartbeat: record that the sender ran, so the app can show a health
  // indicator and a silently-dead cron becomes visible.
  await sb('/rest/v1/service_health?id=eq.1', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_run_at: new Date().toISOString() }),
  }).catch(() => {})

  const now = Date.now()
  // 3s lookahead: also catch reminders due within the next few seconds, so a
  // reminder landing exactly on a minute boundary is never missed by a hair of
  // clock skew (worst case it fires 2-3s early instead of ~1 min late).
  const dueIso = new Date(now + 3000).toISOString()
  const floorIso = new Date(now - 12 * 60 * 60 * 1000).toISOString()

  const query =
    `/rest/v1/reminders?select=id,user_id,fire_at,email,push,events(title,starts_at,all_day)` +
    `&or=(email.eq.true,push.eq.true)&sent_at=is.null` +
    `&fire_at=lte.${encodeURIComponent(dueIso)}&fire_at=gte.${encodeURIComponent(floorIso)}`

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

// Weekly (Sat 07:00 UTC) health-check + full backup email. Entirely separate
// from the reminder path so it never buries a real reminder alert. One email
// per user with a plain-English health summary and a complete JSON backup
// (every event, reminder and repeat schedule, all fields) attached.
async function sendWeeklyDigest(env) {
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = env.RESEND_API_KEY
  const from = env.REMINDER_FROM || 'JMO Calendar <onboarding@resend.dev>'
  const tz = env.REMINDER_TZ || 'Europe/Dublin'
  if (!url || !key) {
    console.log('Digest: Supabase secrets not set — skipping.')
    return
  }
  if (!resendKey) {
    console.log('Digest: no Resend key — skipping.')
    return
  }
  const sb = makeSb(url, key)

  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const weekAgo = new Date(nowMs - 7 * 24 * 3600 * 1000).toISOString()
  const weekAhead = new Date(nowMs + 7 * 24 * 3600 * 1000).toISOString()

  const health = await sb('/rest/v1/service_health?id=eq.1&select=last_run_at')
    .then((r) => r.json())
    .catch(() => null)
  const lastRun = Array.isArray(health) && health[0]?.last_run_at ? health[0].last_run_at : null
  const healthy = lastRun && nowMs - new Date(lastRun).getTime() < 10 * 60 * 1000

  const evUsers = await sb('/rest/v1/events?select=user_id').then((r) => r.json())
  if (!Array.isArray(evUsers)) {
    console.error('Digest: user query failed:', JSON.stringify(evUsers))
    return
  }
  const userIds = [...new Set(evUsers.map((r) => r.user_id).filter(Boolean))]

  for (const uid of userIds) {
    const user = await sb(`/auth/v1/admin/users/${uid}`).then((x) => x.json())
    const to = user?.email
    if (!to) continue

    const [events, reminders, series] = await Promise.all([
      sb(`/rest/v1/events?user_id=eq.${uid}&select=*&order=starts_at`).then((r) => r.json()),
      sb(`/rest/v1/reminders?user_id=eq.${uid}&select=*&order=fire_at`).then((r) => r.json()),
      sb(`/rest/v1/series?user_id=eq.${uid}&select=*`).then((r) => r.json()),
    ])
    const evList = Array.isArray(events) ? events : []
    const remList = Array.isArray(reminders) ? reminders : []
    const serList = Array.isArray(series) ? series : []

    const sentWeek = remList.filter((r) => r.sent_at && r.sent_at >= weekAgo).length
    const queuedWeek = remList.filter(
      (r) => !r.sent_at && r.fire_at >= nowIso && r.fire_at <= weekAhead,
    ).length
    const lastSent = remList.reduce((m, r) => (r.sent_at && r.sent_at > m ? r.sent_at : m), '')

    const backup = {
      app: 'JMO Trading Calendar',
      backup_version: 1,
      exported_at: nowIso,
      counts: { events: evList.length, reminders: remList.length, series: serList.length },
      events: evList,
      reminders: remList,
      series: serList,
    }
    const json = JSON.stringify(backup, null, 2)
    const stamp = nowIso.slice(0, 10)

    const lines = [
      'JMO Trading Calendar — weekly health check & backup',
      '',
      healthy
        ? `Reminder service: OK — sender last ran ${fmtWhen(lastRun, tz)}.`
        : `Reminder service: ATTENTION — sender last ran ${lastRun ? fmtWhen(lastRun, tz) : 'never'}. It may be down; check the Cloudflare worker.`,
      `Reminders sent in the last 7 days: ${sentWeek}.`,
      `Reminders queued for the next 7 days: ${queuedWeek}.`,
      lastSent ? `Most recent reminder sent: ${fmtWhen(lastSent, tz)}.` : '',
      '',
      `On file: ${evList.length} events, ${serList.length} repeating series, ${remList.length} reminders.`,
      'A full backup (events, reminders and repeat schedules) is attached as JSON.',
      '',
      '— JMO Trading Calendar',
    ].filter(Boolean)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: `🗄 JMO Calendar — weekly backup & health check (${stamp})`,
        text: lines.join('\n'),
        attachments: [{ filename: `jmo-backup-${stamp}.json`, content: b64(json) }],
      }),
    })
    if (res.ok) console.log(`Digest sent to ${to} (${evList.length} events).`)
    else console.error('Digest Resend error', res.status, await res.text())
  }
}
