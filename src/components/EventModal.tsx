import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { fetchEventSound } from '../lib/api'
import type { EventInputData, EventRow, ReminderDraft, SeriesRow } from '../lib/api'
import type { EventCategory, PriorityTier } from '../types'
import { PRESETS, labelReminder, relative } from '../lib/reminders'
import { playClip } from '../lib/sound'
import { RecurrenceEditor } from './RecurrenceEditor'
import type { RecurrenceValue } from './RecurrenceEditor'

// undefined = leave the existing sound untouched; otherwise replace/clear it.
export type SoundChange = { data: string | null; name: string | null } | undefined

// A remembered event: the most recent entry of a given title, used to pre-fill
// a new one (the "cyclical memory" — the events table itself is the memory).
export type EventTemplate = {
  title: string
  sourceId: string
  time: string
  all_day: boolean
  priority_tier_id: string | null
  category: string
  tags: string[]
  speak: boolean
  sound_name: string | null
  reminders: ReminderDraft[]
}

const MAX_SOUND_BYTES = 1_000_000

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
  /** The series this event belongs to (for editing the repeat). */
  series?: SeriesRow
  templates?: EventTemplate[]
  /** Categories already used across the user's events, for the datalist suggestions. */
  categoryOptions?: string[]
  initialDate?: string
  initialTime?: string
  initialReminders?: ReminderDraft[]
  busy?: boolean
  onSave: (
    input: EventInputData,
    reminders: ReminderDraft[],
    sound: SoundChange,
    recurrence: RecurrenceValue | null,
    id?: string,
  ) => void
  onConfirm?: (
    input: EventInputData,
    reminders: ReminderDraft[],
    sound: SoundChange,
    id: string,
  ) => void
  onSkip?: (id: string) => void
  onUpdateSeries?: (seriesId: string, recurrence: RecurrenceValue, sound: SoundChange) => void
  onExtendSeries?: (seriesId: string, toDate: string) => void
  onStopSeries?: (seriesId: string) => void
  onResumeSeries?: (seriesId: string) => void
  onDeleteSeriesAll?: (seriesId: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function EventModal({
  tiers,
  event,
  series,
  templates,
  categoryOptions,
  initialDate,
  initialTime,
  initialReminders,
  busy,
  onSave,
  onConfirm,
  onSkip,
  onUpdateSeries,
  onExtendSeries,
  onStopSeries,
  onResumeSeries,
  onDeleteSeriesAll,
  onDelete,
  onClose,
}: EventModalProps) {
  const editing = !!event
  const existingParts = event ? toLocalParts(event.starts_at) : null
  const [showSuggest, setShowSuggest] = useState(false)
  const [recurrence, setRecurrence] = useState<RecurrenceValue | null>(null)
  const [extendDate, setExtendDate] = useState(() => `${new Date().getFullYear()}-12-31`)

  const [title, setTitle] = useState(event?.title ?? '')
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [date, setDate] = useState(existingParts?.date ?? initialDate ?? '')
  const [time, setTime] = useState(existingParts?.time ?? initialTime ?? '13:30')
  const [endDate, setEndDate] = useState(event?.ends_at ? toLocalParts(event.ends_at).date : '')
  const [priorityId, setPriorityId] = useState(
    event?.priority_tier_id ?? tiers[0]?.id ?? '',
  )
  const [category, setCategory] = useState<string>(event?.category ?? 'Macro/Economic')
  // Preset categories plus any the user has already created, for the datalist.
  const categoryChoices = useMemo(
    () => [...new Set([...CATEGORIES, ...(categoryOptions ?? [])])].sort((a, b) => a.localeCompare(b)),
    [categoryOptions],
  )
  const [tags, setTags] = useState((event?.tags ?? []).join(', '))
  const [notes, setNotes] = useState(event?.notes ?? '')

  const [speak, setSpeak] = useState(event?.speak ?? false)
  const [reminders, setReminders] = useState<ReminderDraft[]>(initialReminders ?? [])

  // Custom sound: soundName reflects the current attachment; soundData holds a
  // freshly uploaded clip; soundChanged marks whether to persist a change.
  const [soundName, setSoundName] = useState<string | null>(event?.sound_name ?? null)
  const [soundData, setSoundData] = useState<string | null>(null)
  const [soundChanged, setSoundChanged] = useState(false)
  const [soundError, setSoundError] = useState<string | null>(null)

  const onSoundFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_SOUND_BYTES) {
      setSoundError('Clip too large — keep it under ~1 MB (a few seconds).')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setSoundData(reader.result as string)
      setSoundName(file.name)
      setSoundChanged(true)
      setSoundError(null)
    }
    reader.readAsDataURL(file)
  }

  const removeSound = () => {
    setSoundData(null)
    setSoundName(null)
    setSoundChanged(true)
  }

  const previewSound = async () => {
    if (soundData) playClip(soundData)
    else if (event?.id) {
      const d = await fetchEventSound(event.id)
      if (d) playClip(d)
    }
  }

  // Recall everything from a past entry of this event (except the date).
  const applyTemplate = (t: EventTemplate) => {
    setTitle(t.title)
    setAllDay(t.all_day)
    setTime(t.time)
    setPriorityId(t.priority_tier_id ?? tiers[0]?.id ?? '')
    setCategory(t.category)
    setTags(t.tags.join(', '))
    setSpeak(t.speak)
    setReminders(t.reminders)
    if (t.sound_name) {
      fetchEventSound(t.sourceId).then((d) => {
        if (d) {
          setSoundData(d)
          setSoundName(t.sound_name)
          setSoundChanged(true)
        }
      })
    } else {
      setSoundData(null)
      setSoundName(null)
      setSoundChanged(true)
    }
    setShowSuggest(false)
  }

  const tierName = (id: string | null) => tiers.find((t) => t.id === id)?.name ?? '—'
  const q = title.trim().toLowerCase()
  const matches =
    !editing && showSuggest && q.length >= 1 && templates
      ? templates
          .filter((t) => t.title.toLowerCase().includes(q) && t.title.toLowerCase() !== q)
          .sort(
            (a, b) =>
              (a.title.toLowerCase().startsWith(q) ? 0 : 1) -
              (b.title.toLowerCase().startsWith(q) ? 0 : 1),
          )
          .slice(0, 6)
      : []
  const [customVal, setCustomVal] = useState('30')
  const [customUnit, setCustomUnit] = useState(0)

  const addReminder = (r: ReminderDraft) => setReminders((rs) => [...rs, r])
  const removeReminder = (i: number) => setReminders((rs) => rs.filter((_, j) => j !== i))
  const toggleEmail = (i: number) =>
    setReminders((rs) => rs.map((r, j) => (j === i ? { ...r, email: !r.email } : r)))
  const togglePush = (i: number) =>
    setReminders((rs) => rs.map((r, j) => (j === i ? { ...r, push: !r.push } : r)))
  const addCustom = () => {
    const n = parseInt(customVal, 10)
    if (!Number.isFinite(n) || n < 1) return
    addReminder(relative(n * CUSTOM_UNITS[customUnit].mult))
  }

  function buildPayload(): { input: EventInputData; sound: SoundChange } | null {
    if (!date || !title) return null
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
      speak,
    }
    const sound: SoundChange = soundChanged ? { data: soundData, name: soundName } : undefined
    return { input, sound }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const p = buildPayload()
    if (!p) return
    // Recurrence flows through Save for a NEW event or when turning an existing
    // one-off into a series. Series events manage their pattern via onUpdateSeries,
    // so we never re-send recurrence for them here.
    const recForSave = series ? null : recurrence
    onSave(p.input, reminders, p.sound, recForSave, event?.id)
  }

  function doConfirm() {
    const p = buildPayload()
    if (!p || !event) return
    onConfirm?.(p.input, reminders, p.sound, event.id)
  }

  const tentative = editing && event?.status === 'tentative'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h2 className="modal-title">{editing ? 'Edit event' : 'New event'}</h2>

        <div className="field title-field">
          Title
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setShowSuggest(true)
            }}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            required
            autoFocus
          />
          {matches.length > 0 && (
            <ul className="suggest-list">
              {matches.map((t) => (
                <li key={t.sourceId}>
                  <button
                    type="button"
                    className="suggest-item"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      applyTemplate(t)
                    }}
                  >
                    <span className="suggest-title">{t.title}</span>
                    <span className="suggest-meta">
                      {t.all_day ? 'all day' : t.time} · {tierName(t.priority_tier_id)}
                      {t.reminders.length > 0
                        ? ` · ${t.reminders.length} reminder${t.reminders.length > 1 ? 's' : ''}`
                        : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
            <input
              list="event-category-options"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Type or pick a category"
            />
            <datalist id="event-category-options">
              {categoryChoices.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
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
                <span
                  className={`reminder-chip${r.email ? ' has-email' : ''}${r.push ? ' has-push' : ''}`}
                  key={i}
                >
                  {labelReminder(r)}
                  <button
                    type="button"
                    className={`reminder-email${r.email ? ' on' : ''}`}
                    onClick={() => toggleEmail(i)}
                    title={r.email ? 'Emailing you — click to stop' : 'Also email me'}
                  >
                    📧
                  </button>
                  <button
                    type="button"
                    className={`reminder-push${r.push ? ' on' : ''}`}
                    onClick={() => togglePush(i)}
                    title={r.push ? 'Pushing to your devices — click to stop' : 'Also push to my phone/devices'}
                  >
                    📱
                  </button>
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
              min={1}
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
          <label className="field-check">
            <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} />
            🔊 Speak the event name aloud when a reminder fires
          </label>

          <div className="sound-row">
            {soundName ? (
              <>
                <span className="sound-name">🎵 {soundName}</span>
                <button type="button" className="btn-ghost sound-btn" onClick={previewSound}>
                  ▶ Preview
                </button>
                <button type="button" className="btn-ghost sound-btn" onClick={removeSound}>
                  Remove
                </button>
              </>
            ) : (
              <label className="sound-upload">
                Custom sound clip
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => onSoundFile(e.target.files?.[0])}
                />
              </label>
            )}
          </div>
          {soundError && <div className="auth-error">{soundError}</div>}
          <p className="modal-hint">
            Reminders pop up in-app; tap 📧 to also email it or 📱 to push it to your devices
            (both reach you when the app is closed). A custom clip plays instead of the spoken name.
          </p>
        </div>

        {!editing ? (
          <RecurrenceEditor seedDate={date} onChange={setRecurrence} />
        ) : !series && !tentative ? (
          <div className="recur-manage">
            <div className="modal-hint">
              🔁 This event doesn't repeat yet — tick Repeats to turn it into a recurring
              series (this entry stays as the first occurrence).
            </div>
            <RecurrenceEditor seedDate={date} onChange={setRecurrence} />
          </div>
        ) : series && !tentative ? (
          <div className="recur-manage">
            {series.active ? (
              <>
                <div className="modal-hint">🔁 This event repeats — editing the pattern updates the whole series.</div>
                <RecurrenceEditor
                  seedDate={date}
                  initial={{ rule: series.rule, horizonMonths: series.horizon_months }}
                  onChange={setRecurrence}
                />
                <div className="recur-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() =>
                      recurrence &&
                      onUpdateSeries?.(
                        series.id,
                        recurrence,
                        soundChanged ? { data: soundData, name: soundName } : undefined,
                      )
                    }
                  >
                    Update repeat & re-project
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    title="Keep these occurrences grouped; just stop adding new ones"
                    onClick={() => onStopSeries?.(series.id)}
                  >
                    Stop repeating
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={busy}
                    title="Remove the repeat and every occurrence, confirmed and tentative"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Delete the entire series — every occurrence, including ones you have already confirmed? This cannot be undone.',
                        )
                      )
                        onDeleteSeriesAll?.(series.id)
                    }}
                  >
                    Delete entire series
                  </button>
                </div>
                <div className="recur-extend">
                  <span>Or project further — out to</span>
                  <input
                    type="date"
                    value={extendDate}
                    onChange={(e) => setExtendDate(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => onExtendSeries?.(series.id, extendDate)}
                  >
                    Extend
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-hint">
                  ⏸ Repeating is stopped — no new occurrences are being added, but these
                  entries are still grouped. Resume it, or delete them all at once.
                </div>
                <div className="recur-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    title="Start projecting future occurrences again"
                    onClick={() => onResumeSeries?.(series.id)}
                  >
                    Resume repeating
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={busy}
                    title="Remove every occurrence of this series, confirmed and tentative"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Delete the entire series — every occurrence, including ones you have already confirmed? This cannot be undone.',
                        )
                      )
                        onDeleteSeriesAll?.(series.id)
                    }}
                  >
                    Delete entire series
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {tentative && (
          <p className="modal-hint tentative-hint">
            ↪ Projected (unconfirmed). Adjust the date if it's off, then Confirm — or Skip it.
          </p>
        )}

        <div className="modal-actions">
          {tentative ? (
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={() => event && onSkip?.(event.id)}
            >
              Skip
            </button>
          ) : editing ? (
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={() => event && onDelete(event.id)}
            >
              Delete
            </button>
          ) : null}
          <div className="modal-actions-right">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            {tentative ? (
              <>
                <button type="submit" className="btn-ghost" disabled={busy}>
                  Save edits
                </button>
                <button type="button" className="btn-primary" disabled={busy} onClick={doConfirm}>
                  {busy ? '…' : '✓ Confirm'}
                </button>
              </>
            ) : (
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
