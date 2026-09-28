// Regenerates src/lib/holidaysSeed.ts — the starter holiday data offered by the
// "Quick-add a market" import in the Holidays manager. Public holidays only, in
// each market's own language (the date-holidays library default), for YEARS below.
//
//   node scripts/gen-holidays.mjs
//
// date-holidays is a devDependency; the generated file is static (the library is
// NOT bundled into the app). Bump YEARS and re-run to extend into later years.

import Holidays from 'date-holidays'
import { writeFileSync } from 'node:fs'

const YEARS = [2026, 2027, 2028]

// Label shown in the app → the date-holidays country code.
const MARKETS = {
  US: 'US',
  UK: 'GB',
  Germany: 'DE',
  France: 'FR',
  Japan: 'JP',
  Singapore: 'SG',
  Canada: 'CA',
  Switzerland: 'CH',
  China: 'CN',
  Spain: 'ES',
}

// Force English names for a market instead of its own language (which is the
// default). China's holidays would otherwise be in Chinese.
const ENGLISH = new Set(['China'])

const seed = {}
for (const [label, code] of Object.entries(MARKETS)) {
  const hd = new Holidays(code)
  if (ENGLISH.has(label)) hd.setLanguages('en')
  const byDay = new Map() // de-dupe if two years or rule variants collide on a day
  for (const year of YEARS) {
    for (const h of hd.getHolidays(year)) {
      if (h.type !== 'public') continue // exchanges close for public holidays
      const day = h.date.slice(0, 10) // "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DD"
      if (!byDay.has(day)) byDay.set(day, h.name)
    }
  }
  seed[label] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, name]) => ({ day, name }))
}

// Derived "US Market (NYSE)" calendar: US federal public holidays MINUS Columbus
// Day and Veterans Day (exchanges stay open those days), PLUS Good Friday (which
// markets close for but is not a federal holiday). This is the right calendar for
// exchange/market-driven releases (e.g. ISM) — distinct from the BLS/federal "US"
// calendar (BLS releases DO happen on Good Friday, and DON'T on Columbus/Veterans).
{
  const us = new Holidays('US')
  const gb = new Holidays('GB') // Good Friday is public here; its date is identical worldwide
  const DROP = /columbus|veterans/i
  const byDay = new Map()
  for (const year of YEARS) {
    for (const h of us.getHolidays(year)) {
      if (h.type !== 'public' || DROP.test(h.name)) continue
      const day = h.date.slice(0, 10)
      if (!byDay.has(day)) byDay.set(day, h.name)
    }
    for (const h of gb.getHolidays(year)) {
      if (h.type !== 'public' || !/good friday/i.test(h.name)) continue
      const day = h.date.slice(0, 10)
      if (!byDay.has(day)) byDay.set(day, 'Good Friday')
    }
  }
  seed['US Market (NYSE)'] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, name]) => ({ day, name }))
}

// Derived "Canada (TSX)" calendar: Ontario statutory holidays (what Toronto and
// StatCan follow — includes Family Day and Victoria Day, which the sparse federal
// "Canada" set omits) plus the August Civic Holiday that TSX also closes for. Use
// this for Canadian market/StatCan releases rather than the federal "Canada".
{
  const on = new Holidays('CA', 'ON')
  const byDay = new Map()
  for (const year of YEARS) {
    for (const h of on.getHolidays(year)) {
      if (h.type !== 'public') continue
      const day = h.date.slice(0, 10)
      if (!byDay.has(day)) byDay.set(day, h.name)
    }
    // August Civic Holiday = 1st Monday of August (TSX closes; not ON-statutory).
    const d = new Date(year, 7, 1)
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
    const civic = `${year}-08-${String(d.getDate()).padStart(2, '0')}`
    if (!byDay.has(civic)) byDay.set(civic, 'Civic Holiday')
  }
  seed['Canada (TSX)'] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, name]) => ({ day, name }))
}

// Derived "US Bond Market (SIFMA)" calendar: all US federal public holidays (the
// bond market closes for every one, INCLUDING Columbus & Veterans Day that NYSE
// stays open for) PLUS Good Friday. Use for Treasury auctions / bond-market
// events. Treasury shifts an auction EARLIER when its day is a bond holiday, so
// pair this with rule #7's "holiday → previous business day" (backward) roll.
{
  const us = new Holidays('US')
  const gb = new Holidays('GB') // Good Friday is public here; identical date worldwide
  const byDay = new Map()
  for (const year of YEARS) {
    for (const h of us.getHolidays(year)) {
      if (h.type !== 'public') continue
      const day = h.date.slice(0, 10)
      if (!byDay.has(day)) byDay.set(day, h.name)
    }
    for (const h of gb.getHolidays(year)) {
      if (h.type !== 'public' || !/good friday/i.test(h.name)) continue
      const day = h.date.slice(0, 10)
      if (!byDay.has(day)) byDay.set(day, 'Good Friday')
    }
  }
  seed['US Bond Market (SIFMA)'] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, name]) => ({ day, name }))
}

// Best-effort "China (SSE)" market calendar. date-holidays 'CN' only has the
// STATUTORY skeleton (3-day National Day, 3-day Spring Festival) plus some
// commemorative NON-closures. This approximates the exchange's actual closures:
// drop the commemoratives, force National Day to the full Golden Week (Oct 1–7),
// and extend Spring Festival to 7 days from its first statutory day.
// ⚠️ APPROXIMATE: China's holidays are announced yearly by the State Council with
// make-up working weekends, and exact spans vary. Golden Week (Oct 1–7) is
// reliable; the Spring Festival span (and any Labour Day extension / make-up days)
// should be verified against SSE's published schedule each year.
{
  const cn = new Holidays('CN')
  cn.setLanguages('en')
  const DROP = /women|youth|children|army/i
  const byDay = new Map()
  const addRange = (y0, m1, d0, days, name) => {
    for (let i = 0; i < days; i++) {
      const d = new Date(y0, m1 - 1, d0 + i)
      byDay.set(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        name,
      )
    }
  }
  for (const year of YEARS) {
    const springDays = []
    for (const h of cn.getHolidays(year)) {
      if (h.type !== 'public' || DROP.test(h.name)) continue
      const day = h.date.slice(0, 10)
      if (/spring festival/i.test(h.name)) {
        springDays.push(day)
        continue
      }
      if (/national day/i.test(h.name)) continue // replaced by the full Golden Week below
      if (!byDay.has(day)) byDay.set(day, h.name)
    }
    addRange(year, 10, 1, 7, 'National Day (Golden Week)') // Oct 1–7, reliable
    if (springDays.length) {
      const [y, mo, da] = springDays.sort()[0].split('-').map(Number)
      addRange(y, mo, da, 7, 'Spring Festival') // ⚠️ approximate 7-day span
    }
  }
  seed['China (SSE)'] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, name]) => ({ day, name }))
}

const header = `// Auto-generated starter holiday data (public holidays ${YEARS[0]}-${YEARS[YEARS.length - 1]}) from the
// date-holidays library, for one-click import in the Holidays manager. Edit there
// afterwards to match your exact exchange calendars. Regenerate with
// scripts/gen-holidays.mjs (bump YEARS for later years).

export type SeedHoliday = { day: string; name: string }
export const HOLIDAY_SEED: Record<string, SeedHoliday[]> = ${JSON.stringify(seed, null, 2)}
`

writeFileSync('src/lib/holidaysSeed.ts', header)
const counts = Object.entries(seed).map(([k, v]) => `${k}=${v.length}`).join(', ')
console.log(`Wrote src/lib/holidaysSeed.ts (${counts})`)
