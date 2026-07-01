import { useEffect, useMemo, useState } from 'react'
import type { DayRule, RecurrenceRule } from '../lib/recurrence'
import { describeRule } from '../lib/recurrence'

export type RecurrenceValue = { rule: RecurrenceRule; horizonMonths: number }

type Props = {
  seedDate?: string // YYYY-MM-DD of the event being created, for sensible defaults
  initial?: RecurrenceValue // pre-fill when editing an existing series
  onChange: (v: RecurrenceValue | null) => void // pass a STABLE setter (e.g. useState setter)
}

// Reverse-map an existing rule (or nothing) into the editor's field defaults.
function deriveInit(initial: RecurrenceValue | undefined, seed: Date) {
  const base = {
    repeats: false,
    mode: 'monthly' as 'monthly' | 'weekly',
    monthsPreset: 'all' as 'all' | 'quarterly' | 'yearly' | 'custom',
    customMonths: [seed.getMonth() + 1],
    yearlyMonth: seed.getMonth() + 1,
    dayType: 'nth_weekday' as DayRule['type'],
    nth: 1,
    weekday: seed.getDay(),
    dayOfMonth: seed.getDate(),
    roll: 'next' as 'next' | 'prev' | 'none',
    nthLast: 1,
    offsetDay: 25,
    offsetDays: -7,
    weeklyDays: [seed.getDay()],
    horizonMonths: 3,
  }
  if (!initial) return base
  base.repeats = true
  base.horizonMonths = initial.horizonMonths
  const rule = initial.rule
  if (rule.mode === 'weekly') {
    base.mode = 'weekly'
    base.weeklyDays = rule.weekdays
    return base
  }
  base.mode = 'monthly'
  const m = rule.months
  base.monthsPreset =
    m.length === 12
      ? 'all'
      : m.length === 4 && [3, 6, 9, 12].every((x) => m.includes(x))
        ? 'quarterly'
        : m.length === 1
          ? 'yearly'
          : 'custom'
  base.customMonths = m
  base.yearlyMonth = m[0] ?? seed.getMonth() + 1
  const d = rule.day
  base.dayType = d.type
  if (d.type === 'nth_weekday') {
    base.nth = d.nth
    base.weekday = d.weekday
  } else if (d.type === 'day_of_month') {
    base.dayOfMonth = d.day
    base.roll = d.roll
  } else if (d.type === 'nth_last_bizday') {
    base.nthLast = d.nth
  } else if (d.type === 'offset_snap') {
    base.offsetDay = d.day
    base.offsetDays = d.offsetDays
  }
  return base
}

const WEEKDAYS = [
  { v: 1, l: 'Monday' },
  { v: 2, l: 'Tuesday' },
  { v: 3, l: 'Wednesday' },
  { v: 4, l: 'Thursday' },
  { v: 5, l: 'Friday' },
  { v: 6, l: 'Saturday' },
  { v: 0, l: 'Sunday' },
]
const NTHS = [
  { v: 1, l: '1st' },
  { v: 2, l: '2nd' },
  { v: 3, l: '3rd' },
  { v: 4, l: '4th' },
  { v: -1, l: 'last' },
]
const NTH_LAST = [
  { v: 1, l: 'last' },
  { v: 2, l: '2nd-last' },
  { v: 3, l: '3rd-last' },
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
  (l, i) => ({ v: i + 1, l }),
)

const HORIZONS = [1, 2, 3, 6, 12]

export function RecurrenceEditor({ seedDate, initial, onChange }: Props) {
  const seed = seedDate ? new Date(`${seedDate}T00:00:00`) : new Date()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const D = useMemo(() => deriveInit(initial, seed), [])

  const [repeats, setRepeats] = useState(D.repeats)
  const [mode, setMode] = useState<'monthly' | 'weekly'>(D.mode)
  const [monthsPreset, setMonthsPreset] = useState<'all' | 'quarterly' | 'yearly' | 'custom'>(
    D.monthsPreset,
  )
  const [customMonths, setCustomMonths] = useState<number[]>(D.customMonths)
  const [yearlyMonth, setYearlyMonth] = useState(D.yearlyMonth)
  const [dayType, setDayType] = useState<DayRule['type']>(D.dayType)
  const [nth, setNth] = useState(D.nth)
  const [weekday, setWeekday] = useState(D.weekday)
  const [dayOfMonth, setDayOfMonth] = useState(D.dayOfMonth)
  const [roll, setRoll] = useState<'next' | 'prev' | 'none'>(D.roll)
  const [nthLast, setNthLast] = useState(D.nthLast)
  const [offsetDay, setOffsetDay] = useState(D.offsetDay)
  const [offsetDays, setOffsetDays] = useState(D.offsetDays)
  const [weeklyDays, setWeeklyDays] = useState<number[]>(D.weeklyDays)
  const [horizonMonths, setHorizonMonths] = useState(D.horizonMonths)

  const rule = useMemo<RecurrenceRule | null>(() => {
    if (!repeats) return null
    if (mode === 'weekly') {
      return { mode: 'weekly', weekdays: [...weeklyDays].sort() }
    }
    const months =
      monthsPreset === 'all'
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        : monthsPreset === 'quarterly'
          ? [3, 6, 9, 12]
          : monthsPreset === 'yearly'
            ? [yearlyMonth]
            : [...customMonths].sort((a, b) => a - b)
    let day: DayRule
    if (dayType === 'nth_weekday') day = { type: 'nth_weekday', nth, weekday }
    else if (dayType === 'day_of_month') day = { type: 'day_of_month', day: dayOfMonth, roll }
    else if (dayType === 'nth_last_bizday') day = { type: 'nth_last_bizday', nth: nthLast }
    else day = { type: 'offset_snap', day: offsetDay, offsetDays }
    return { mode: 'monthly', months, day }
  }, [
    repeats, mode, monthsPreset, customMonths, yearlyMonth, dayType, nth, weekday, dayOfMonth,
    roll, nthLast, offsetDay, offsetDays, weeklyDays,
  ])

  useEffect(() => {
    onChange(rule ? { rule, horizonMonths } : null)
  }, [rule, horizonMonths, onChange])

  const toggle = (arr: number[], v: number) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

  return (
    <div className="field recur">
      <label className="field-check">
        <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
        🔁 Repeats
      </label>

      {repeats && (
        <div className="recur-body">
          <div className="recur-row">
            <span className="recur-lab">Frequency</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as 'monthly' | 'weekly')}>
              <option value="monthly">Monthly-based</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          {mode === 'weekly' ? (
            <div className="recur-row">
              <span className="recur-lab">On</span>
              <div className="recur-chips">
                {WEEKDAYS.map((w) => (
                  <button
                    type="button"
                    key={w.v}
                    className={`recur-chip${weeklyDays.includes(w.v) ? ' on' : ''}`}
                    onClick={() => setWeeklyDays((d) => toggle(d, w.v))}
                  >
                    {w.l.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="recur-row">
                <span className="recur-lab">Months</span>
                <select
                  value={monthsPreset}
                  onChange={(e) => setMonthsPreset(e.target.value as typeof monthsPreset)}
                >
                  <option value="all">Every month</option>
                  <option value="quarterly">Quarterly (Mar/Jun/Sep/Dec)</option>
                  <option value="yearly">Once a year</option>
                  <option value="custom">Specific months…</option>
                </select>
                {monthsPreset === 'yearly' && (
                  <select value={yearlyMonth} onChange={(e) => setYearlyMonth(Number(e.target.value))}>
                    {MONTHS.map((m) => (
                      <option key={m.v} value={m.v}>
                        {m.l}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {monthsPreset === 'custom' && (
                <div className="recur-chips recur-months">
                  {MONTHS.map((m) => (
                    <button
                      type="button"
                      key={m.v}
                      className={`recur-chip${customMonths.includes(m.v) ? ' on' : ''}`}
                      onClick={() => setCustomMonths((c) => toggle(c, m.v))}
                    >
                      {m.l}
                    </button>
                  ))}
                </div>
              )}

              <div className="recur-row">
                <span className="recur-lab">On</span>
                <select value={dayType} onChange={(e) => setDayType(e.target.value as DayRule['type'])}>
                  <option value="nth_weekday">Nth weekday</option>
                  <option value="day_of_month">Day of month</option>
                  <option value="nth_last_bizday">Nth-last business day</option>
                  <option value="offset_snap">Offset from a date</option>
                </select>
              </div>

              <div className="recur-row recur-params">
                {dayType === 'nth_weekday' && (
                  <>
                    <select value={nth} onChange={(e) => setNth(Number(e.target.value))}>
                      {NTHS.map((n) => (
                        <option key={n.v} value={n.v}>
                          {n.l}
                        </option>
                      ))}
                    </select>
                    <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                      {WEEKDAYS.map((w) => (
                        <option key={w.v} value={w.v}>
                          {w.l}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {dayType === 'day_of_month' && (
                  <>
                    <span>day</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(Number(e.target.value))}
                    />
                    <select value={roll} onChange={(e) => setRoll(e.target.value as typeof roll)}>
                      <option value="next">→ next weekday if weekend</option>
                      <option value="prev">→ prev weekday if weekend</option>
                      <option value="none">keep as-is</option>
                    </select>
                  </>
                )}
                {dayType === 'nth_last_bizday' && (
                  <select value={nthLast} onChange={(e) => setNthLast(Number(e.target.value))}>
                    {NTH_LAST.map((n) => (
                      <option key={n.v} value={n.v}>
                        {n.l} business day
                      </option>
                    ))}
                  </select>
                )}
                {dayType === 'offset_snap' && (
                  <>
                    <input
                      type="number"
                      value={offsetDays}
                      onChange={(e) => setOffsetDays(Number(e.target.value))}
                    />
                    <span>days from the</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={offsetDay}
                      onChange={(e) => setOffsetDay(Number(e.target.value))}
                    />
                    <span>(nearest weekday)</span>
                  </>
                )}
              </div>
            </>
          )}

          <div className="recur-row">
            <span className="recur-lab">Project</span>
            <select value={horizonMonths} onChange={(e) => setHorizonMonths(Number(e.target.value))}>
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {h} month{h > 1 ? 's' : ''} ahead
                </option>
              ))}
            </select>
          </div>

          {rule && (
            <p className="recur-summary">
              ↪ {describeRule(rule)} · projecting {horizonMonths} month{horizonMonths > 1 ? 's' : ''}{' '}
              (tentative until you confirm each)
            </p>
          )}
        </div>
      )}
    </div>
  )
}
