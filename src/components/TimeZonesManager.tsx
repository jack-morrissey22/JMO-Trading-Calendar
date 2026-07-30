import { useMemo, useState } from 'react'
import type { SeriesRow } from '../lib/api'
import { MARKET_TZS, HOME_TZ } from '../lib/tz'
import { useEscClose } from '../lib/useEscClose'

type Props = {
  series: SeriesRow[]
  busy?: boolean
  onMigrate: (changes: { seriesId: string; newTz: string }[]) => void
  onClose: () => void
}

// Bulk-assign the market timezone of your repeating events. Only series appear
// here (recurring events are what drift across DST); one-off events are fixed
// moments and don't need a zone. Changing a zone converts the time automatically
// and re-times the future occurrences on save.
export function TimeZonesManager({ series, busy, onMigrate, onClose }: Props) {
  useEscClose(onClose, busy)
  const [pending, setPending] = useState<Record<string, string>>({})
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [bulkTz, setBulkTz] = useState('America/New_York')

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

  const curTz = (s: SeriesRow) => pending[s.id] ?? s.tz ?? HOME_TZ
  const setTz = (id: string, tz: string) => setPending((p) => ({ ...p, [id]: tz }))
  const applyToShown = () => setPending((p) => ({ ...p, ...Object.fromEntries(shown.map((s) => [s.id, bulkTz])) }))

  const changes = series
    .filter((s) => pending[s.id] && pending[s.id] !== (s.tz ?? HOME_TZ))
    .map((s) => ({ seriesId: s.id, newTz: pending[s.id] }))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tz-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">🕓 Time zones</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label="Close" title="Close (Esc)">
            ✕
          </button>
        </div>
        <p className="modal-hint">
          The market each repeating event's time is defined in. Changing it converts the time and
          re-times future occurrences — e.g. set your US events to <strong>US Eastern</strong> so
          they stay right through the DST-mismatch weeks.
        </p>

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
        <div className="tz-bulk">
          <span>Set all {shown.length} shown to</span>
          <select value={bulkTz} onChange={(e) => setBulkTz(e.target.value)}>
            {MARKET_TZS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={applyToShown} disabled={shown.length === 0}>
            Apply
          </button>
        </div>

        <div className="tz-list">
          {shown.length === 0 && <div className="tz-empty">No repeating events match.</div>}
          {shown.map((s) => {
            const changed = curTz(s) !== (s.tz ?? HOME_TZ)
            return (
              <div className={`tz-row${changed ? ' is-changed' : ''}`} key={s.id}>
                <div className="tz-row-main">
                  <span className="tz-row-title">{s.title}</span>
                  {s.category && <span className="tz-row-cat">{s.category}</span>}
                </div>
                <select value={curTz(s)} onChange={(e) => setTz(s.id, e.target.value)}>
                  {MARKET_TZS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>

        <div className="modal-actions">
          <span className="tz-changecount">
            {changes.length > 0 ? `${changes.length} change${changes.length > 1 ? 's' : ''} pending` : 'No changes'}
          </span>
          <div className="modal-actions-right">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || changes.length === 0}
              onClick={() => onMigrate(changes)}
            >
              {busy ? 'Applying…' : `Apply ${changes.length || ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
