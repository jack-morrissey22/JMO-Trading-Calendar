import { useRef, useState } from 'react'
import type { PriorityTier } from '../types'

export type TierDraft = { id?: string; name: string; color: string }

type Row = TierDraft & { key: string }

type Props = {
  tiers: PriorityTier[]
  busy?: boolean
  onSave: (tiers: TierDraft[], deletedIds: string[]) => void
  onClose: () => void
}

const NEW_COLORS = ['#8b5cf6', '#10b981', '#ec4899', '#14b8a6', '#f97316']

// Settings panel to rename / recolour / reorder / add / remove priority tiers.
// Order (top = highest priority) becomes each tier's rank on save.
export function PriorityManager({ tiers, busy, onSave, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    tiers.map((t) => ({ key: t.id, id: t.id, name: t.name, color: t.color })),
  )
  const [deleted, setDeleted] = useState<string[]>([])
  const nextKey = useRef(0)

  const patch = (key: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))

  const remove = (row: Row) => {
    if (row.id) setDeleted((d) => [...d, row.id!])
    setRows((rs) => rs.filter((r) => r.key !== row.key))
  }

  const add = () => {
    const key = `new-${nextKey.current++}`
    const color = NEW_COLORS[rows.length % NEW_COLORS.length]
    setRows((rs) => [...rs, { key, name: 'New priority', color }])
  }

  const move = (idx: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = idx + dir
      if (j < 0 || j >= rs.length) return rs
      const copy = rs.slice()
      ;[copy[idx], copy[j]] = [copy[j], copy[idx]]
      return copy
    })

  const save = () =>
    onSave(
      rows.map((r) => ({ id: r.id, name: r.name.trim() || 'Untitled', color: r.color })),
      deleted,
    )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Priority levels</h2>
        <p className="modal-hint">Top of the list = highest priority. Colours show on the calendar.</p>

        <div className="tier-list">
          {rows.map((r, i) => (
            <div key={r.key} className="tier-row">
              <div className="tier-reorder">
                <button
                  type="button"
                  className="tier-move"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="tier-move"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>
              <input
                type="color"
                className="tier-color"
                value={r.color}
                onChange={(e) => patch(r.key, { color: e.target.value })}
              />
              <input
                className="tier-name"
                value={r.name}
                onChange={(e) => patch(r.key, { name: e.target.value })}
              />
              <button
                type="button"
                className="tier-del"
                onClick={() => remove(r)}
                aria-label="Remove priority"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="btn-ghost tier-add" onClick={add}>
          + Add priority
        </button>

        <p className="modal-hint">
          Removing a priority sets any events using it to no priority.
        </p>

        <div className="modal-actions">
          <div className="modal-actions-right">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
