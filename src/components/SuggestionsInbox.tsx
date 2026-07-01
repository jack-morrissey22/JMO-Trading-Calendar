import type { EventRow } from '../lib/api'

type Props = {
  events: EventRow[] // upcoming tentative events, pre-sorted
  colorOf: (tierId: string | null) => string
  busy?: boolean
  onConfirm: (id: string) => void
  onSkip: (id: string) => void
  onAdjust: (id: string) => void
  onConfirmAll: () => void
  onClose: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')
function whenLabel(e: EventRow) {
  const d = new Date(e.starts_at)
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return e.all_day ? `${day} · all day` : `${day} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// The Suggestions inbox: work through projected (tentative) occurrences —
// confirm, adjust the date, or skip each. Same data as the dashed calendar entries.
export function SuggestionsInbox({
  events,
  colorOf,
  busy,
  onConfirm,
  onSkip,
  onAdjust,
  onConfirmAll,
  onClose,
}: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal inbox" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">🔮 Suggestions</h2>
        <p className="modal-hint">
          Projected occurrences awaiting your check. Confirm, adjust the date, or skip.
        </p>

        {events.length === 0 ? (
          <div className="inbox-empty">Nothing to review — you're all caught up.</div>
        ) : (
          <>
            <div className="inbox-list">
              {events.map((e) => (
                <div className="inbox-row" key={e.id}>
                  <span className="inbox-dot" style={{ background: colorOf(e.priority_tier_id) }} />
                  <div className="inbox-main">
                    <div className="inbox-title">{e.title}</div>
                    <div className="inbox-when">{whenLabel(e)}</div>
                  </div>
                  <div className="inbox-actions">
                    <button
                      className="btn-primary inbox-btn"
                      disabled={busy}
                      onClick={() => onConfirm(e.id)}
                    >
                      ✓
                    </button>
                    <button className="btn-ghost inbox-btn" disabled={busy} onClick={() => onAdjust(e.id)}>
                      Adjust
                    </button>
                    <button className="btn-ghost inbox-btn" disabled={busy} onClick={() => onSkip(e.id)}>
                      Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" disabled={busy} onClick={onConfirmAll}>
                Confirm all ({events.length})
              </button>
              <div className="modal-actions-right">
                <button className="btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
