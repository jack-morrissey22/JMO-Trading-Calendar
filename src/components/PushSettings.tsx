import { useEffect, useState } from 'react'
import { enablePush, disablePush, getPushState } from '../lib/push'
import type { PushState } from '../lib/push'
import { fetchPushSubscriptions, deletePushSubscription } from '../lib/api'
import type { PushSubscriptionRow } from '../lib/api'

function deviceLabel(ua: string | null): string {
  if (!ua) return 'Unknown device'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android phone'
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  return 'Device'
}

export function PushSettings({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [devices, setDevices] = useState<PushSubscriptionRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setState(await getPushState())
    try {
      setDevices(await fetchPushSubscriptions())
    } catch {
      /* ignore — table may not exist yet before the migration is run */
    }
  }
  useEffect(() => {
    refresh()
  }, [])

  const onEnable = async () => {
    setBusy(true)
    setError(null)
    try {
      const s = await enablePush()
      if (s === 'denied')
        setError(
          'Notifications are blocked. Allow them for this site in your browser/app settings, then try again.',
        )
      if (s === 'unsupported')
        setError(
          'This device can’t do web push here. On iPhone/iPad, install the app to your Home Screen first (Share → Add to Home Screen), then open it from the icon and try again.',
        )
    } catch (e) {
      setError('Could not enable notifications: ' + (e as Error).message)
    }
    await refresh()
    setBusy(false)
  }

  const onDisable = async () => {
    setBusy(true)
    setError(null)
    try {
      await disablePush()
    } catch {
      /* ignore */
    }
    await refresh()
    setBusy(false)
  }

  const onRemove = async (endpoint: string) => {
    setBusy(true)
    try {
      await deletePushSubscription(endpoint)
    } catch {
      /* ignore */
    }
    await refresh()
    setBusy(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal push-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">🔔 Notifications</h2>
        <p className="modal-hint">
          Get reminders on this device even when the app is closed. Turn it on once per device,
          then flag the reminders you want with 📱 on the event.
        </p>

        <div className={`push-status${state === 'enabled' ? ' on' : ''}`}>
          {state === 'enabled'
            ? '✓ Notifications are on for this device.'
            : state === 'denied'
              ? '✗ Notifications are blocked for this device (change it in browser/app settings).'
              : state === 'unsupported'
                ? 'This device can’t receive push here yet.'
                : 'Notifications are off for this device.'}
        </div>

        <div className="push-actions">
          {state === 'enabled' ? (
            <button className="btn-ghost" disabled={busy} onClick={onDisable}>
              Turn off on this device
            </button>
          ) : (
            <button
              className="btn-primary"
              disabled={busy || state === 'unsupported'}
              onClick={onEnable}
            >
              Enable notifications
            </button>
          )}
        </div>

        {error && <div className="auth-error">{error}</div>}

        {devices.length > 0 && (
          <div className="push-devices">
            <div className="push-devices-title">Your enabled devices ({devices.length})</div>
            {devices.map((d) => (
              <div className="push-device" key={d.id}>
                <span>
                  {deviceLabel(d.ua)} · added {new Date(d.created_at).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  className="btn-ghost push-device-x"
                  disabled={busy}
                  onClick={() => onRemove(d.endpoint)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <div className="modal-actions-right">
            <button className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
