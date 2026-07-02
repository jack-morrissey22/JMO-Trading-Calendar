import { useMemo, useState } from 'react'
import type { EventRow } from '../lib/api'

type Props = {
  events: EventRow[] // upcoming tentative events, pre-sorted
  colorOf: (tierId: string | null) => string
  busy?: boolean
  onConfirm: (id: string) => void
  onSkip: (id: string) => void
  onAdjust: (id: string) => void
  onConfirmAll: (ids: string[]) => void
  onClose: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')
function whenLabel(e: EventRow) {
  const d = new Date(e.starts_at)
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return e.all_day ? `${day} · all day` : `${day} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// The Suggestions inbox: work through projected (tentative) occurrences —
// confirm, adjust the date, or skip each. Same data as the dashed calendar entries.
// A search box + name dropdown narrow the list so you can, e.g., type "doe" and
// confirm every matching occurrence in one go.
export function SuggestionsInbox({
  events,
  colorOf,
  busy,
  onConfirm,
  onSkip,
  onAdjust,
  onConfirmAll,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')

  // Distinct event names / categories present in the inbox, for the quick-picks.
  const names = useMemo(
    () => [...new Set(events.map((e) => e.title))].sort((a, b) => a.localeCompare(b)),
    [events],
  )
  const categories = useMemo(
    () => [...new Set(events.map((e) => e.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [events],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events.filter(
      (e) =>
        (!q || e.title.toLowerCase().includes(q)) &&
        (!name || e.title === name) &&
        (!category || e.category === category),
    )
  }, [events, query, name, category])

  const filtering = query.trim() !== '' || name !== '' || category !== ''

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal inbox" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">🔮 Suggestions</h2>
        <p className="modal-hint">
          Projected occurrences awaiting your check. Confirm, adjust the date, or skip.
        </p>

        {events.length === 0 ? (
          <div className="inbox-empty">Nothing to review — you're all caught up.</div>
        ) : (
          <>
            <div className="inbox-filters">
              <input
                className="inbox-search"
                type="search"
                placeholder="Filter by name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {(names.length > 1 || categories.length > 1) && (
                <div className="inbox-filter-selects">
                  {names.length > 1 && (
                    <select value={name} onChange={(e) => setName(e.target.value)}>
                      <option value="">All events ({names.length})</option>
                      {names.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  )}
                  {categories.length > 1 && (
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">All categories ({categories.length})</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="inbox-empty">No suggestions match your filter.</div>
            ) : (
              <div className="inbox-list">
                {filtered.map((e) => (
                  <div className="inbox-row" key={e.id}>
                    <span className="inbox-dot" style={{ background: colorOf(e.priority_tier_id) }} />
                    <div className="inbox-main">
                      <div className="inbox-title">{e.title}</div>
                      <div className="inbox-when">{whenLabel(e)}</div>
                    </div>
                    <div className="inbox-actions">
                      <button
                        className="btn-primary inbox-btn"
                        disabled={busy}
                        onClick={() => onConfirm(e.id)}
                      >
                        ✓
                      </button>
                      <button className="btn-ghost inbox-btn" disabled={busy} onClick={() => onAdjust(e.id)}>
                        Adjust
                      </button>
                      <button className="btn-ghost inbox-btn" disabled={busy} onClick={() => onSkip(e.id)}>
                        Skip
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button
                className="btn-ghost"
                disabled={busy || filtered.length === 0}
                onClick={() => onConfirmAll(filtered.map((e) => e.id))}
              >
                {filtering ? 'Confirm all matching' : 'Confirm all'} ({filtered.length})
              </button>
              <div className="modal-actions-right">
                <button className="btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
