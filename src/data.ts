import type { PriorityTier, TradingEvent } from './types'

// Default priority tiers (per plan D7). These ship as defaults but will become
// user-customisable (rename / recolour / add-remove) once the backend lands.
export const PRIORITY_TIERS: PriorityTier[] = [
  { id: 'critical', name: 'Critical', color: '#ef4444', rank: 0, triggersEmail: true },
  { id: 'high', name: 'High', color: '#f59e0b', rank: 1, triggersEmail: true },
  { id: 'medium', name: 'Medium', color: '#3b82f6', rank: 2, triggersEmail: false },
  { id: 'low', name: 'Low', color: '#6b7280', rank: 3, triggersEmail: false },
]

export const tierById: Record<string, PriorityTier> = Object.fromEntries(
  PRIORITY_TIERS.map((t) => [t.id, t]),
)

// Placeholder events so the calendar is alive before Supabase is wired in.
// Dates sit in July 2026 so they're visible on first render. These mirror the
// kinds of events the user described (macro releases, expiries).
export const SAMPLE_EVENTS: TradingEvent[] = [
  {
    id: 's1',
    title: 'US Non-Farm Payrolls',
    start: '2026-07-03T13:30:00',
    priorityId: 'critical',
    category: 'Macro/Economic',
    tags: ['USD', 'employment'],
  },
  {
    id: 's2',
    title: 'US CPI (Inflation)',
    start: '2026-07-15T13:30:00',
    priorityId: 'critical',
    category: 'Macro/Economic',
    tags: ['USD', 'inflation'],
  },
  {
    id: 's3',
    title: 'ECB Rate Decision',
    start: '2026-07-16T13:15:00',
    priorityId: 'high',
    category: 'Macro/Economic',
    tags: ['EUR', 'rates'],
  },
  {
    id: 's4',
    title: 'FOMC Rate Decision',
    start: '2026-07-29T19:00:00',
    priorityId: 'critical',
    category: 'Macro/Economic',
    tags: ['USD', 'rates'],
  },
  {
    id: 's5',
    title: 'EIA Crude Oil Inventories',
    start: '2026-07-01T15:30:00',
    priorityId: 'medium',
    category: 'Macro/Economic',
    tags: ['Crude', 'energy'],
  },
  {
    id: 's6',
    title: 'WTI Crude Futures Expiry',
    start: '2026-07-21T18:30:00',
    priorityId: 'high',
    category: 'Expiry',
    tags: ['Crude', 'expiry'],
  },
  {
    id: 's7',
    title: 'Quarterly Index Options Expiry',
    start: '2026-07-17T20:00:00',
    priorityId: 'high',
    category: 'Expiry',
    tags: ['equities', 'expiry'],
  },
  {
    id: 's8',
    title: 'Month-end Rebalancing',
    start: '2026-07-31',
    allDay: true,
    priorityId: 'low',
    category: 'Custom',
    tags: ['flows'],
  },
]
