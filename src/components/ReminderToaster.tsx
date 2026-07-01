import { useEffect, useRef, useState } from 'react'
import type { EventRow, ReminderRow } from '../lib/api'
import { reminderFireTime } from '../lib/reminders'
import { playChime, primeSound } from '../lib/sound'

const STORAGE_KEY = 'jmo-shown-reminders'
const GRACE_MS = 8 * 60 * 60 * 1000 // only surface reminders that fired within 8h
const CHECK_MS = 20_000

type Toast = { key: string; title: string; when: string; eventId: string }

function loadShown(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}
function saveShown(set: Set<string>) {
  // Keep the list bounded so it can't grow forever.
  const arr = [...set].slice(-300)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
}

const pad = (n: number) => String(n).padStart(2, '0')
function whenLabel(e: EventRow): string {
  const d = new Date(e.starts_at)
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return e.all_day ? `${day} · all day` : `${day} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Fires in-app pop-ups for due reminders while the app is open. Best-effort by
// design (the always-on channel is email, added later).
export function ReminderToaster({
  events,
  reminders,
  onOpen,
}: {
  events: EventRow[]
  reminders: ReminderRow[]
  onOpen: (eventId: string) => void
}) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const shownRef = useRef<Set<string>>(loadShown())

  // Unlock audio on the first user interaction (browser autoplay policy).
  useEffect(() => {
    const onGesture = () => primeSound()
    window.addEventListener('pointerdown', onGesture, { once: true })
    return () => window.removeEventListener('pointerdown', onGesture)
  }, [])

  useEffect(() => {
    const check = () => {
      const now = Date.now()
      const byId = new Map(events.map((e) => [e.id, e]))
      const fresh: Toast[] = []
      for (const r of reminders) {
        const ev = byId.get(r.event_id)
        if (!ev) continue
        const ft = reminderFireTime(r, ev).getTime()
        const key = `${r.id}|${ft}`
        if (ft <= now && now - ft < GRACE_MS && !shownRef.current.has(key)) {
          shownRef.current.add(key)
          fresh.push({ key, title: ev.title, when: whenLabel(ev), eventId: ev.id })
        }
      }
      if (fresh.length) {
        setToasts((t) => [...t, ...fresh])
        saveShown(shownRef.current)
        playChime()
      }
    }
    check()
    const id = setInterval(check, CHECK_MS)
    return () => clearInterval(id)
  }, [events, reminders])

  const dismiss = (key: string) => setToasts((t) => t.filter((x) => x.key !== key))

  if (toasts.length === 0) return null
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div className="toast" key={t.key}>
          <div className="toast-body" onClick={() => onOpen(t.eventId)}>
            <div className="toast-title">🔔 {t.title}</div>
            <div className="toast-when">{t.when}</div>
          </div>
          <button className="toast-x" onClick={() => dismiss(t.key)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
