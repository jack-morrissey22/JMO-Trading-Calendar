import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'

type Props = {
  events: EventInput[]
  onDateClick: (dateStr: string) => void
  onEventClick: (id: string) => void
}

// Presentational calendar. Month / Week / Day all use the day-grid (list-per-day)
// style rather than a time-grid: trading events are single points in time, not
// duration blocks, so we list them vertically as "dot · time · title" and let a
// busy day elongate instead of cramming concurrent events into columns.
// Agenda is the chronological list view.
export function TradingCalendar({ events, onDateClick, onEventClick }: Props) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,dayGridWeek,dayGridDay,listMonth',
      }}
      buttonText={{
        today: 'Today',
        month: 'Month',
        week: 'Week',
        day: 'Day',
        list: 'Agenda',
      }}
      firstDay={1}
      dayMaxEvents={false}
      height="auto"
      eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
      events={events}
      dateClick={(arg: DateClickArg) => onDateClick(arg.dateStr.slice(0, 10))}
      eventClick={(arg: EventClickArg) => {
        arg.jsEvent.preventDefault()
        onEventClick(arg.event.id)
      }}
    />
  )
}
