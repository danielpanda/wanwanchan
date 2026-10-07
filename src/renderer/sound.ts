// Procedural Web Audio API Synthesizer for WanWan-chan.
// Authentic 8-bit Tamagotchi chiptune sound effects:
// - Purring (warm low-frequency LFO tremolo)
// - Happy Hop (upbeat ascending arpeggio blip)
// - Reminder Chime (digital companion melody)
// - Water Bubble (gentle liquid pop)
// - Stretch Slide (rising warm portamento)
// - Evolution (rising arpeggio + low roar tail)

export interface SoundConfig {
  enabled: boolean
  volume: number
}

let audioCtx: AudioContext | null = null
let soundConfig: SoundConfig = {
  enabled: true,
  volume: 0.7,
}

export function configureSound(config: Partial<SoundConfig>): void {
  if (typeof config.enabled === 'boolean') soundConfig.enabled = config.enabled
  if (typeof config.volume === 'number') {
    soundConfig.volume = Math.max(0, Math.min(1, config.volume))
  }
}

export function getSoundConfig(): Readonly<SoundConfig> {
  return soundConfig
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return null
  if (!audioCtx) {
    audioCtx = new AudioCtx()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

function masterGain(ctx: AudioContext, customVol = 1): GainNode | null {
  if (!soundConfig.enabled || soundConfig.volume <= 0) return null
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(soundConfig.volume * customVol, ctx.currentTime)
  gain.connect(ctx.destination)
  return gain
}

/** Warm low-frequency purr with gentle tremolo modulation */
export function playPurr(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const master = masterGain(ctx, 0.5)
  if (!master) return

  const now = ctx.currentTime
  const duration = 0.55

  // Two warm low oscillators
  const osc1 = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  osc1.type = 'triangle'
  osc2.type = 'sine'
  osc1.frequency.setValueAtTime(85, now)
  osc2.frequency.setValueAtTime(125, now)

  // Tremolo LFO for vibration
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  lfo.type = 'sine'
  lfo.frequency.setValueAtTime(24, now)
  lfoGain.gain.setValueAtTime(0.4, now)
  lfo.connect(lfoGain.gain)

  const tremolo = ctx.createGain()
  tremolo.gain.setValueAtTime(0.6, now)

  const env = ctx.createGain()
  env.gain.setValueAtTime(0.001, now)
  env.gain.exponentialRampToValueAtTime(0.7, now + 0.08)
  env.gain.exponentialRampToValueAtTime(0.001, now + duration)

  osc1.connect(tremolo)
  osc2.connect(tremolo)
  tremolo.connect(env)
  env.connect(master)

  lfo.start(now)
  osc1.start(now)
  osc2.start(now)

  lfo.stop(now + duration)
  osc1.stop(now + duration)
  osc2.stop(now + duration)
}

/** Upbeat 8-bit ascending arpeggio blip */
export function playHappyHop(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const master = masterGain(ctx, 0.45)
  if (!master) return

  const now = ctx.currentTime
  const notes = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6
  const noteDuration = 0.065

  notes.forEach((freq, i) => {
    const start = now + i * noteDuration
    const osc = ctx.createOscillator()
    const env = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, start)

    env.gain.setValueAtTime(0.001, start)
    env.gain.linearRampToValueAtTime(0.8, start + 0.01)
    env.gain.exponentialRampToValueAtTime(0.001, start + noteDuration)

    osc.connect(env)
    env.connect(master)

    osc.start(start)
    osc.stop(start + noteDuration)
  })
}

/** Melodic digital pet alert chime */
export function playReminderChime(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const master = masterGain(ctx, 0.4)
  if (!master) return

  const now = ctx.currentTime
  const notes = [659.25, 783.99, 987.77, 1318.51] // E5, G5, B5, E6
  const noteDur = 0.09

  notes.forEach((freq, idx) => {
    const start = now + idx * noteDur
    const osc = ctx.createOscillator()
    const env = ctx.createGain()

    osc.type = idx === notes.length - 1 ? 'sine' : 'triangle'
    osc.frequency.setValueAtTime(freq, start)

    env.gain.setValueAtTime(0.001, start)
    env.gain.linearRampToValueAtTime(0.7, start + 0.01)
    env.gain.exponentialRampToValueAtTime(0.001, start + (idx === notes.length - 1 ? 0.35 : noteDur * 1.5))

    osc.connect(env)
    env.connect(master)

    osc.start(start)
    osc.stop(start + (idx === notes.length - 1 ? 0.4 : noteDur * 1.6))
  })
}

/** Liquid bubble pop sound for water reminders */
export function playWaterBubble(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const master = masterGain(ctx, 0.4)
  if (!master) return

  const now = ctx.currentTime
  const duration = 0.14

  const osc = ctx.createOscillator()
  const env = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(320, now)
  osc.frequency.exponentialRampToValueAtTime(960, now + duration * 0.7)

  env.gain.setValueAtTime(0.001, now)
  env.gain.linearRampToValueAtTime(0.7, now + 0.02)
  env.gain.exponentialRampToValueAtTime(0.001, now + duration)

  osc.connect(env)
  env.connect(master)

  osc.start(now)
  osc.stop(now + duration)
}

/** Rising warm portamento pitch slide for stretch reminders */
export function playStretchSlide(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const master = masterGain(ctx, 0.35)
  if (!master) return

  const now = ctx.currentTime
  const duration = 0.35

  const osc = ctx.createOscillator()
  const env = ctx.createGain()

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(260, now)
  osc.frequency.exponentialRampToValueAtTime(520, now + duration * 0.8)

  env.gain.setValueAtTime(0.001, now)
  env.gain.linearRampToValueAtTime(0.6, now + 0.05)
  env.gain.exponentialRampToValueAtTime(0.001, now + duration)

  osc.connect(env)
  env.connect(master)

  osc.start(now)
  osc.stop(now + duration)
}

/** Rising arpeggio + low roar tail for the evolution cutscene. */
export function playEvolution(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const master = masterGain(ctx, 0.5)
  if (!master) return

  const now = ctx.currentTime
  const notes = [220, 261.63, 329.63, 440, 523.25, 659.25] // A3 C4 E4 A4 C5 E5
  const noteDur = 0.09
  notes.forEach((freq, i) => {
    const start = now + i * noteDur
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(freq, start)
    env.gain.setValueAtTime(0.001, start)
    env.gain.linearRampToValueAtTime(0.5, start + 0.01)
    env.gain.exponentialRampToValueAtTime(0.001, start + noteDur * 1.2)
    osc.connect(env)
    env.connect(master)
    osc.start(start)
    osc.stop(start + noteDur * 1.2)
  })

  // Low saw roar tail, decaying after the arpeggio lands.
  const roarStart = now + notes.length * noteDur
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(90, roarStart)
  osc.frequency.exponentialRampToValueAtTime(45, roarStart + 0.7)
  env.gain.setValueAtTime(0.001, roarStart)
  env.gain.exponentialRampToValueAtTime(0.5, roarStart + 0.06)
  env.gain.exponentialRampToValueAtTime(0.001, roarStart + 0.9)
  osc.connect(env)
  env.connect(master)
  osc.start(roarStart)
  osc.stop(roarStart + 0.9)
}
