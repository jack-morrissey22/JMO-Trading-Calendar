import type { EventRow, ReminderDraft } from './api'
import { fixedFireDate } from './tz'

// Newly-added reminders default to push ON (📱) so phone notifications are the
// blanket default; email stays opt-in, and push can be toggled off per reminder.
export function relative(minutes: number): ReminderDraft {
  return {
    kind: 'relative',
    minutes_before: minutes,
    days_before: null,
    at_time: null,
    channel: 'inapp',
    email: false,
    push: true,
  }
}
export function fixed(daysBefore: number, atTime: string): ReminderDraft {
  return {
    kind: 'fixed',
    minutes_before: null,
    days_before: daysBefore,
    at_time: atTime,
    channel: 'inapp',
    email: false,
    push: true,
  }
}

export const PRESETS: { label: string; make: () => ReminderDraft }[] = [
  { label: '5 minutes before', make: () => relative(5) },
  { label: '15 minutes before', make: () => relative(15) },
  { label: '30 minutes before', make: () => relative(30) },
  { label: '1 hour before', make: () => relative(60) },
  { label: '2 hours before', make: () => relative(120) },
  { label: 'Morning of (09:00)', make: () => fixed(0, '09:00') },
  { label: 'Day before (18:00)', make: () => fixed(1, '18:00') },
]

const plural = (n: number) => (n === 1 ? '' : 's')

export function labelReminder(r: ReminderDraft): string {
  if (r.kind === 'relative') {
    const m = r.minutes_before ?? 0
    if (m === 0) return 'At start'
    if (m % 1440 === 0) return `${m / 1440} day${plural(m / 1440)} before`
    if (m % 60 === 0) return `${m / 60} hour${plural(m / 60)} before`
    return `${m} min before`
  }
  const t = (r.at_time ?? '09:00').slice(0, 5)
  const d = r.days_before ?? 0
  if (d === 0) return `Morning of (${t})`
  if (d === 1) return `Day before (${t})`
  return `${d} days before (${t})`
}

/** When this reminder should fire, given its event. Relative offsets are
 *  absolute (timezone-independent); fixed "N days before at HH:MM" reminders
 *  resolve the HH:MM in the home timezone so they don't drift with the device. */
export function reminderFireTime(r: ReminderDraft, event: EventRow): Date {
  const start = new Date(event.starts_at)
  if (r.kind === 'relative') {
    return new Date(start.getTime() - (r.minutes_before ?? 0) * 60000)
  }
  return fixedFireDate(event.starts_at, r.days_before ?? 0, r.at_time ?? '09:00')
}
