import { useState } from 'react'
import type { FormEvent } from 'react'
import type { EventInputData, EventRow } from '../lib/api'
import type { EventCategory, PriorityTier } from '../types'

const CATEGORIES: EventCategory[] = ['Macro/Economic', 'Expiry', 'Custom']

const pad = (n: number) => String(n).padStart(2, '0')

function toLocalParts(iso: string) {
  const d = new Date(iso)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

export type EventModalProps = {
  tiers: PriorityTier[]
  /** Existing event when editing; otherwise a starting date for a new event. */
  event?: EventRow
  initialDate?: string
  initialTime?: string
  busy?: boolean
  onSave: (input: EventInputData, id?: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function EventModal({
  tiers,
  event,
  initialDate,
  initialTime,
  busy,
  onSave,
  onDelete,
  onClose,
}: EventModalProps) {
  const editing = !!event
  const existingParts = event ? toLocalParts(event.starts_at) : null

  const [title, setTitle] = useState(event?.title ?? '')
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [date, setDate] = useState(existingParts?.date ?? initialDate ?? '')
  const [time, setTime] = useState(existingParts?.time ?? initialTime ?? '13:30')
  const [priorityId, setPriorityId] = useState(
    event?.priority_tier_id ?? tiers[0]?.id ?? '',
  )
  const [category, setCategory] = useState<string>(event?.category ?? 'Macro/Economic')
  const [tags, setTags] = useState((event?.tags ?? []).join(', '))
  const [notes, setNotes] = useState(event?.notes ?? '')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!date || !title) return

    const starts_at = allDay
      ? new Date(`${date}T00:00:00`).toISOString()
      : new Date(`${date}T${time}:00`).toISOString()

    const input: EventInputData = {
      title: title.trim(),
      starts_at,
      ends_at: null,
      all_day: allDay,
      priority_tier_id: priorityId || null,
      category,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: notes.trim() || null,
    }
    onSave(input, event?.id)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h2 className="modal-title">{editing ? 'Edit event' : 'New event'}</h2>

        <label className="field">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </label>

        <label className="field-check">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All day
        </label>

        <div className="field-row">
          <label className="field">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          {!allDay && (
            <label className="field">
              Time
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          )}
        </div>

        <div className="field-row">
          <label className="field">
            Priority
            <select value={priorityId} onChange={(e) => setPriorityId(e.target.value)}>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          Tags (comma separated)
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="USD, rates"
          />
        </label>

        <label className="field">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>

        <div className="modal-actions">
          {editing && (
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={() => event && onDelete(event.id)}
            >
              Delete
            </button>
          )}
          <div className="modal-actions-right">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
