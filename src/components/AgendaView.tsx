import { Fragment } from 'react'
import type { EventRow } from '../lib/api'
import { coversDate, endDay, isWindow } from '../lib/events'

type Props = {
  monthDate: Date
  events: EventRow[]
  colorOf: (tierId: string | null) => string
  onEventClick: (id: string) => void
}

const pad = (n: number) => String(n).padStart(2, '0')

// Agenda: for every day in the month with any coverage, group its events by
// "hourly headline" (Idea 2), skipping empty hours. All-day events and multi-day
// windows appear under an "all-day" heading on each day they cover.
export function AgendaView({ monthDate, events, colorOf, onEventClick }: Props) {
  const y = monthDate.getFullYear()
  const m = monthDate.getMonth()
  const lastDate = new Date(y, m + 1, 0).getDate()

  const groups: {
    key: string
    date: Date
    allDay: EventRow[]
    hours: { hour: number; items: EventRow[] }[]
  }[] = []

  for (let dd = 1; dd <= lastDate; dd++) {
    const date = new Date(y, m, dd)
    const onDay = events.filter((e) => coversDate(e, date))
    if (onDay.length === 0) continue

    const allDay = onDay.filter((e) => e.all_day)
    const timed = onDay
      .filter((e) => !e.all_day)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())

    const hours: { hour: number; items: EventRow[] }[] = []
    for (const e of timed) {
      const h = new Date(e.starts_at).getHours()
      const last = hours[hours.length - 1]
      if (last && last.hour === h) last.items.push(e)
      else hours.push({ hour: h, items: [e] })
    }

    groups.push({ key: `${y}-${m}-${dd}`, date, allDay, hours })
  }

  if (groups.length === 0) {
    return <div className="agenda-empty">No events this month.</div>
  }

  const timedRow = (e: EventRow) => {
    const d = new Date(e.starts_at)
    return (
      <button key={e.id} className="agenda-item" onClick={() => onEventClick(e.id)}>
        <span className="agenda-dot" style={{ background: colorOf(e.priority_tier_id) }} />
        <span className="agenda-time">
          {pad(d.getHours())}:{pad(d.getMinutes())}
        </span>
        <span className="agenda-item-title">{e.title}</span>
      </button>
    )
  }

  const allDayRow = (e: EventRow) => {
    const color = colorOf(e.priority_tier_id)
    const win = isWindow(e)
    return (
      <button key={e.id} className="agenda-item" onClick={() => onEventClick(e.id)}>
        <span
          className="agenda-dot"
          style={win ? { background: 'transparent', border: `2px solid ${color}` } : { background: color }}
        />
        <span className="agenda-item-title">
          {e.title}
          {win && (
            <span className="agenda-window-note">
              {' '}
              · until {endDay(e).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </span>
          )}
        </span>
      </button>
    )
  }

  return (
    <div className="agenda">
      {groups.map(({ key, date, allDay, hours }) => (
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
              <div className="agenda-items">{allDay.map(allDayRow)}</div>
            </div>
          )}

          {hours.map((g) => (
            <Fragment key={g.hour}>
              <div className="agenda-group">
                <div className="agenda-headline">{pad(g.hour)}:00</div>
                <div className="agenda-items">{g.items.map(timedRow)}</div>
              </div>
            </Fragment>
          ))}
        </div>
      ))}
    </div>
  )
}
