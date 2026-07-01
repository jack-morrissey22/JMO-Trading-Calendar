// Reminder audio. A default chime is synthesised via the Web Audio API (no asset
// needed). Browsers block audio until a user gesture, so primeSound() is called
// on the first interaction to unlock playback for later timer-fired reminders.

let ctx: AudioContext | null = null

function audioCtx(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export function primeSound() {
  const c = audioCtx()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
}

/** Play a custom reminder clip from a data URI (or URL). */
export function playClip(src: string) {
  try {
    const audio = new Audio(src)
    audio.play().catch(() => {})
  } catch {
    /* audio unavailable — ignore */
  }
}

/** Speak text aloud via the browser's speech engine (for 'speak the name'). */
export function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1
    u.pitch = 1
    window.speechSynthesis.speak(u)
  } catch {
    /* speech unavailable — ignore */
  }
}

/** A short two-note chime, the default reminder sound. */
export function playChime() {
  const c = audioCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  const now = c.currentTime
  ;[880, 1174.66].forEach((freq, i) => {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = now + i * 0.16
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    osc.connect(gain).connect(c.destination)
    osc.start(t)
    osc.stop(t + 0.35)
  })
}
