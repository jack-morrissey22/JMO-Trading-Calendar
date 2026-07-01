import { Fragment } from 'react'
import type { EventRow } from '../lib/api'

type Props = {
  weekStart: Date // Monday of the visible week
  events: EventRow[]
  colorOf: (tierId: string | null) => string
  onEventClick: (id: string) => void
  onSlotClick: (date: Date, hour: number) => void
  onDayHeaderClick: (date: Date) => void
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const pad = (n: number) => String(n).padStart(2, '0')

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// Week as seven elastic-hour columns sharing one hour rail. Because it's a CSS
// grid, each hour ROW auto-sizes to the busiest day in that hour — so a morning
// packed on one day stretches that row across the whole week, keeping the days
// time-aligned while still showing every point-in-time event (no column stacking).
export function WeekView({
  weekStart,
  events,
  colorOf,
  onEventClick,
  onSlotClick,
  onDayHeaderClick,
}: Props) {
  const days = HOURS.slice(0, 7).map((_, i) => addDays(weekStart, i))
  const today = new Date()

  // Index events by day column + hour, plus per-day all-day events.
  const timed = new Map<string, EventRow[]>()
  const allDay = new Map<number, EventRow[]>()
  for (const e of events) {
    const d = new Date(e.starts_at)
    const di = days.findIndex((day) => sameDay(day, d))
    if (di === -1) continue
    if (e.all_day) {
      const list = allDay.get(di) ?? []
      list.push(e)
      allDay.set(di, list)
    } else {
      const key = `${di}:${d.getHours()}`
      const list = timed.get(key) ?? []
      list.push(e)
      timed.set(key, list)
    }
  }
  for (const list of timed.values()) {
    list.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  }
  const hasAllDay = allDay.size > 0

  const bar = (e: EventRow, withTime: boolean) => {
    const d = new Date(e.starts_at)
    return (
      <button
        key={e.id}
        className="dayview-event"
        style={{ background: colorOf(e.priority_tier_id) }}
        onClick={(ev) => {
          ev.stopPropagation()
          onEventClick(e.id)
        }}
      >
        {withTime && (
          <span className="dayview-event-time">
            {pad(d.getHours())}:{pad(d.getMinutes())}
          </span>
        )}
        <span className="dayview-event-title">{e.title}</span>
      </button>
    )
  }

  return (
    <div className="weekview" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
      {/* Header row */}
      <div className="weekview-corner" />
      {days.map((d, i) => (
        <button
          key={i}
          className={`weekview-dayhead${sameDay(d, today) ? ' today' : ''}`}
          onClick={() => onDayHeaderClick(d)}
        >
          {d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
        </button>
      ))}

      {/* All-day row (only when the week has any all-day events) */}
      {hasAllDay && (
        <Fragment>
          <div className="weekview-hour-label weekview-allday-label">all-day</div>
          {days.map((_, i) => (
            <div key={i} className="weekview-cell weekview-allday-cell">
              {(allDay.get(i) ?? []).map((e) => bar(e, false))}
            </div>
          ))}
        </Fragment>
      )}

      {/* Hour rows */}
      {HOURS.map((h) => (
        <Fragment key={h}>
          <div className="weekview-hour-label">{pad(h)}:00</div>
          {days.map((d, i) => (
            <div
              key={i}
              className="weekview-cell"
              onClick={() => onSlotClick(d, h)}
            >
              {(timed.get(`${i}:${h}`) ?? []).map((e) => bar(e, true))}
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  )
}
