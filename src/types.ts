// Core domain types for the JMO Trading Calendar.
// Kept deliberately minimal for Phase 0 (per plan D9); fields will be added
// additively later (notes, country/currency, forecast/actual) without redesign.

export type PriorityTier = {
  id: string
  name: string
  color: string
  /** 0 = highest priority. Drives sort + which tiers can trigger email later. */
  rank: number
  /** Whether events at this tier default to email reminders (used from Phase 2). */
  triggersEmail: boolean
}

export type EventCategory = 'Macro/Economic' | 'Expiry' | 'Custom'

export type TradingEvent = {
  id: string
  title: string
  /** ISO datetime (local for now; UTC handling arrives with reminders in Phase 2). */
  start: string
  end?: string
  allDay?: boolean
  priorityId: string
  category: EventCategory
  tags: string[]
  notes?: string
}
