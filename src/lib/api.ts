import { supabase } from './supabase'
import { reminderFireTime } from './reminders'
import { computeOccurrences } from './recurrence'
import type { RecurrenceRule } from './recurrence'
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
  /** Recurring-series link + lifecycle. status: confirmed | tentative | skipped. */
  series_id: string | null
  status: string
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
    series_id: r.series_id ?? null,
    status: r.status ?? 'confirmed',
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
      'id, title, starts_at, ends_at, all_day, priority_tier_id, category, tags, notes, extra, sound_name, series_id, status',
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

export async function setEventSeriesId(eventId: string, seriesId: string): Promise<void> {
  const { error } = await supabase.from('events').update({ series_id: seriesId }).eq('id', eventId)
  if (error) throw error
}

/** Update an event's lifecycle status (confirmed | tentative | skipped). */
export async function setEventStatus(eventId: string, status: string): Promise<void> {
  const { error } = await supabase.from('events').update({ status }).eq('id', eventId)
  if (error) throw error
}

/** Skip a projection: hide it and drop its reminders (so it won't fire/email),
 *  keeping the row so the series won't re-project that date. */
export async function skipEvent(eventId: string): Promise<void> {
  await supabase.from('reminders').delete().eq('event_id', eventId)
  const { error } = await supabase.from('events').update({ status: 'skipped' }).eq('id', eventId)
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

// ---------------------------------------------------------------------------
// Series (recurring templates) + projection
// ---------------------------------------------------------------------------

export type SeriesRow = {
  id: string
  title: string
  time_of_day: string | null
  all_day: boolean
  window_days: number | null
  priority_tier_id: string | null
  category: string
  tags: string[]
  speak: boolean
  reminders: ReminderDraft[]
  rule: RecurrenceRule
  horizon_months: number
  active: boolean
}

export type SeriesInput = Omit<SeriesRow, 'id'>

export async function fetchSeries(): Promise<SeriesRow[]> {
  const { data, error } = await supabase
    .from('series')
    .select(
      'id, title, time_of_day, all_day, window_days, priority_tier_id, category, tags, speak, reminders, rule, horizon_months, active',
    )
  if (error) throw error
  return (data ?? []) as SeriesRow[]
}

export async function createSeries(input: SeriesInput): Promise<SeriesRow> {
  const { data: userRes } = await supabase.auth.getUser()
  const user_id = userRes.user?.id
  const { data, error } = await supabase
    .from('series')
    .insert({ ...input, user_id })
    .select()
    .single()
  if (error) throw error
  return data as SeriesRow
}

export async function deleteSeries(id: string): Promise<void> {
  const { error } = await supabase.from('series').delete().eq('id', id)
  if (error) throw error
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

function startsAtFor(series: SeriesRow, d: Date): string {
  if (series.all_day) return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString()
  const [hh, mm] = (series.time_of_day ?? '00:00').split(':').map(Number)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0).toISOString()
}

/** Materialise tentative occurrences of a series within [from, to] that don't
 *  already exist (by date). Also creates their reminders. Returns count added. */
export async function projectSeries(
  series: SeriesRow,
  existingDateKeys: Set<string>,
  from: Date,
  to: Date,
): Promise<number> {
  const { data: userRes } = await supabase.auth.getUser()
  const user_id = userRes.user?.id
  const dates = computeOccurrences(series.rule, from, to).filter((d) => !existingDateKeys.has(ymd(d)))
  if (dates.length === 0) return 0

  const eventRows = dates.map((d) => ({
    user_id,
    series_id: series.id,
    status: 'tentative',
    title: series.title,
    starts_at: startsAtFor(series, d),
    ends_at:
      series.all_day && series.window_days
        ? startsAtFor(series, new Date(d.getFullYear(), d.getMonth(), d.getDate() + series.window_days))
        : null,
    all_day: series.all_day,
    priority_tier_id: series.priority_tier_id,
    category: series.category,
    tags: series.tags,
    notes: null,
    extra: { speak: series.speak },
  }))

  const { data: inserted, error } = await supabase
    .from('events')
    .insert(eventRows)
    .select('id, starts_at')
  if (error) throw error

  if (series.reminders.length > 0 && inserted) {
    const remRows = (inserted as { id: string; starts_at: string }[]).flatMap((ev) =>
      series.reminders.map((r) => ({
        event_id: ev.id,
        user_id,
        kind: r.kind,
        minutes_before: r.minutes_before,
        days_before: r.days_before,
        at_time: r.at_time,
        channel: r.channel,
        email: r.email,
        fire_at: reminderFireTime(r, { starts_at: ev.starts_at } as EventRow).toISOString(),
        sent_at: null,
      })),
    )
    const { error: e2 } = await supabase.from('reminders').insert(remRows)
    if (e2) throw e2
  }
  return dates.length
}
