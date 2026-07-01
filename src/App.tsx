import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DatesSetArg, EventInput } from '@fullcalendar/core'
import type FullCalendar from '@fullcalendar/react'
import { TradingCalendar } from './components/TradingCalendar'
import { DayView } from './components/DayView'
import { WeekView } from './components/WeekView'
import { AgendaView } from './components/AgendaView'
import { EventModal } from './components/EventModal'
import { Auth } from './components/Auth'
import { useAuth } from './auth/AuthProvider'
import { supabase } from './lib/supabase'
import {
  createEvent,
  deleteEvent,
  fetchEvents,
  fetchPriorityTiers,
  updateEvent,
} from './lib/api'
import type { EventInputData, EventRow } from './lib/api'
import { PRIORITY_TIERS } from './data'
import { useTheme } from './useTheme'
import './App.css'

type ViewKey = 'month' | 'week' | 'day' | 'agenda'
type FcViewKey = 'month'
const FC_VIEW: Record<FcViewKey, string> = {
  month: 'dayGridMonth',
}
const isFc = (v: ViewKey): v is FcViewKey => v === 'month'

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d: Date, n: number) => {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
const addMonths = (d: Date, n: number) => {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}
const monthTitle = (d: Date) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
const startOfWeek = (d: Date) => {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7)) // Monday-based
  return r
}
const dayTitle = (d: Date) =>
  d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
const weekTitle = (d: Date) => {
  const ws = startOfWeek(d)
  const we = addDays(ws, 6)
  const s = ws.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const e = we.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${s} – ${e}`
}

type ModalState =
  | { open: false }
  | { open: true; event?: EventRow; initialDate?: string; initialTime?: string }

function App() {
  const { theme, toggle } = useTheme()
  const { session, loading } = useAuth()
  const queryClient = useQueryClient()
  const calRef = useRef<FullCalendar>(null)

  const [view, setView] = useState<ViewKey>('month')
  const [focusDate, setFocusDate] = useState<Date>(new Date())
  const [fcTitle, setFcTitle] = useState('')
  const [modal, setModal] = useState<ModalState>({ open: false })

  const { data: tiers } = useQuery({
    queryKey: ['priority_tiers'],
    queryFn: fetchPriorityTiers,
    enabled: !!session,
  })

  const { data: events } = useQuery({
    queryKey: ['events'],
    queryFn: fetchEvents,
    enabled: !!session,
  })

  const legendTiers = tiers && tiers.length ? tiers : PRIORITY_TIERS

  const colorOf = useMemo(() => {
    const map = new Map((tiers ?? []).map((t) => [t.id, t.color]))
    return (tierId: string | null) => (tierId && map.get(tierId)) || '#6b7280'
  }, [tiers])

  const fcEvents: EventInput[] = useMemo(
    () =>
      (events ?? []).map((e) => {
        const color = colorOf(e.priority_tier_id)
        return {
          id: e.id,
          title: e.title,
          start: e.starts_at,
          end: e.ends_at ?? undefined,
          allDay: e.all_day,
          backgroundColor: color,
          borderColor: color,
        }
      }),
    [events, colorOf],
  )

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['events'] })

  const saveMut = useMutation({
    mutationFn: ({ input, id }: { input: EventInputData; id?: string }) =>
      id ? updateEvent(id, input) : createEvent(input),
    onSuccess: () => {
      invalidate()
      setModal({ open: false })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: () => {
      invalidate()
      setModal({ open: false })
    },
  })

  // ---- Toolbar handlers ----
  const selectView = (next: ViewKey) => {
    if (isFc(next) && isFc(view)) calRef.current?.getApi().changeView(FC_VIEW[next])
    setView(next)
  }

  const shift = (dir: -1 | 1) => {
    if (view === 'day') setFocusDate((d) => addDays(d, dir))
    else if (view === 'week') setFocusDate((d) => addDays(d, dir * 7))
    else if (view === 'agenda') setFocusDate((d) => addMonths(d, dir))
    else calRef.current?.getApi()[dir === -1 ? 'prev' : 'next']()
  }
  const goToday = () => {
    if (view === 'month') calRef.current?.getApi().today()
    else setFocusDate(new Date())
  }

  const onDatesSet = (arg: DatesSetArg) => {
    setFocusDate(arg.view.currentStart)
    setFcTitle(arg.view.title)
  }

  if (loading) return <div className="centered">Loading…</div>
  if (!session) return <Auth />

  const eventById = (id: string) => (events ?? []).find((e) => e.id === id)
  const openEdit = (id: string) => {
    const ev = eventById(id)
    if (ev) setModal({ open: true, event: ev })
  }
  const openCreateAt = (date: Date, hour: number) =>
    setModal({ open: true, initialDate: fmtDate(date), initialTime: `${pad(hour)}:00` })

  const title =
    view === 'day'
      ? dayTitle(focusDate)
      : view === 'week'
        ? weekTitle(focusDate)
        : view === 'agenda'
          ? monthTitle(focusDate)
          : fcTitle

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">JMO</span>
          <span className="brand-title">Trading Calendar</span>
        </div>

        <div className="legend">
          {legendTiers.map((t) => (
            <span className="legend-item" key={t.id}>
              <span className="legend-dot" style={{ background: t.color }} />
              {t.name}
            </span>
          ))}
        </div>

        <div className="header-actions">
          <button className="btn-primary" onClick={() => setModal({ open: true })}>
            + New event
          </button>
          <button className="theme-toggle" onClick={toggle} aria-label="Toggle light/dark theme">
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
          <button className="signout" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="calendar-wrap">
        <div className="cal-toolbar">
          <div className="cal-nav">
            <button className="cal-btn" onClick={() => shift(-1)} aria-label="Previous">
              ‹
            </button>
            <button className="cal-btn" onClick={() => shift(1)} aria-label="Next">
              ›
            </button>
            <button className="cal-btn" onClick={goToday}>
              Today
            </button>
          </div>
          <div className="cal-title">{title}</div>
          <div className="cal-views">
            {(['month', 'week', 'day', 'agenda'] as ViewKey[]).map((v) => (
              <button
                key={v}
                className={`cal-btn${view === v ? ' active' : ''}`}
                onClick={() => selectView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="cal-scroll">
          {view === 'day' ? (
            <DayView
              date={focusDate}
              events={events ?? []}
              colorOf={colorOf}
              onEventClick={openEdit}
              onSlotClick={(hour) => openCreateAt(focusDate, hour)}
            />
          ) : view === 'week' ? (
            <WeekView
              weekStart={startOfWeek(focusDate)}
              events={events ?? []}
              colorOf={colorOf}
              onEventClick={openEdit}
              onSlotClick={openCreateAt}
              onDayHeaderClick={(date) => {
                setFocusDate(date)
                setView('day')
              }}
            />
          ) : view === 'agenda' ? (
            <AgendaView
              monthDate={focusDate}
              events={events ?? []}
              colorOf={colorOf}
              onEventClick={openEdit}
            />
          ) : (
            <TradingCalendar
              ref={calRef}
              initialView={FC_VIEW.month}
              initialDate={focusDate}
              events={fcEvents}
              onDateClick={(dateStr) => setModal({ open: true, initialDate: dateStr })}
              onEventClick={openEdit}
              onDatesSet={onDatesSet}
              onNavLinkDay={(date) => {
                setFocusDate(date)
                setView('day')
              }}
            />
          )}
        </div>
      </main>

      <footer className="app-footer">
        Signed in as {session.user.email} · {events?.length ?? 0} event
        {(events?.length ?? 0) === 1 ? '' : 's'} · synced to your database
      </footer>

      {modal.open && (
        <EventModal
          tiers={legendTiers}
          event={modal.event}
          initialDate={modal.initialDate}
          initialTime={modal.initialTime}
          busy={saveMut.isPending || deleteMut.isPending}
          onSave={(input, id) => saveMut.mutate({ input, id })}
          onDelete={(id) => deleteMut.mutate(id)}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}

export default App
