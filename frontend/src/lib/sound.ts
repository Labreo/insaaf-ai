// Procedural haptic audio via Web Audio. No audio assets. Silent until the first user gesture.
let ctx: AudioContext | null = null
const get = () => (ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)())

function tone(type: OscillatorType, from: number, to: number, dur: number, gain = 0.08) {
  try {
    const c = get()
    const o = c.createOscillator(); const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(from, c.currentTime)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), c.currentTime + dur)
    g.gain.setValueAtTime(gain, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
    o.connect(g); g.connect(c.destination)
    o.start(); o.stop(c.currentTime + dur)
  } catch { /* audio blocked */ }
}

export const sfx = {
  tap: () => tone('triangle', 180, 40, 0.04, 0.06),
  tick: () => tone('sine', 880, 660, 0.05, 0.03),
  stage: () => tone('sine', 520, 780, 0.12, 0.05),
  reject: () => { tone('square', 140, 60, 0.18, 0.07); navigator.vibrate?.([40, 40, 40]) },
  accept: () => { tone('sine', 660, 990, 0.16, 0.05); navigator.vibrate?.(20) },
  seal: () => { tone('triangle', 300, 90, 0.22, 0.09); navigator.vibrate?.(30) },
}
