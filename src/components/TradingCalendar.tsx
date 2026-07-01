import { forwardRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'

type Props = {
  initialView: string
  initialDate: Date
  events: EventInput[]
  onDateClick: (dateStr: string) => void
  onEventClick: (id: string) => void
  onDatesSet: (arg: DatesSetArg) => void
  onNavLinkDay: (date: Date) => void
}

// Month / Week / Agenda are handled by FullCalendar (day-grid + list). The Day
// view is our custom elastic-hour DayView, so it's intentionally absent here.
// The toolbar lives in App and drives this via a ref to the FullCalendar API.
export const TradingCalendar = forwardRef<FullCalendar, Props>(function TradingCalendar(
  { initialView, initialDate, events, onDateClick, onEventClick, onDatesSet, onNavLinkDay },
  ref,
) {
  return (
    <FullCalendar
      ref={ref}
      plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
      initialView={initialView}
      initialDate={initialDate}
      headerToolbar={false}
      firstDay={1}
      navLinks
      navLinkDayClick={(date) => onNavLinkDay(date)}
      dayMaxEvents={false}
      height="auto"
      eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
      events={events}
      datesSet={onDatesSet}
      dateClick={(arg: DateClickArg) => onDateClick(arg.dateStr.slice(0, 10))}
      eventClick={(arg: EventClickArg) => {
        arg.jsEvent.preventDefault()
        onEventClick(arg.event.id)
      }}
    />
  )
})
