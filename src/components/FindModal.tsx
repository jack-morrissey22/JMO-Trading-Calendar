import { useMemo, useState } from 'react'
import type { EventRow } from '../lib/api'
import { useEscClose } from '../lib/useEscClose'

type Props = {
  events: EventRow[]
  colorOf: (tierId: string | null) => string
  /** Jump the calendar to this occurrence and open it. */
  onPick: (eventId: string) => void
  onClose: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')

function whenLabel(e: EventRow): string {
  const d = new Date(e.starts_at)
  const day = d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return e.all_day ? `${day} · all day` : `${day} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function shortWhen(e: EventRow): string {
  const d = new Date(e.starts_at)
  const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return e.all_day ? day : `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Match = {
  title: string
  color: string
  next: EventRow | null
  following: EventRow[]
  lastPast: EventRow | null
}

// "When is the next X?" — search across ALL events (confirmed and tentative) by
// name and show the soonest upcoming occurrence. Unlike Suggestions this finds
// the next one even after you've confirmed it.
export function FindModal({ events, colorOf, onPick, onClose }: Props) {
  useEscClose(onClose)
  const [query, setQuery] = useState('')

  const matches = useMemo<Match[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const cut = todayStart.getTime()

    // Group matching events by exact title.
    const byTitle = new Map<string, EventRow[]>()
    for (const e of events) {
      if (!e.title.toLowerCase().includes(q)) continue
      const list = byTitle.get(e.title)
      if (list) list.push(e)
      else byTitle.set(e.title, [e])
    }

    const out: Match[] = []
    for (const [title, list] of byTitle) {
      const upcoming = list
        .filter((e) => new Date(e.starts_at).getTime() >= cut)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      const past = list
        .filter((e) => new Date(e.starts_at).getTime() < cut)
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
      const next = upcoming[0] ?? null
      const ref = next ?? past[0] ?? null
      out.push({
        title,
        color: colorOf(ref?.priority_tier_id ?? null),
        next,
        following: upcoming.slice(1, 3),
        lastPast: next ? null : (past[0] ?? null),
      })
    }

    // Soonest next first; events with no upcoming occurrence sink to the bottom.
    out.sort((a, b) => {
      if (a.next && b.next) return a.next.starts_at.localeCompare(b.next.starts_at)
      if (a.next) return -1
      if (b.next) return 1
      return (b.lastPast?.starts_at ?? '').localeCompare(a.lastPast?.starts_at ?? '')
    })
    return out.slice(0, 12)
  }, [events, query, colorOf])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal find-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">🔭 Find next</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
        <p className="modal-hint">
          Search any event by name to see its next occurrence — confirmed or projected.
        </p>

        <input
          className="find-input"
          type="search"
          placeholder="Type an event name… (e.g. CPI, Tesla, DOE)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <div className="find-results">
          {query.trim() === '' && (
            <div className="find-empty">Start typing an event name.</div>
          )}
          {query.trim() !== '' && matches.length === 0 && (
            <div className="find-empty">No events match “{query.trim()}”.</div>
          )}
          {matches.map((m) => {
            const pick = m.next ?? m.lastPast
            return (
              <button
                key={m.title}
                type="button"
                className="find-result"
                onClick={() => pick && onPick(pick.id)}
                disabled={!pick}
              >
                <span className="find-dot" style={{ background: m.color }} />
                <span className="find-main">
                  <span className="find-title">{m.title}</span>
                  {m.next ? (
                    <span className="find-when">
                      <span className="find-next-label">next</span> {whenLabel(m.next)}
                      {m.next.status === 'tentative' && (
                        <span className="find-tag">projected</span>
                      )}
                      {m.following.length > 0 && (
                        <span className="find-following">
                          then {m.following.map(shortWhen).join(', ')}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="find-when find-none">
                      no upcoming{m.lastPast ? ` · last was ${whenLabel(m.lastPast)}` : ''}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <div className="modal-actions">
          <div className="modal-actions-right">
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
