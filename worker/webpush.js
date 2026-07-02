// Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) implemented with the standard
// Web Crypto API only — so the exact same code runs in Node (for local testing)
// and in a Cloudflare Worker (no Node-only deps like the `web-push` package).

const enc = new TextEncoder()

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  s += '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64url(bytes) {
  let bin = ''
  const b = new Uint8Array(bytes)
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...arrays) {
  let len = 0
  for (const a of arrays) len += a.length
  const out = new Uint8Array(len)
  let off = 0
  for (const a of arrays) {
    out.set(a, off)
    off += a.length
  }
  return out
}

// Build the ES256-signed VAPID JWT for a given push endpoint origin.
async function vapidAuth(endpoint, subject, publicKey, privateKey) {
  const audience = new URL(endpoint).origin
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesToB64url(
    enc.encode(
      JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }),
    ),
  )
  const signingInput = `${header}.${payload}`

  const pub = b64urlToBytes(publicKey) // 65 bytes: 0x04 || X || Y
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: privateKey, // already base64url of the 32-byte private scalar
    ext: true,
  }
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(signingInput),
  )
  const jwt = `${signingInput}.${bytesToB64url(sig)}`
  return `vapid t=${jwt}, k=${publicKey}`
}

async function hkdf(salt, ikm, info, length) {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    base,
    length * 8,
  )
  return new Uint8Array(bits)
}

// Encrypt `payload` (string) for a subscription's keys, returning the aes128gcm body.
async function encrypt(payload, p256dhB64, authB64) {
  const uaPublic = b64urlToBytes(p256dhB64) // 65 bytes
  const authSecret = b64urlToBytes(authB64) // 16 bytes

  // Ephemeral server keypair.
  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey)) // 65 bytes

  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256),
  )

  // RFC 8291: derive the input keying material.
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // Single record: plaintext + 0x02 delimiter, AES-128-GCM.
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext),
  )

  // Header: salt(16) | record_size(4) | idlen(1)=65 | as_public(65)
  const rs = new Uint8Array([0, 0, 0x10, 0]) // 4096
  return concat(salt, rs, new Uint8Array([65]), asPublic, ciphertext)
}

/** Send one push. Returns { status }. Throws with .statusCode on HTTP error. */
export async function sendPush(subscription, payload, vapid) {
  const auth = await vapidAuth(subscription.endpoint, vapid.subject, vapid.publicKey, vapid.privateKey)
  const body = await encrypt(payload, subscription.p256dh, subscription.auth)
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'high',
    },
    body,
  })
  if (!res.ok) {
    const err = new Error(`Push failed ${res.status}`)
    err.statusCode = res.status
    err.body = await res.text().catch(() => '')
    throw err
  }
  return { status: res.status }
}
