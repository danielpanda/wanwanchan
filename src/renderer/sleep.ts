// SLEEP animation: droop-in transition, 1 FPS loop with floating Zzz, and a
// quick 2-frame wake (spec §15.5-15.7). Pure, DOM-free and time-based, like
// idle.ts. See sleep.test.ts.

/** Total inactivity before WanWan-chan dozes off (spec §8.2). */
export const SLEEP_AFTER_MS = 3 * 60 * 1000

/** The settle transition plays once at ~2.5 FPS (spec §15.5). */
export const TRANSITION_FRAME_MS = 400
export const TRANSITION_FRAMES = 4

/** The sleep loop runs at ~1 FPS (spec §15.6). */
export const LOOP_FRAME_MS = 1000

/** Wake is a quicker, shorter reverse of the transition's tail (§15.7). */
export const WAKE_FRAME_MS = 200
/** sleep-transition.png frames the wake plays, in order: curled → head up. */
const WAKE_FRAMES = [3, 2] as const

/**
 * Same bound as idle.ts: one rAF step can span an occlusion gap or machine
 * sleep. Clamping keeps a gap from fast-forwarding through the settle.
 */
const MAX_DT_MS = 1000

export type SleepPhase = 'transition' | 'loop' | 'wake'

export interface SleepAnim {
  /** null = awake; the renderer draws no sleep sheet while null. */
  phase: SleepPhase | null
  /** ms into the current phase. */
  elapsed: number
}

export function createSleepAnim(): SleepAnim {
  return { phase: null, elapsed: 0 }
}

/** 3 minutes of inactivity: start the one-way drift into sleep. */
export function fallAsleep(anim: SleepAnim): void {
  anim.phase = 'transition'
  anim.elapsed = 0
}

/** A keystroke mid-sleep snaps a quick 2-frame wake before rejoining idle. */
export function startWake(anim: SleepAnim): void {
  anim.phase = 'wake'
  anim.elapsed = 0
}

export function tickSleep(anim: SleepAnim, dtMs: number): void {
  if (anim.phase === null) return
  anim.elapsed += Math.min(Math.max(dtMs, 0), MAX_DT_MS)
  if (anim.phase === 'transition' && anim.elapsed >= TRANSITION_FRAMES * TRANSITION_FRAME_MS) {
    anim.phase = 'loop'
    anim.elapsed = 0
  } else if (anim.phase === 'wake' && anim.elapsed >= WAKE_FRAMES.length * WAKE_FRAME_MS) {
    anim.phase = null
    anim.elapsed = 0
  }
}

/** Frame index into whichever sheet the current phase draws from. */
export function sleepFrame(anim: SleepAnim): number {
  switch (anim.phase) {
    case 'transition':
      return Math.min(Math.floor(anim.elapsed / TRANSITION_FRAME_MS), TRANSITION_FRAMES - 1)
    case 'loop':
      return Math.floor(anim.elapsed / LOOP_FRAME_MS) % 2
    case 'wake':
      return WAKE_FRAMES[Math.min(Math.floor(anim.elapsed / WAKE_FRAME_MS), WAKE_FRAMES.length - 1)]
  }
  return 0
}

/**
 * Zzz field: 3 glyphs staggered by thirds of a lifetime, so the field is
 * always mid-flight and wraps continuously (spec §15.6). Positions are in
 * source sprite pixels, like steam.ts.
 */
export const ZZZ_COUNT = 3
export const ZZZ_LIFETIME_MS = 3200
/** Total rise over one lifetime, source px. */
export const ZZZ_RISE_PX = 20
export const ZZZ_WOBBLE_AMPLITUDE = 2.5
export const ZZZ_WOBBLE_MS = 800
/** Head-top anchor the glyphs lift off from, source px (matches the art). */
export const ZZZ_ORIGIN = { x: 42, y: 12 } as const

export interface ZzzAnim {
  /** ms of sleep-loop time; glyph ages derive from it with stagger. */
  elapsed: number
}

export function createZzzAnim(): ZzzAnim {
  return { elapsed: 0 }
}

export function tickZzz(anim: ZzzAnim, dtMs: number): void {
  anim.elapsed += Math.min(Math.max(dtMs, 0), MAX_DT_MS)
}

export interface ZzzGlyph {
  x: number
  y: number
  alpha: number
  /** Font size in source px; the renderer scales it to CSS. Grows as it rises. */
  size: number
}

export function zzzGlyphs(anim: ZzzAnim): ZzzGlyph[] {
  const glyphs: ZzzGlyph[] = []
  for (let i = 0; i < ZZZ_COUNT; i++) {
    const age = (anim.elapsed + (i * ZZZ_LIFETIME_MS) / ZZZ_COUNT) % ZZZ_LIFETIME_MS
    const progress = age / ZZZ_LIFETIME_MS
    glyphs.push({
      x: ZZZ_ORIGIN.x + Math.sin((age / ZZZ_WOBBLE_MS) * Math.PI * 2 + i) * ZZZ_WOBBLE_AMPLITUDE,
      y: ZZZ_ORIGIN.y - progress * ZZZ_RISE_PX,
      alpha: 1 - progress,
      size: 4 + progress * 2,
    })
  }
  return glyphs
}
