import type { PriorityTier } from '../types'
import type { ViewFilters } from '../lib/api'
import { useEscClose } from '../lib/useEscClose'

type Props = {
  tiers: PriorityTier[]
  categories: string[]
  /** Whether any event has a blank category (show the "Uncategorised" row). */
  hasUncategorised: boolean
  filters: ViewFilters
  onChange: (next: ViewFilters) => void
  onClose: () => void
}

// The "" sentinel represents uncategorised events in hidden_categories.
const UNCATEGORISED = ''

// A single place to pick which priorities and categories show in Month & Week.
// Everything defaults to shown; unticking hides it. We store the *hidden* set so
// categories you add later show automatically without needing to tick them.
export function FiltersModal({
  tiers,
  categories,
  hasUncategorised,
  filters,
  onChange,
  onClose,
}: Props) {
  useEscClose(onClose)

  const hp = new Set(filters.hidden_priority_ids)
  const hc = new Set(filters.hidden_categories)

  const setHidden = (key: 'hidden_priority_ids' | 'hidden_categories', values: Set<string>) =>
    onChange({ ...filters, [key]: [...values] })

  const togglePriority = (id: string) => {
    const next = new Set(hp)
    next.has(id) ? next.delete(id) : next.add(id)
    setHidden('hidden_priority_ids', next)
  }
  const toggleCategory = (name: string) => {
    const next = new Set(hc)
    next.has(name) ? next.delete(name) : next.add(name)
    setHidden('hidden_categories', next)
  }

  // "All" clears the hidden set for that section; "None" hides every option.
  const allCategoryKeys = [...categories, ...(hasUncategorised ? [UNCATEGORISED] : [])]
  const showAllPriorities = () => setHidden('hidden_priority_ids', new Set())
  const hideAllPriorities = () => setHidden('hidden_priority_ids', new Set(tiers.map((t) => t.id)))
  const showAllCategories = () => setHidden('hidden_categories', new Set())
  const hideAllCategories = () => setHidden('hidden_categories', new Set(allCategoryKeys))

  const clearAll = () => onChange({ hidden_priority_ids: [], hidden_categories: [] })
  const anyHidden = hp.size > 0 || hc.size > 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal filter-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">🔎 Filter events</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
        <p className="modal-hint">
          Unticked items are hidden in <strong>Month</strong> and <strong>Week</strong>. Day and
          Agenda always show everything.
        </p>

        <div className="filter-section">
          <div className="filter-section-head">
            <span>Priority</span>
            <span className="filter-quick">
              <button type="button" className="filter-link" onClick={showAllPriorities}>
                All
              </button>
              <button type="button" className="filter-link" onClick={hideAllPriorities}>
                None
              </button>
            </span>
          </div>
          {tiers.map((t) => (
            <label className="filter-check" key={t.id}>
              <input
                type="checkbox"
                checked={!hp.has(t.id)}
                onChange={() => togglePriority(t.id)}
              />
              <span className="filter-dot" style={{ background: t.color }} />
              {t.name}
            </label>
          ))}
        </div>

        <div className="filter-section">
          <div className="filter-section-head">
            <span>Category</span>
            <span className="filter-quick">
              <button type="button" className="filter-link" onClick={showAllCategories}>
                All
              </button>
              <button type="button" className="filter-link" onClick={hideAllCategories}>
                None
              </button>
            </span>
          </div>
          {categories.length === 0 && !hasUncategorised && (
            <div className="filter-empty">No categories yet.</div>
          )}
          {categories.map((c) => (
            <label className="filter-check" key={c}>
              <input type="checkbox" checked={!hc.has(c)} onChange={() => toggleCategory(c)} />
              {c}
            </label>
          ))}
          {hasUncategorised && (
            <label className="filter-check">
              <input
                type="checkbox"
                checked={!hc.has(UNCATEGORISED)}
                onChange={() => toggleCategory(UNCATEGORISED)}
              />
              <em>Uncategorised</em>
            </label>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={clearAll} disabled={!anyHidden}>
            Clear all filters
          </button>
          <div className="modal-actions-right">
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
