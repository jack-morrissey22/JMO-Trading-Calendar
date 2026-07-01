import type { EventRow } from '../lib/api'
import { coversDate, isWindow } from '../lib/events'

type Props = {
  date: Date
  events: EventRow[]
  colorOf: (tierId: string | null) => string
  onEventClick: (id: string) => void
  /** Click an (empty part of an) hour row to create an event at that hour. */
  onSlotClick: (hour: number) => void
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const pad = (n: number) => String(n).padStart(2, '0')

// Distinct style for windows (translucent fill + solid border) vs solid bars.
function barStyle(color: string, window: boolean) {
  return window
    ? { background: `${color}33`, border: `1.5px solid ${color}`, color: 'var(--text)' }
    : { background: color }
}

// Custom elastic-hour day view: a continuous 24h rail whose hour rows grow to
// fit however many point-in-time events fall in them, so a busy pre-market hour
// stretches while quiet hours stay thin. Keeps the "shape of the day" (D-refine).
export function DayView({ date, events, colorOf, onEventClick, onSlotClick }: Props) {
  const onDay = events.filter((e) => coversDate(e, date))
  const allDay = onDay.filter((e) => e.all_day)
  const timed = onDay.filter((e) => !e.all_day)

  const byHour = new Map<number, EventRow[]>()
  for (const e of timed) {
    const h = new Date(e.starts_at).getHours()
    const list = byHour.get(h) ?? []
    list.push(e)
    byHour.set(h, list)
  }
  for (const list of byHour.values()) {
    list.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  }

  return (
    <div className="dayview">
      {allDay.length > 0 && (
        <div className="dayview-row dayview-allday">
          <div className="dayview-hour-label">all-day</div>
          <div className="dayview-hour-body">
            {allDay.map((e) => (
              <button
                key={e.id}
                className={`dayview-event${e.status === 'tentative' ? ' is-tentative' : ''}`}
                style={barStyle(colorOf(e.priority_tier_id), isWindow(e))}
                onClick={() => onEventClick(e.id)}
              >
                <span className="dayview-event-title">{e.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {HOURS.map((h) => {
        const list = byHour.get(h) ?? []
        return (
          <div key={h} className="dayview-row dayview-hour" onClick={() => onSlotClick(h)}>
            <div className="dayview-hour-label">{pad(h)}:00</div>
            <div className="dayview-hour-body">
              {list.map((e) => {
                const d = new Date(e.starts_at)
                return (
                  <button
                    key={e.id}
                    className={`dayview-event${e.status === 'tentative' ? ' is-tentative' : ''}`}
                    style={{ background: colorOf(e.priority_tier_id) }}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onEventClick(e.id)
                    }}
                  >
                    <span className="dayview-event-time">
                      {pad(d.getHours())}:{pad(d.getMinutes())}
                    </span>
                    <span className="dayview-event-title">{e.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
