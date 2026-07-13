// Recurrence engine for the proactive suggestion system. A rule is two axes:
// WHICH MONTHS (or a weekly mode) × WHICH DAY in the month. Business day = weekday
// (Mon–Fri); holidays are not modelled (the user handles those as their own
// yearly all-day events). Everything is computed in local time.

export type DayRule =
  | { type: 'nth_weekday'; nth: number; weekday: number } // nth: 1..4, or -1 = last. weekday 0=Sun..6=Sat
  | { type: 'day_of_month'; day: number; roll: 'next' | 'prev' | 'none' } // roll weekend to a weekday
  | { type: 'nth_bizday'; nth: number } // Nth business day counting FROM the start (1 = 1st weekday)
  | { type: 'nth_last_bizday'; nth: number } // 1 = last weekday, 2 = 2nd-last, …
  | { type: 'offset_snap'; day: number; offsetDays: number } // anchor day-of-month ± offset, snap to nearest weekday
  | { type: 'bizdays_before_dom'; day: number; bizdays: number } // N business days BEFORE the Dth calendar day (e.g. expiries)

export type RecurrenceRule =
  | { mode: 'weekly'; weekdays: number[] } // 0=Sun..6=Sat
  | { mode: 'monthly'; months: number[]; day: DayRule } // months: 1..12 (all 12 = monthly, [3,6,9,12] = quarterly, etc.)
  | { mode: 'manual'; dates: string[] } // explicit YYYY-MM-DD dates (no formula)
  | { mode: 'interval'; everyDays: number; anchor: string } // every N days from an anchor date (e.g. central-bank ~6 weeks)

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

function nthWeekdayOfMonth(y: number, m: number, nth: number, wd: number): Date | null {
  if (nth === -1) {
    let d = new Date(y, m + 1, 0)
    while (d.getDay() !== wd) d = new Date(y, m, d.getDate() - 1)
    return d
  }
  const first = new Date(y, m, 1)
  const off = (wd - first.getDay() + 7) % 7
  const day = 1 + off + (nth - 1) * 7
  const d = new Date(y, m, day)
  return d.getMonth() === m ? d : null // e.g. no 5th Friday
}

function nthBizday(y: number, m: number, nth: number): Date | null {
  let d = new Date(y, m, 1)
  let count = 0
  while (d.getMonth() === m) {
    if (!isWeekend(d)) {
      count++
      if (count === nth) return d
    }
    d = new Date(y, m, d.getDate() + 1)
  }
  return null // month has fewer than `nth` business days
}

function nthLastBizday(y: number, m: number, nth: number): Date {
  let d = new Date(y, m + 1, 0)
  let count = 0
  while (true) {
    if (!isWeekend(d)) {
      count++
      if (count === nth) return d
    }
    d = new Date(y, m, d.getDate() - 1)
  }
}

function rollWeekend(d: Date, roll: 'next' | 'prev' | 'none'): Date {
  if (roll === 'none') return d
  const step = roll === 'next' ? 1 : -1
  let r = new Date(d)
  while (isWeekend(r)) r = new Date(r.getFullYear(), r.getMonth(), r.getDate() + step)
  return r
}

function snapWeekday(d: Date): Date {
  if (!isWeekend(d)) return d
  const delta = d.getDay() === 6 ? -1 : 1 // Sat -> Fri, Sun -> Mon
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta)
}

function dayInMonth(y: number, m: number, rule: DayRule): Date | null {
  switch (rule.type) {
    case 'nth_weekday':
      return nthWeekdayOfMonth(y, m, rule.nth, rule.weekday)
    case 'day_of_month': {
      const d = new Date(y, m, rule.day)
      if (d.getMonth() !== m) return null
      return rollWeekend(d, rule.roll)
    }
    case 'nth_bizday':
      return nthBizday(y, m, rule.nth)
    case 'nth_last_bizday':
      return nthLastBizday(y, m, rule.nth)
    case 'offset_snap': {
      const anchor = new Date(y, m, rule.day)
      if (anchor.getMonth() !== m) return null
      return snapWeekday(new Date(y, m, rule.day + rule.offsetDays))
    }
    case 'bizdays_before_dom': {
      // Start at the Dth calendar day (clamp if the month is short), then step
      // back `bizdays` business days (weekdays only).
      let d = new Date(y, m, rule.day)
      if (d.getMonth() !== m) d = new Date(y, m + 1, 0)
      let k = rule.bizdays
      while (k > 0) {
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
        if (!isWeekend(d)) k--
      }
      return d
    }
  }
}

/** All occurrence dates of a rule within [from, to] inclusive (local dates). */
export function computeOccurrences(rule: RecurrenceRule, from: Date, to: Date): Date[] {
  const out: Date[] = []
  if (rule.mode === 'manual') {
    const f = startOfDay(from)
    return rule.dates
      .map((s) => new Date(`${s}T00:00:00`))
      .filter((d) => !isNaN(d.getTime()) && d >= f && d <= to)
      .sort((a, b) => a.getTime() - b.getTime())
  }
  if (rule.mode === 'interval') {
    const anchor = new Date(`${rule.anchor}T00:00:00`)
    if (isNaN(anchor.getTime()) || !rule.everyDays || rule.everyDays < 1) return out
    const f = startOfDay(from)
    let d = new Date(anchor)
    let guard = 0
    while (d <= to && guard++ < 5000) {
      if (d >= f) out.push(new Date(d))
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + rule.everyDays)
    }
    return out
  }
  if (rule.mode === 'weekly') {
    let d = startOfDay(from)
    while (d <= to) {
      if (rule.weekdays.includes(d.getDay())) out.push(new Date(d))
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    }
    return out
  }
  let y = from.getFullYear()
  let m = from.getMonth()
  const endMonth = new Date(to.getFullYear(), to.getMonth(), 1)
  const f = startOfDay(from)
  while (new Date(y, m, 1) <= endMonth) {
    if (rule.months.includes(m + 1)) {
      const d = dayInMonth(y, m, rule.day)
      if (d && d >= f && d <= to) out.push(d)
    }
    m++
    if (m > 11) {
      m = 0
      y++
    }
  }
  return out
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ORDINAL = ['', '1st', '2nd', '3rd', '4th']
const ord = (n: number) => (n === -1 ? 'last' : (ORDINAL[n] ?? `${n}th`))
// Ordinal for any day-of-month (1st, 2nd, 3rd, 4th … 11th, 21st, 22nd …).
function ordinalDay(n: number): string {
  const v = n % 100
  const suffix = v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}

function monthsLabel(months: number[]): string {
  if (months.length === 12) return 'every month'
  const q = [3, 6, 9, 12]
  if (months.length === 4 && q.every((x) => months.includes(x))) return 'quarterly'
  if (months.length === 1) return `every ${MONTH_NAMES[months[0]]}`
  return months.map((m) => MONTH_NAMES[m]).join(', ')
}

/** Human-readable one-liner for a rule (for the picker + series summary). */
export function describeRule(rule: RecurrenceRule): string {
  if (rule.mode === 'manual') {
    return `${rule.dates.length} specific date${rule.dates.length === 1 ? '' : 's'}`
  }
  if (rule.mode === 'interval') {
    if (rule.everyDays % 7 === 0) {
      const w = rule.everyDays / 7
      return `every ${w} week${w === 1 ? '' : 's'}`
    }
    return `every ${rule.everyDays} day${rule.everyDays === 1 ? '' : 's'}`
  }
  if (rule.mode === 'weekly') {
    return `every ${rule.weekdays.map((w) => WEEKDAY_NAMES[w]).join(' & ')}`
  }
  const d = rule.day
  let day: string
  switch (d.type) {
    case 'nth_weekday':
      day = `the ${ord(d.nth)} ${WEEKDAY_NAMES[d.weekday]}`
      break
    case 'day_of_month':
      day = `the ${d.day}${d.roll !== 'none' ? ` (roll to ${d.roll === 'next' ? 'next' : 'previous'} weekday)` : ''}`
      break
    case 'nth_bizday':
      day = `the ${ordinalDay(d.nth)} business day`
      break
    case 'nth_last_bizday':
      day = `the ${d.nth === 1 ? 'last' : `${ord(d.nth)}-last`} business day`
      break
    case 'offset_snap':
      day = `${Math.abs(d.offsetDays)} days ${d.offsetDays < 0 ? 'before' : 'after'} the ${d.day} (nearest weekday)`
      break
    case 'bizdays_before_dom':
      day = `${d.bizdays} business day${d.bizdays === 1 ? '' : 's'} before the ${ordinalDay(d.day)}`
      break
  }
  return `${day} of ${monthsLabel(rule.months)}`
}
