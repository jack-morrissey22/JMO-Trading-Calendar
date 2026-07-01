import type { EventRow, ReminderRow } from './api'
import { labelReminder } from './reminders'

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

type TierName = (id: string | null) => string

function groupReminders(reminders: ReminderRow[]) {
  const m = new Map<string, ReminderRow[]>()
  for (const r of reminders) {
    const list = m.get(r.event_id) ?? []
    list.push(r)
    m.set(r.event_id, list)
  }
  return m
}

function csvCell(v: string) {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

// Human-readable spreadsheet. Custom sound clips aren't included (audio is not
// exported); sound_name is listed as a reference.
export function buildCsv(events: EventRow[], reminders: ReminderRow[], tierName: TierName) {
  const rem = groupReminders(reminders)
  const headers = [
    'Title', 'Date', 'Time', 'All day', 'End', 'Priority',
    'Category', 'Tags', 'Reminders', 'Speak', 'Sound', 'Notes',
  ]
  const lines = events.map((e) => {
    const d = new Date(e.starts_at)
    return [
      e.title,
      fmtDate(d),
      e.all_day ? '' : fmtTime(d),
      e.all_day ? 'yes' : '',
      e.ends_at ? fmtDate(new Date(e.ends_at)) : '',
      tierName(e.priority_tier_id),
      e.category,
      (e.tags ?? []).join(' '),
      (rem.get(e.id) ?? []).map(labelReminder).join('; '),
      e.speak ? 'yes' : '',
      e.sound_name ?? '',
      e.notes ?? '',
    ]
      .map((x) => csvCell(String(x)))
      .join(',')
  })
  return [headers.join(','), ...lines].join('\r\n')
}

// Structured backup (restore-friendly). Reminders kept in raw + labelled form.
export function buildJson(
  events: EventRow[],
  reminders: ReminderRow[],
  tierName: TierName,
  exportedAt: string,
) {
  const rem = groupReminders(reminders)
  return JSON.stringify(
    {
      app: 'JMO Trading Calendar',
      exported_at: exportedAt,
      event_count: events.length,
      events: events.map((e) => ({
        title: e.title,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        all_day: e.all_day,
        priority: tierName(e.priority_tier_id),
        category: e.category,
        tags: e.tags,
        notes: e.notes,
        speak: e.speak,
        sound_name: e.sound_name,
        reminders: (rem.get(e.id) ?? []).map((r) => ({
          kind: r.kind,
          minutes_before: r.minutes_before,
          days_before: r.days_before,
          at_time: r.at_time,
          label: labelReminder(r),
        })),
      })),
    },
    null,
    2,
  )
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
