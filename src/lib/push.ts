import { savePushSubscription, deletePushSubscription } from './api'

// VAPID public key — safe to ship in the client. The matching private key lives
// only in the GitHub Actions secret that signs outgoing push messages.
const VAPID_PUBLIC_KEY =
  'BGTKejHvfDE8wwtu96WBUPU-j4E6Uu2PiPnGzQKq6NYSjCrYw_d0deV39JVWGqcrH00xOt_VtpCQlXsdj8eJf98'

export type PushState = 'unsupported' | 'denied' | 'default' | 'enabled'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Current push state for THIS device (not the DB — the live browser subscription). */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  return sub && Notification.permission === 'granted' ? 'enabled' : 'default'
}

/** Ask permission, subscribe this device, and store it. Must be called from a
 *  user gesture (required on iOS). Returns the resulting state. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'default'
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
  }
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  await savePushSubscription({ endpoint: json.endpoint, keys: json.keys }, navigator.userAgent)
  return 'enabled'
}

/** Unsubscribe this device and remove it from the DB. */
export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (sub) {
    await deletePushSubscription(sub.endpoint).catch(() => {})
    await sub.unsubscribe()
  }
}
