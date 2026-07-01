import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DatesSetArg, EventInput } from '@fullcalendar/core'
import type FullCalendar from '@fullcalendar/react'
import { TradingCalendar } from './components/TradingCalendar'
import { DayView } from './components/DayView'
import { WeekView } from './components/WeekView'
import { AgendaView } from './components/AgendaView'
import { EventModal } from './components/EventModal'
import type { EventTemplate } from './components/EventModal'
import { PriorityManager } from './components/PriorityManager'
import type { TierDraft } from './components/PriorityManager'
import { ReminderToaster } from './components/ReminderToaster'
import { Auth } from './components/Auth'
import { useAuth } from './auth/AuthProvider'
import { supabase } from './lib/supabase'
import {
  createEvent,
  createPriorityTier,
  createSeries,
  deleteEvent,
  deletePriorityTier,
  fetchEvents,
  fetchPriorityTiers,
  fetchReminders,
  fetchSeries,
  projectSeries,
  setEventReminders,
  setEventSeriesId,
  setEventSound,
  updateEvent,
  updatePriorityTier,
} from './lib/api'
import type { EventInputData, EventRow, ReminderDraft } from './lib/api'
import type { RecurrenceValue } from './components/RecurrenceEditor'
import { isWindow } from './lib/events'
import { buildCsv, buildJson, downloadFile } from './lib/export'
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
  const [showPriorities, setShowPriorities] = useState(false)
  const [showExport, setShowExport] = useState(false)

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

  const { data: reminders } = useQuery({
    queryKey: ['reminders'],
    queryFn: fetchReminders,
    enabled: !!session,
  })

  const { data: series } = useQuery({
    queryKey: ['series'],
    queryFn: fetchSeries,
    enabled: !!session,
  })
  void series // used from Phase 3b (inbox / top-up)

  const legendTiers = tiers && tiers.length ? tiers : PRIORITY_TIERS

  // Skipped projections are hidden everywhere; tentative ones show but styled.
  const visibleEvents = useMemo(
    () => (events ?? []).filter((e) => e.status !== 'skipped'),
    [events],
  )

  const colorOf = useMemo(() => {
    const map = new Map((tiers ?? []).map((t) => [t.id, t.color]))
    return (tierId: string | null) => (tierId && map.get(tierId)) || '#6b7280'
  }, [tiers])

  const fcEvents: EventInput[] = useMemo(
    () =>
      visibleEvents.map((e) => {
        const color = colorOf(e.priority_tier_id)
        const window = isWindow(e)
        const tentative = e.status === 'tentative'
        // FullCalendar treats an all-day `end` as exclusive, so extend by a day
        // to make the window span its final day inclusively.
        const end =
          e.all_day && e.ends_at ? addDays(new Date(e.ends_at), 1) : (e.ends_at ?? undefined)
        const classNames = [
          ...(window ? ['is-window'] : []),
          ...(tentative ? ['is-tentative'] : []),
        ]
        return {
          id: e.id,
          title: e.title,
          start: e.starts_at,
          end,
          allDay: e.all_day,
          backgroundColor: window || tentative ? `${color}33` : color,
          borderColor: color,
          textColor: window || tentative ? 'var(--text)' : '#fff',
          classNames,
        }
      }),
    [visibleEvents, colorOf],
  )

  // Cyclical memory: the most recent entry per event title, with its reminders,
  // used to pre-fill a new event of the same name.
  const templates: EventTemplate[] = useMemo(() => {
    const byTitle = new Map<string, EventRow>()
    for (const e of visibleEvents) {
      const prev = byTitle.get(e.title)
      if (!prev || new Date(e.starts_at) > new Date(prev.starts_at)) byTitle.set(e.title, e)
    }
    const remByEvent = new Map<string, ReminderDraft[]>()
    for (const r of reminders ?? []) {
      const list = remByEvent.get(r.event_id) ?? []
      list.push({
        kind: r.kind,
        minutes_before: r.minutes_before,
        days_before: r.days_before,
        at_time: r.at_time,
        channel: r.channel,
        email: r.email,
      })
      remByEvent.set(r.event_id, list)
    }
    return [...byTitle.values()].map((e) => {
      const d = new Date(e.starts_at)
      return {
        title: e.title,
        sourceId: e.id,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        all_day: e.all_day,
        priority_tier_id: e.priority_tier_id,
        category: e.category,
        tags: e.tags,
        speak: e.speak,
        sound_name: e.sound_name,
        reminders: remByEvent.get(e.id) ?? [],
      }
    })
  }, [visibleEvents, reminders])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['events'] })

  const saveMut = useMutation({
    mutationFn: async ({
      input,
      reminders: rem,
      sound,
      recurrence,
      id,
    }: {
      input: EventInputData
      reminders: ReminderDraft[]
      sound?: { data: string | null; name: string | null }
      recurrence?: RecurrenceValue | null
      id?: string
    }) => {
      let eventId = id
      if (id) await updateEvent(id, input)
      else eventId = (await createEvent(input)).id
      if (!eventId) return
      await setEventReminders(eventId, rem, input.starts_at)
      if (sound !== undefined) await setEventSound(eventId, sound.data, sound.name)

      // New recurring event → create the series and project future occurrences.
      if (!id && recurrence) {
        const start = new Date(input.starts_at)
        const time_of_day = input.all_day
          ? null
          : `${pad(start.getHours())}:${pad(start.getMinutes())}:00`
        const window_days =
          input.all_day && input.ends_at
            ? Math.max(1, Math.round((new Date(input.ends_at).getTime() - start.getTime()) / 86_400_000))
            : null
        const s = await createSeries({
          title: input.title,
          time_of_day,
          all_day: input.all_day,
          window_days,
          priority_tier_id: input.priority_tier_id,
          category: input.category,
          tags: input.tags,
          speak: input.speak,
          reminders: rem,
          rule: recurrence.rule,
          horizon_months: recurrence.horizonMonths,
          active: true,
        })
        await setEventSeriesId(eventId, s.id)
        const from = new Date(start.getFullYear(), start.getMonth(), start.getDate())
        await projectSeries(s, new Set([fmtDate(from)]), from, addMonths(from, recurrence.horizonMonths))
      }
    },
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      queryClient.invalidateQueries({ queryKey: ['series'] })
      setModal({ open: false })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      setModal({ open: false })
    },
  })

  const saveTiersMut = useMutation({
    mutationFn: async ({
      tiers: finalTiers,
      deletedIds,
    }: {
      tiers: TierDraft[]
      deletedIds: string[]
    }) => {
      for (const id of deletedIds) await deletePriorityTier(id)
      for (let i = 0; i < finalTiers.length; i++) {
        const t = finalTiers[i]
        if (t.id) await updatePriorityTier(t.id, { name: t.name, color: t.color, rank: i })
        else await createPriorityTier({ name: t.name, color: t.color, rank: i })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priority_tiers'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      setShowPriorities(false)
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

  const tierNameOf = (id: string | null) => (tiers ?? []).find((t) => t.id === id)?.name ?? ''
  const exportAs = (kind: 'csv' | 'json') => {
    const evs = events ?? []
    const rems = reminders ?? []
    const stamp = fmtDate(new Date())
    if (kind === 'csv') {
      downloadFile(`jmo-calendar-${stamp}.csv`, buildCsv(evs, rems, tierNameOf), 'text/csv;charset=utf-8')
    } else {
      downloadFile(
        `jmo-calendar-${stamp}.json`,
        buildJson(evs, rems, tierNameOf, new Date().toISOString()),
        'application/json',
      )
    }
    setShowExport(false)
  }

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
          <button
            className="header-btn"
            onClick={() => setShowPriorities(true)}
            disabled={!tiers || tiers.length === 0}
          >
            ⚙ Priorities
          </button>
          <div className="export-wrap">
            <button
              className="header-btn"
              onClick={() => setShowExport((s) => !s)}
              onBlur={() => setTimeout(() => setShowExport(false), 150)}
            >
              ⬇ Export
            </button>
            {showExport && (
              <div className="export-menu">
                <button className="export-item" onMouseDown={(e) => e.preventDefault()} onClick={() => exportAs('csv')}>
                  CSV (spreadsheet)
                </button>
                <button className="export-item" onMouseDown={(e) => e.preventDefault()} onClick={() => exportAs('json')}>
                  JSON (full backup)
                </button>
              </div>
            )}
          </div>
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
              events={visibleEvents}
              colorOf={colorOf}
              onEventClick={openEdit}
              onSlotClick={(hour) => openCreateAt(focusDate, hour)}
            />
          ) : view === 'week' ? (
            <WeekView
              weekStart={startOfWeek(focusDate)}
              events={visibleEvents}
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
              events={visibleEvents}
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
          templates={templates}
          initialDate={modal.initialDate}
          initialTime={modal.initialTime}
          initialReminders={
            modal.event
              ? (reminders ?? [])
                  .filter((r) => r.event_id === modal.event!.id)
                  .map(({ kind, minutes_before, days_before, at_time, channel, email }) => ({
                    kind,
                    minutes_before,
                    days_before,
                    at_time,
                    channel,
                    email,
                  }))
              : []
          }
          busy={saveMut.isPending || deleteMut.isPending}
          onSave={(input, rem, sound, recurrence, id) =>
            saveMut.mutate({ input, reminders: rem, sound, recurrence, id })
          }
          onDelete={(id) => deleteMut.mutate(id)}
          onClose={() => setModal({ open: false })}
        />
      )}

      <ReminderToaster
        events={visibleEvents}
        reminders={reminders ?? []}
        onOpen={(id) => openEdit(id)}
      />

      {showPriorities && (
        <PriorityManager
          tiers={tiers ?? []}
          busy={saveTiersMut.isPending}
          onSave={(finalTiers, deletedIds) =>
            saveTiersMut.mutate({ tiers: finalTiers, deletedIds })
          }
          onClose={() => setShowPriorities(false)}
        />
      )}
    </div>
  )
}

export default App
