import { useMemo, useState } from 'react'
import type { HolidayCalendar, Holiday } from '../lib/api'
import {
  createHolidayCalendar,
  renameHolidayCalendar,
  deleteHolidayCalendar,
  addHoliday,
  deleteHoliday,
  importHolidays,
} from '../lib/api'
import { HOLIDAY_SEED } from '../lib/holidaysSeed'
import { useEscClose } from '../lib/useEscClose'

type Props = {
  calendars: HolidayCalendar[]
  holidays: Holiday[]
  onChanged: () => void
  onClose: () => void
}

const SEED_MARKETS = Object.keys(HOLIDAY_SEED)

// Manage named holiday calendars and their dates. Seed a market from the built-in
// starter data, or add your own calendar (e.g. China) and enter dates by hand.
export function HolidaysManager({ calendars, holidays, onChanged, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string>(calendars[0]?.id ?? '')
  const [newCalName, setNewCalName] = useState('')
  const [seedMarket, setSeedMarket] = useState(SEED_MARKETS[0] ?? '')
  const [renameVal, setRenameVal] = useState('')
  const [newDay, setNewDay] = useState('')
  const [newName, setNewName] = useState('')

  const selected = calendars.find((c) => c.id === selectedId) ?? calendars[0] ?? null
  const rows = useMemo(
    () =>
      holidays
        .filter((h) => h.calendar_id === (selected?.id ?? ''))
        .sort((a, b) => a.day.localeCompare(b.day)),
    [holidays, selected],
  )

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  useEscClose(onClose, busy)

  const addCalendar = () => {
    const name = newCalName.trim()
    if (!name) return
    run(async () => {
      const c = await createHolidayCalendar(name)
      setSelectedId(c.id)
      setNewCalName('')
    })
  }

  const seed = () => {
    if (!seedMarket) return
    run(async () => {
      let cal = calendars.find((c) => c.name.toLowerCase() === seedMarket.toLowerCase())
      if (!cal) cal = await createHolidayCalendar(seedMarket)
      await importHolidays(cal.id, HOLIDAY_SEED[seedMarket])
      setSelectedId(cal.id)
    })
  }

  const fmtDay = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal holidays-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📅 Holidays</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label="Close" title="Close (Esc)">
            ✕
          </button>
        </div>
        <p className="modal-hint">
          Named lists of market holidays. They all show on your calendar for awareness; the next
          step lets each event choose which calendar(s) it respects.
        </p>

        {error && <div className="auth-error">{error}</div>}

        <div className="hol-setup">
          <div className="hol-row">
            <span>Quick-add a market</span>
            <select value={seedMarket} onChange={(e) => setSeedMarket(e.target.value)}>
              {SEED_MARKETS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button type="button" className="btn-ghost" onClick={seed} disabled={busy}>
              Import
            </button>
          </div>
          <div className="hol-row">
            <span>New calendar</span>
            <input
              value={newCalName}
              placeholder="e.g. China"
              onChange={(e) => setNewCalName(e.target.value)}
            />
            <button type="button" className="btn-ghost" onClick={addCalendar} disabled={busy || !newCalName.trim()}>
              Add
            </button>
          </div>
        </div>

        {calendars.length === 0 ? (
          <div className="hol-empty">No calendars yet — import a market or add your own above.</div>
        ) : (
          <>
            <div className="hol-caltabs">
              {calendars.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`hol-caltab${c.id === selected?.id ? ' active' : ''}`}
                  onClick={() => {
                    setSelectedId(c.id)
                    setRenameVal('')
                  }}
                >
                  {c.name} ({holidays.filter((h) => h.calendar_id === c.id).length})
                </button>
              ))}
            </div>

            {selected && (
              <>
                <div className="hol-caltools">
                  <input
                    value={renameVal}
                    placeholder={`Rename "${selected.name}"…`}
                    onChange={(e) => setRenameVal(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy || !renameVal.trim()}
                    onClick={() => run(async () => {
                      await renameHolidayCalendar(selected.id, renameVal)
                      setRenameVal('')
                    })}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Delete the "${selected.name}" calendar and all its dates?`))
                        run(async () => {
                          await deleteHolidayCalendar(selected.id)
                          setSelectedId('')
                        })
                    }}
                  >
                    Delete calendar
                  </button>
                </div>

                <div className="hol-add">
                  <input type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)} />
                  <input
                    value={newName}
                    placeholder="Holiday name (optional)"
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy || !newDay}
                    onClick={() => run(async () => {
                      await addHoliday(selected.id, newDay, newName)
                      setNewDay('')
                      setNewName('')
                    })}
                  >
                    Add date
                  </button>
                </div>

                <div className="hol-list">
                  {rows.length === 0 && <div className="hol-empty">No dates in this calendar yet.</div>}
                  {rows.map((h) => (
                    <div className="hol-item" key={h.id}>
                      <span className="hol-date">{fmtDay(h.day)}</span>
                      <span className="hol-name">{h.name}</span>
                      <button
                        type="button"
                        className="hol-x"
                        disabled={busy}
                        aria-label="Remove"
                        onClick={() => run(() => deleteHoliday(h.id))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <div className="modal-actions">
          <div className="modal-actions-right">
            <button type="button" className="btn-primary" onClick={onClose} disabled={busy}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
