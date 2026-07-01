import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'

type Props = {
  events: EventInput[]
  onDateClick: (dateStr: string) => void
  onEventClick: (id: string) => void
}

// Presentational calendar with all four views (month / week / day / agenda).
// Data + interactions are supplied by the parent so it stays a thin shell.
export function TradingCalendar({ events, onDateClick, onEventClick }: Props) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth',
      }}
      buttonText={{
        today: 'Today',
        month: 'Month',
        week: 'Week',
        day: 'Day',
        list: 'Agenda',
      }}
      firstDay={1}
      nowIndicator
      dayMaxEvents={false}
      height="auto"
      eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
      slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
      events={events}
      dateClick={(arg: DateClickArg) => onDateClick(arg.dateStr.slice(0, 10))}
      eventClick={(arg: EventClickArg) => {
        arg.jsEvent.preventDefault()
        onEventClick(arg.event.id)
      }}
    />
  )
}
