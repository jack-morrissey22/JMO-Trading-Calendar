import type { EventRow } from './api'

// Helpers for reasoning about single-point events vs multi-day "windows"
// (all-day events with an end date, e.g. a contract-roll period or a holiday).

export function dayStart(d: Date) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export function startDay(e: EventRow) {
  return dayStart(new Date(e.starts_at))
}

export function endDay(e: EventRow) {
  return e.ends_at ? dayStart(new Date(e.ends_at)) : startDay(e)
}

/** A window = an all-day event that spans more than one day. */
export function isWindow(e: EventRow) {
  return e.all_day && endDay(e).getTime() > startDay(e).getTime()
}

/** Does this event appear on the given calendar day? (Range for windows.) */
export function coversDate(e: EventRow, date: Date) {
  const d = dayStart(date).getTime()
  return d >= startDay(e).getTime() && d <= endDay(e).getTime()
}
