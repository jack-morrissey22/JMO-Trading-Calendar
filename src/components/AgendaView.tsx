import { Fragment } from 'react'
import type { EventRow } from '../lib/api'

type Props = {
  monthDate: Date
  events: EventRow[]
  colorOf: (tierId: string | null) => string
  onEventClick: (id: string) => void
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Agenda as a chronological list grouped by day, then by "hourly headline"
// (Idea 2): each populated hour gets a heading and its events beneath, empty
// hours are skipped entirely. All-day events sit under an "all-day" heading.
export function AgendaView({ monthDate, events, colorOf, onEventClick }: Props) {
  const y = monthDate.getFullYear()
  const m = monthDate.getMonth()

  const monthEvents = events
    .filter((e) => {
      const d = new Date(e.starts_at)
      return d.getFullYear() === y && d.getMonth() === m
    })
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())

  if (monthEvents.length === 0) {
    return <div className="agenda-empty">No events this month.</div>
  }

  // Group into days (insertion order = chronological because pre-sorted).
  const days: { key: string; date: Date; events: EventRow[] }[] = []
  for (const e of monthEvents) {
    const d = new Date(e.starts_at)
    const key = ymd(d)
    const last = days[days.length - 1]
    if (last && last.key === key) last.events.push(e)
    else days.push({ key, date: d, events: [e] })
  }

  const row = (e: EventRow, withTime: boolean) => {
    const d = new Date(e.starts_at)
    return (
      <button key={e.id} className="agenda-item" onClick={() => onEventClick(e.id)}>
        <span className="agenda-dot" style={{ background: colorOf(e.priority_tier_id) }} />
        {withTime && (
          <span className="agenda-time">
            {pad(d.getHours())}:{pad(d.getMinutes())}
          </span>
        )}
        <span className="agenda-item-title">{e.title}</span>
      </button>
    )
  }

  return (
    <div className="agenda">
      {days.map(({ key, date, events: dayEvents }) => {
        const allDay = dayEvents.filter((e) => e.all_day)
        const timed = dayEvents.filter((e) => !e.all_day)

        // Group timed events by hour, preserving chronological order.
        const hours: { hour: number; items: EventRow[] }[] = []
        for (const e of timed) {
          const h = new Date(e.starts_at).getHours()
          const last = hours[hours.length - 1]
          if (last && last.hour === h) last.items.push(e)
          else hours.push({ hour: h, items: [e] })
        }

        return (
          <div key={key} className="agenda-day">
            <div className="agenda-day-header">
              {date.toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </div>

            {allDay.length > 0 && (
              <div className="agenda-group">
                <div className="agenda-headline">all-day</div>
                <div className="agenda-items">{allDay.map((e) => row(e, false))}</div>
              </div>
            )}

            {hours.map((g) => (
              <Fragment key={g.hour}>
                <div className="agenda-group">
                  <div className="agenda-headline">{pad(g.hour)}:00</div>
                  <div className="agenda-items">{g.items.map((e) => row(e, true))}</div>
                </div>
              </Fragment>
            ))}
          </div>
        )
      })}
    </div>
  )
}
