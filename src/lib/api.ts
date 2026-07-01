import { supabase } from './supabase'
import type { PriorityTier } from '../types'

// Fetch the signed-in user's priority tiers (seeded with defaults on signup).
export async function fetchPriorityTiers(): Promise<PriorityTier[]> {
  const { data, error } = await supabase
    .from('priority_tiers')
    .select('id, name, color, rank, triggers_email')
    .order('rank')
  if (error) throw error
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    color: d.color,
    rank: d.rank,
    triggersEmail: d.triggers_email,
  }))
}

export async function createPriorityTier(input: {
  name: string
  color: string
  rank: number
  triggers_email?: boolean
}) {
  const { data: userRes } = await supabase.auth.getUser()
  const user_id = userRes.user?.id
  const { error } = await supabase.from('priority_tiers').insert({ ...input, user_id })
  if (error) throw error
}

export async function updatePriorityTier(
  id: string,
  input: { name?: string; color?: string; rank?: number; triggers_email?: boolean },
) {
  const { error } = await supabase.from('priority_tiers').update(input).eq('id', id)
  if (error) throw error
}

export async function deletePriorityTier(id: string) {
  const { error } = await supabase.from('priority_tiers').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EventRow = {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  priority_tier_id: string | null
  category: string
  tags: string[]
  notes: string | null
}

export type EventInputData = {
  title: string
  starts_at: string
  ends_at?: string | null
  all_day: boolean
  priority_tier_id: string | null
  category: string
  tags: string[]
  notes?: string | null
}

export async function fetchEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, starts_at, ends_at, all_day, priority_tier_id, category, tags, notes')
    .order('starts_at')
  if (error) throw error
  return data ?? []
}

export async function createEvent(input: EventInputData): Promise<EventRow> {
  const { data: userRes } = await supabase.auth.getUser()
  const user_id = userRes.user?.id
  const { data, error } = await supabase
    .from('events')
    .insert({ ...input, user_id })
    .select()
    .single()
  if (error) throw error
  return data as EventRow
}

export async function updateEvent(id: string, input: EventInputData): Promise<EventRow> {
  const { data, error } = await supabase
    .from('events')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as EventRow
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
}
