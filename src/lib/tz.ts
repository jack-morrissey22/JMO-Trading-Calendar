import { DateTime } from 'luxon'

// The timezone the app builds instants in when an event has no zone of its own.
// Display still follows the device clock; this only governs how a typed
// wall-clock time is turned into an absolute instant, so projection and creation
// no longer depend on which device does the work. Phase 2 adds a per-event tz
// that overrides this default.
export const HOME_TZ = 'Europe/Dublin'

// Wall-clock date+time in `tz` -> absolute instant as a UTC ISO string
// (…Z form, identical shape to Date#toISOString). e.g. zonedIso(2026,3,15,8,30,
// 'America/New_York') is US-Eastern 08:30 that day, as the correct UTC moment.
export function zonedIso(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  tz: string = HOME_TZ,
): string {
  return DateTime.fromObject({ year, month, day, hour, minute }, { zone: tz })
    .toJSDate()
    .toISOString()
}

// Same, from a "YYYY-MM-DD" date and "HH:MM" time (as the event form supplies).
export function zonedIsoFromParts(dateStr: string, timeStr: string, tz: string = HOME_TZ): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  return zonedIso(y, mo, d, h, mi, tz)
}

// Split an instant into the { date: "YYYY-MM-DD", time: "HH:MM" } wall-clock in
// `tz` — used to populate the event form so it round-trips through the same zone
// buildPayload writes in, regardless of the device.
export function partsInZone(iso: string, tz: string = HOME_TZ): { date: string; time: string } {
  const dt = DateTime.fromISO(iso).setZone(tz)
  return { date: dt.toFormat('yyyy-MM-dd'), time: dt.toFormat('HH:mm') }
}

// Fire instant for a fixed reminder ("N days before at HH:MM"): the HH:MM is in
// `tz`, and the day is counted in `tz` too, so it lands at e.g. 18:00 Irish
// regardless of the device.
export function fixedFireDate(
  startIso: string,
  daysBefore: number,
  atTime: string,
  tz: string = HOME_TZ,
): Date {
  const [h, mi] = atTime.split(':').map(Number)
  return DateTime.fromISO(startIso)
    .setZone(tz)
    .minus({ days: daysBefore })
    .set({ hour: h, minute: mi, second: 0, millisecond: 0 })
    .toJSDate()
}
