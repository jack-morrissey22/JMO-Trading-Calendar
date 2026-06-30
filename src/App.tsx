import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { EventInput } from '@fullcalendar/core'
import { TradingCalendar } from './components/TradingCalendar'
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

type ModalState =
  | { open: false }
  | { open: true; event?: EventRow; initialDate?: string }

function App() {
  const { theme, toggle } = useTheme()
  const { session, loading } = useAuth()
  const queryClient = useQueryClient()
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

  // Map DB rows -> FullCalendar events, coloured by their priority tier.
  const fcEvents: EventInput[] = useMemo(() => {
    const colorOf = new Map((tiers ?? []).map((t) => [t.id, t.color]))
    return (events ?? []).map((e) => {
      const color = (e.priority_tier_id && colorOf.get(e.priority_tier_id)) || '#6b7280'
      return {
        id: e.id,
        title: e.title,
        start: e.starts_at,
        end: e.ends_at ?? undefined,
        allDay: e.all_day,
        backgroundColor: color,
        borderColor: color,
      }
    })
  }, [events, tiers])

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

  if (loading) return <div className="centered">Loading…</div>
  if (!session) return <Auth />

  const eventById = (id: string) => (events ?? []).find((e) => e.id === id)

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
        <TradingCalendar
          events={fcEvents}
          onDateClick={(dateStr) => setModal({ open: true, initialDate: dateStr })}
          onEventClick={(id) => {
            const ev = eventById(id)
            if (ev) setModal({ open: true, event: ev })
          }}
        />
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
