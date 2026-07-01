import { supabase } from './supabase'
import { reminderFireTime } from './reminders'
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
  /** Speak the event name aloud when a reminder fires (stored in extra). */
  speak: boolean
  /** Filename of an attached custom reminder sound (null = none). The audio
   *  itself (sound_data) is fetched on demand, not in the list query. */
  sound_name: string | null
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
  speak: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEventRow(r: any): EventRow {
  return {
    id: r.id,
    title: r.title,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    all_day: r.all_day,
    priority_tier_id: r.priority_tier_id,
    category: r.category,
    tags: r.tags,
    notes: r.notes,
    speak: !!(r.extra && r.extra.speak),
    sound_name: r.sound_name ?? null,
  }
}

// Additive per-event options live in the JSONB `extra` column (no migration).
function rowFromInput(input: EventInputData) {
  const { speak, ...rest } = input
  return { ...rest, extra: { speak: !!speak } }
}

export async function fetchEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, starts_at, ends_at, all_day, priority_tier_id, category, tags, notes, extra, sound_name',
    )
    .order('starts_at')
  if (error) throw error
  return (data ?? []).map(mapEventRow)
}

export async function createEvent(input: EventInputData): Promise<EventRow> {
  const { data: userRes } = await supabase.auth.getUser()
  const user_id = userRes.user?.id
  const { data, error } = await supabase
    .from('events')
    .insert({ ...rowFromInput(input), user_id })
    .select()
    .single()
  if (error) throw error
  return mapEventRow(data)
}

export async function updateEvent(id: string, input: EventInputData): Promise<EventRow> {
  const { data, error } = await supabase
    .from('events')
    .update(rowFromInput(input))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return mapEventRow(data)
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
}

/** Attach (or clear, with nulls) a custom reminder sound for an event. */
export async function setEventSound(
  eventId: string,
  dataUri: string | null,
  name: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ sound_data: dataUri, sound_name: name })
    .eq('id', eventId)
  if (error) throw error
}

/** Fetch an event's custom sound data URI on demand (null if none). */
export async function fetchEventSound(eventId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('events')
    .select('sound_data')
    .eq('id', eventId)
    .single()
  if (error) throw error
  return (data?.sound_data as string | null) ?? null
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export type ReminderDraft = {
  kind: 'relative' | 'fixed'
  minutes_before: number | null
  days_before: number | null
  at_time: string | null
  channel: string
  /** Also send this reminder by email (delivered even when the app is closed). */
  email: boolean
}

export type ReminderRow = ReminderDraft & { id: string; event_id: string }

export async function fetchReminders(): Promise<ReminderRow[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select('id, event_id, kind, minutes_before, days_before, at_time, channel, email')
  if (error) throw error
  return (data ?? []) as ReminderRow[]
}

/** Replace all reminders for an event with the given set (delete + insert).
 *  fire_at (UTC, for the email sender) is computed from the event's start. */
export async function setEventReminders(
  eventId: string,
  drafts: ReminderDraft[],
  startsAt: string,
): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser()
  const user_id = userRes.user?.id
  const del = await supabase.from('reminders').delete().eq('event_id', eventId)
  if (del.error) throw del.error
  if (drafts.length === 0) return
  const rows = drafts.map((d) => ({
    event_id: eventId,
    user_id,
    kind: d.kind,
    minutes_before: d.minutes_before,
    days_before: d.days_before,
    at_time: d.at_time,
    email: d.email,
    fire_at: reminderFireTime(d, { starts_at: startsAt } as EventRow).toISOString(),
    sent_at: null,
    channel: d.channel,
  }))
  const ins = await supabase.from('reminders').insert(rows)
  if (ins.error) throw ins.error
}
