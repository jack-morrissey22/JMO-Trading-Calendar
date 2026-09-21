import { useMemo, useState } from 'react'
import type { SeriesRow } from '../lib/api'
import { useEscClose } from '../lib/useEscClose'

type Calendar = { id: string; name: string }

type Props = {
  series: SeriesRow[]
  calendars: Calendar[]
  busy?: boolean
  onApply: (changes: { seriesId: string; ids: string[] }[]) => void
  onClose: () => void
}

// Two id lists are equal as sets (order-independent).
const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')

// Bulk-assign which holiday calendar(s) each repeating event RESPECTS — the one
// place to set holidays across every series at once, instead of opening each
// event from the calendar. Applying sets the series + all its occurrences
// (past, confirmed and projected) and re-projects the future holiday-aware, so
// business-day patterns skip the holidays and the landing-on-holiday flag shows
// everywhere. One-off (non-repeating) events aren't listed — set those on the
// event itself.
export function HolidayRosterManager({ series, calendars, busy, onApply, onClose }: Props) {
  useEscClose(onClose, busy)
  const [pending, setPending] = useState<Record<string, string[]>>({})
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [bulkIds, setBulkIds] = useState<string[]>([])

  const categories = useMemo(
    () => [...new Set(series.map((s) => s.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [series],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return series
      .filter((s) => (!category || s.category === category) && (!q || s.title.toLowerCase().includes(q)))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [series, category, query])

  const curIds = (s: SeriesRow): string[] => pending[s.id] ?? s.holiday_calendar_ids ?? []
  const toggleRow = (s: SeriesRow, calId: string) => {
    const cur = curIds(s)
    const next = cur.includes(calId) ? cur.filter((x) => x !== calId) : [...cur, calId]
    setPending((p) => ({ ...p, [s.id]: next }))
  }
  const toggleBulk = (calId: string) =>
    setBulkIds((ids) => (ids.includes(calId) ? ids.filter((x) => x !== calId) : [...ids, calId]))
  const applyToShown = () =>
    setPending((p) => ({ ...p, ...Object.fromEntries(shown.map((s) => [s.id, bulkIds])) }))

  const changes = series
    .filter((s) => pending[s.id] && !sameIds(pending[s.id], s.holiday_calendar_ids ?? []))
    .map((s) => ({ seriesId: s.id, ids: pending[s.id] }))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tz-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📅 Holiday roster</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label="Close" title="Close (Esc)">
            ✕
          </button>
        </div>
        <p className="modal-hint">
          Which holiday calendar(s) each repeating event respects. Applying sets the whole series —
          every occurrence, past and future — then re-projects: business-day patterns skip these
          holidays, and any occurrence that lands on one is flagged. One-off events aren't listed;
          set those on the event itself.
        </p>

        {calendars.length === 0 ? (
          <div className="tz-empty">
            No holiday calendars yet — add some in <strong>📅 Holidays</strong> first.
          </div>
        ) : (
          <>
            <div className="tz-toolbar">
              <input
                className="tz-search"
                type="search"
                placeholder="Search by name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="tz-bulk hol-roster-bulk">
              <span>Set all {shown.length} shown to</span>
              <div className="hol-roster-chips">
                {calendars.map((c) => (
                  <label key={c.id} className={`holiday-respect-chip${bulkIds.includes(c.id) ? ' on' : ''}`}>
                    <input type="checkbox" checked={bulkIds.includes(c.id)} onChange={() => toggleBulk(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
              <button type="button" className="btn-ghost" onClick={applyToShown} disabled={shown.length === 0}>
                {bulkIds.length === 0 ? 'Clear all shown' : 'Apply to shown'}
              </button>
            </div>

            <div className="tz-list">
              {shown.length === 0 && <div className="tz-empty">No repeating events match.</div>}
              {shown.map((s) => {
                const ids = curIds(s)
                const changed = !sameIds(ids, s.holiday_calendar_ids ?? [])
                return (
                  <div className={`tz-row hol-roster-row${changed ? ' is-changed' : ''}`} key={s.id}>
                    <div className="tz-row-main">
                      <span className="tz-row-title">{s.title}</span>
                      {s.category && <span className="tz-row-cat">{s.category}</span>}
                    </div>
                    <div className="hol-roster-chips">
                      {calendars.map((c) => (
                        <label key={c.id} className={`holiday-respect-chip${ids.includes(c.id) ? ' on' : ''}`}>
                          <input type="checkbox" checked={ids.includes(c.id)} onChange={() => toggleRow(s, c.id)} />
                          {c.name}
                        </label>
                      ))}
                      {ids.length === 0 && <span className="hol-roster-none">respects none</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="modal-actions">
              <span className="tz-changecount">
                {changes.length > 0
                  ? `${changes.length} series change${changes.length > 1 ? 's' : ''} pending`
                  : 'No changes'}
              </span>
              <div className="modal-actions-right">
                <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || changes.length === 0}
                  onClick={() => onApply(changes)}
                >
                  {busy ? 'Applying…' : `Apply ${changes.length || ''}`.trim()}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
