import { useState } from 'react'
import type { FormEvent } from 'react'
import type { EventInputData, EventRow, ReminderDraft } from '../lib/api'
import type { EventCategory, PriorityTier } from '../types'
import { PRESETS, labelReminder, relative } from '../lib/reminders'

const CATEGORIES: EventCategory[] = ['Macro/Economic', 'Expiry', 'Custom']

const CUSTOM_UNITS: { label: string; mult: number }[] = [
  { label: 'minutes', mult: 1 },
  { label: 'hours', mult: 60 },
  { label: 'days', mult: 1440 },
]

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
  initialReminders?: ReminderDraft[]
  busy?: boolean
  onSave: (input: EventInputData, reminders: ReminderDraft[], id?: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function EventModal({
  tiers,
  event,
  initialDate,
  initialTime,
  initialReminders,
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
  const [endDate, setEndDate] = useState(event?.ends_at ? toLocalParts(event.ends_at).date : '')
  const [priorityId, setPriorityId] = useState(
    event?.priority_tier_id ?? tiers[0]?.id ?? '',
  )
  const [category, setCategory] = useState<string>(event?.category ?? 'Macro/Economic')
  const [tags, setTags] = useState((event?.tags ?? []).join(', '))
  const [notes, setNotes] = useState(event?.notes ?? '')

  const [reminders, setReminders] = useState<ReminderDraft[]>(initialReminders ?? [])
  const [customVal, setCustomVal] = useState('30')
  const [customUnit, setCustomUnit] = useState(0)

  const addReminder = (r: ReminderDraft) => setReminders((rs) => [...rs, r])
  const removeReminder = (i: number) => setReminders((rs) => rs.filter((_, j) => j !== i))
  const addCustom = () => {
    const n = parseInt(customVal, 10)
    if (!Number.isFinite(n) || n < 0) return
    addReminder(relative(n * CUSTOM_UNITS[customUnit].mult))
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!date || !title) return

    const starts_at = allDay
      ? new Date(`${date}T00:00:00`).toISOString()
      : new Date(`${date}T${time}:00`).toISOString()

    // A window is an all-day event with an end date after the start date.
    const ends_at =
      allDay && endDate && endDate > date ? new Date(`${endDate}T00:00:00`).toISOString() : null

    const input: EventInputData = {
      title: title.trim(),
      starts_at,
      ends_at,
      all_day: allDay,
      priority_tier_id: priorityId || null,
      category,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: notes.trim() || null,
    }
    onSave(input, reminders, event?.id)
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
            {allDay ? 'Start date' : 'Date'}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          {!allDay && (
            <label className="field">
              Time
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          )}
          {allDay && (
            <label className="field">
              End date (optional)
              <input
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          )}
        </div>
        {allDay && (
          <p className="modal-hint">
            Set an end date to make this a multi-day <strong>window</strong> (e.g. a roll period
            or holiday).
          </p>
        )}

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

        <div className="field reminders-field">
          Reminders
          {reminders.length > 0 && (
            <div className="reminder-chips">
              {reminders.map((r, i) => (
                <span className="reminder-chip" key={i}>
                  {labelReminder(r)}
                  <button
                    type="button"
                    className="reminder-chip-x"
                    onClick={() => removeReminder(i)}
                    aria-label="Remove reminder"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="reminder-add">
            <select
              value=""
              onChange={(e) => {
                const p = PRESETS[Number(e.target.value)]
                if (p) addReminder(p.make())
              }}
            >
              <option value="">+ Add reminder…</option>
              {PRESETS.map((p, i) => (
                <option key={i} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="reminder-custom">
            <span>Custom:</span>
            <input
              type="number"
              min={0}
              value={customVal}
              onChange={(e) => setCustomVal(e.target.value)}
            />
            <select value={customUnit} onChange={(e) => setCustomUnit(Number(e.target.value))}>
              {CUSTOM_UNITS.map((u, i) => (
                <option key={i} value={i}>
                  {u.label}
                </option>
              ))}
            </select>
            <span>before</span>
            <button type="button" className="btn-ghost reminder-custom-add" onClick={addCustom}>
              Add
            </button>
          </div>
          <p className="modal-hint">In-app pop-ups while the calendar is open. (Email in a later step.)</p>
        </div>

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
