import { useState } from 'react'
import { analyzeBackup, isRawBackup, restoreFromBackup } from '../lib/api'
import type { RawBackup, RestorePlan } from '../lib/api'
import { useEscClose } from '../lib/useEscClose'

type Props = {
  onRestored: () => void
  onClose: () => void
}

const fmtWhen = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString()
}
const totalMissing = (p: RestorePlan) => p.series.missing + p.events.missing + p.reminders.missing

// Restore from a backup file — strictly additive. Upload the JSON restore file
// (from the weekly email or Export → "JSON restore file"), see exactly what is
// currently missing, and re-add only those rows. Nothing existing is changed or
// removed, so it's always safe to try.
export function RestoreManager({ onRestored, onClose }: Props) {
  const [backup, setBackup] = useState<RawBackup | null>(null)
  const [plan, setPlan] = useState<RestorePlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<RestorePlan | null>(null)
  useEscClose(onClose, busy)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setBackup(null)
    setPlan(null)
    setDone(null)
    try {
      const parsed = JSON.parse(await file.text())
      if (!isRawBackup(parsed)) {
        setError(
          "That doesn't look like a restore file. Use the JSON attached to the weekly backup email, " +
            'or Export → “JSON restore file” — not the CSV or the readable JSON summary.',
        )
        return
      }
      setBusy(true)
      const p = await analyzeBackup(parsed)
      setBackup(parsed)
      setPlan(p)
    } catch (e) {
      setError(e instanceof Error ? `Couldn't read that file: ${e.message}` : "Couldn't read that file.")
    } finally {
      setBusy(false)
    }
  }

  const doRestore = async () => {
    if (!backup) return
    setBusy(true)
    setError(null)
    try {
      const result = await restoreFromBackup(backup)
      setDone(result)
      onRestored()
    } catch (e) {
      setError(e instanceof Error ? `Restore failed: ${e.message}` : 'Restore failed.')
    } finally {
      setBusy(false)
    }
  }

  const nothingMissing = plan !== null && totalMissing(plan) === 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal restore-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">♻ Restore from backup</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label="Close" title="Close (Esc)">
            ✕
          </button>
        </div>

        {done ? (
          <>
            <div className="restore-result">
              ✅ Restored{' '}
              <strong>{done.series.missing}</strong> series,{' '}
              <strong>{done.events.missing}</strong> events and{' '}
              <strong>{done.reminders.missing}</strong> reminders.
              {totalMissing(done) === 0 && ' (Everything was already present.)'}
            </div>
            <div className="modal-actions">
              <div className="modal-actions-right">
                <button type="button" className="btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="modal-hint">
              Re-adds only what's <strong>currently missing</strong> from a backup file — anything you
              deleted comes back, with its reminders and repeat links intact. Nothing that still exists
              is changed or removed, so this is always safe to run.
            </p>

            <label className="restore-file">
              <span>Choose a backup file (.json)</span>
              <input type="file" accept="application/json,.json" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
            </label>

            {error && <div className="auth-error">{error}</div>}

            {plan && backup && (
              <div className="restore-preview">
                <div className="restore-preview-when">Backup from {fmtWhen(backup.exported_at)}</div>
                <table className="restore-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>In file</th>
                      <th>Missing → restore</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Series</td>
                      <td>{plan.series.total}</td>
                      <td className={plan.series.missing ? 'restore-missing' : ''}>{plan.series.missing}</td>
                    </tr>
                    <tr>
                      <td>Events</td>
                      <td>{plan.events.total}</td>
                      <td className={plan.events.missing ? 'restore-missing' : ''}>{plan.events.missing}</td>
                    </tr>
                    <tr>
                      <td>Reminders</td>
                      <td>{plan.reminders.total}</td>
                      <td className={plan.reminders.missing ? 'restore-missing' : ''}>{plan.reminders.missing}</td>
                    </tr>
                  </tbody>
                </table>
                {nothingMissing && (
                  <div className="restore-nothing">Everything in this backup is already present — nothing to restore.</div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <div className="modal-actions-right">
                <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || !plan || nothingMissing}
                  onClick={doRestore}
                >
                  {busy ? 'Working…' : plan ? `Restore ${totalMissing(plan)} item${totalMissing(plan) === 1 ? '' : 's'}` : 'Restore'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
