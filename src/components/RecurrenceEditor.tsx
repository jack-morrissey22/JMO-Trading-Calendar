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
    mode: 'monthly' as 'monthly' | 'weekly' | 'manual' | 'interval',
    manualText: '',
    intervalWeeks: 6,
    intervalAnchor: [seed.getFullYear(), pad2(seed.getMonth() + 1), pad2(seed.getDate())].join('-'),
    monthsPreset: 'all' as 'all' | 'quarterly' | 'yearly' | 'custom',
    customMonths: [seed.getMonth() + 1],
    yearlyMonth: seed.getMonth() + 1,
    dayType: 'nth_weekday' as DayRule['type'],
    nth: Math.ceil(seed.getDate() / 7), // which occurrence in the month the seed is (1st/2nd/…)
    weekday: seed.getDay(),
    dayOfMonth: seed.getDate(),
    roll: 'next' as 'next' | 'prev' | 'none',
    nthLast: 1,
    offsetDay: 25,
    offsetDays: -7,
    bizDom: 15, // reference day-of-month for "N business days before the Dth"
    bizDaysBefore: 2,
    weeklyDays: [seed.getDay()],
    horizonMonths: 3,
  }
  if (!initial) return base
  base.repeats = true
  base.horizonMonths = initial.horizonMonths
  const rule = initial.rule
  if (rule.mode === 'manual') {
    base.mode = 'manual'
    base.manualText = rule.dates.join('\n')
    return base
  }
  if (rule.mode === 'weekly') {
    base.mode = 'weekly'
    base.weeklyDays = rule.weekdays
    return base
  }
  if (rule.mode === 'interval') {
    base.mode = 'interval'
    base.intervalWeeks =
      rule.everyDays % 7 === 0 ? rule.everyDays / 7 : Math.max(1, Math.round(rule.everyDays / 7))
    base.intervalAnchor = rule.anchor
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
  } else if (d.type === 'bizdays_before_dom') {
    base.bizDom = d.day
    base.bizDaysBefore = d.bizdays
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

const pad2 = (n: number) => String(n).padStart(2, '0')
const ordinalSuffix = (n: number) => {
  const v = n % 100
  return v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
}
// Parse a pasted blob of dates (newline/comma separated) into YYYY-MM-DD strings.
function parseManualDates(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      const d = new Date(s)
      return isNaN(d.getTime())
        ? null
        : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    })
    .filter((x): x is string => !!x)
}

export function RecurrenceEditor({ seedDate, initial, onChange }: Props) {
  const seed = seedDate ? new Date(`${seedDate}T00:00:00`) : new Date()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const D = useMemo(() => deriveInit(initial, seed), [])

  const [repeats, setRepeats] = useState(D.repeats)
  const [mode, setMode] = useState<'monthly' | 'weekly' | 'manual' | 'interval'>(D.mode)
  const [manualText, setManualText] = useState(D.manualText)
  const [intervalWeeks, setIntervalWeeks] = useState(D.intervalWeeks)
  const [intervalAnchor] = useState(D.intervalAnchor) // fixed: seed date (new) or preserved (edit)
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
  const [bizDom, setBizDom] = useState(D.bizDom)
  const [bizDaysBefore, setBizDaysBefore] = useState(D.bizDaysBefore)
  const [weeklyDays, setWeeklyDays] = useState<number[]>(D.weeklyDays)
  const [horizonMonths, setHorizonMonths] = useState(D.horizonMonths)

  // Create mode: keep the date-derived guesses in sync as the user picks or
  // changes the event date — but only until they engage the recurrence UI.
  // deriveInit ran once at mount off the modal-open date; without this, changing
  // the date afterwards leaves a stale guess (e.g. "1st Wednesday" for a Monday).
  // Once Repeats is ticked the user owns the fields, so we stop resyncing.
  useEffect(() => {
    if (initial || repeats) return
    const s = seedDate ? new Date(`${seedDate}T00:00:00`) : new Date()
    setWeekday(s.getDay())
    setNth(Math.ceil(s.getDate() / 7))
    setDayOfMonth(s.getDate())
    setWeeklyDays([s.getDay()])
    setCustomMonths([s.getMonth() + 1])
    setYearlyMonth(s.getMonth() + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedDate])

  const rule = useMemo<RecurrenceRule | null>(() => {
    if (!repeats) return null
    if (mode === 'manual') {
      return { mode: 'manual', dates: parseManualDates(manualText) }
    }
    if (mode === 'weekly') {
      return { mode: 'weekly', weekdays: [...weeklyDays].sort() }
    }
    if (mode === 'interval') {
      // anchor is overridden by App on create; preserved from `initial` on edit.
      return { mode: 'interval', everyDays: Math.max(1, intervalWeeks) * 7, anchor: intervalAnchor }
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
    else if (dayType === 'bizdays_before_dom')
      day = { type: 'bizdays_before_dom', day: bizDom, bizdays: bizDaysBefore }
    else day = { type: 'offset_snap', day: offsetDay, offsetDays }
    return { mode: 'monthly', months, day }
  }, [
    repeats, mode, manualText, monthsPreset, customMonths, yearlyMonth, dayType, nth, weekday,
    dayOfMonth, roll, nthLast, offsetDay, offsetDays, bizDom, bizDaysBefore, weeklyDays,
    intervalWeeks, intervalAnchor,
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
            <select
              value={mode}
              onChange={(e) => {
                const m = e.target.value as 'monthly' | 'weekly' | 'manual' | 'interval'
                // horizonMonths means "occurrences ahead" for interval (default 1),
                // "months ahead" otherwise (default 3) — reset when crossing modes.
                if (m === 'interval' && mode !== 'interval') setHorizonMonths(1)
                else if (m !== 'interval' && mode === 'interval') setHorizonMonths(3)
                setMode(m)
              }}
            >
              <option value="monthly">Monthly-based</option>
              <option value="weekly">Weekly</option>
              <option value="interval">Every N weeks</option>
              <option value="manual">Manual dates</option>
            </select>
          </div>

          {mode === 'manual' ? (
            <div className="recur-row recur-manual">
              <span className="recur-lab">Dates</span>
              <div className="recur-manual-body">
                <textarea
                  rows={5}
                  placeholder={'One date per line, e.g.\n2026-07-30\n2026-09-17'}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                />
                <span className="recur-manual-count">
                  {parseManualDates(manualText).length} date(s) recognised
                </span>
              </div>
            </div>
          ) : mode === 'weekly' ? (
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
          ) : mode === 'interval' ? (
            <div className="recur-row recur-params">
              <span className="recur-lab">Every</span>
              <input
                type="number"
                min={1}
                max={104}
                value={intervalWeeks}
                onChange={(e) => setIntervalWeeks(Number(e.target.value))}
              />
              <span>weeks, from this event's date</span>
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
                  <option value="bizdays_before_dom">Business days before a date</option>
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
                {dayType === 'bizdays_before_dom' && (
                  <>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={bizDaysBefore}
                      onChange={(e) => setBizDaysBefore(Number(e.target.value))}
                    />
                    <span>business days before the</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={bizDom}
                      onChange={(e) => setBizDom(Number(e.target.value))}
                    />
                    <span>{ordinalSuffix(bizDom)}</span>
                  </>
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

          {mode !== 'manual' && (
            <div className="recur-row">
              <span className="recur-lab">Project</span>
              <select
                value={horizonMonths}
                onChange={(e) => setHorizonMonths(Number(e.target.value))}
              >
                {mode === 'interval'
                  ? [1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} occurrence{n > 1 ? 's' : ''} ahead
                      </option>
                    ))
                  : HORIZONS.map((h) => (
                      <option key={h} value={h}>
                        {h} month{h > 1 ? 's' : ''} ahead
                      </option>
                    ))}
              </select>
            </div>
          )}

          {rule && (
            <p className="recur-summary">
              ↪ {describeRule(rule)}
              {mode === 'interval'
                ? ` · projecting ${horizonMonths} ahead`
                : mode !== 'manual'
                  ? ` · projecting ${horizonMonths} month${horizonMonths > 1 ? 's' : ''}`
                  : ''}{' '}
              (tentative until you confirm each)
            </p>
          )}
        </div>
      )}
    </div>
  )
}
