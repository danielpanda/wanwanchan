// IDLE animation timing: breathing loop + random blink.
// Pure, DOM-free and time-based so it can be stepped by the render loop or a
// test. See idle.test.ts.

/** Breathing runs at ~2 FPS (spec §15.1). */
export const BREATH_MS = 500

/**
 * Per-blink-frame hold. The sheet plays at ~2 FPS but a 500ms eyelid would
 * read as the dog falling asleep, so the two blink frames are held for 110ms
 * each (~220ms total) — roughly a real blink.
 */
export const BLINK_FRAME_MS = 110

export const BLINK_MIN_MS = 3000
export const BLINK_MAX_MS = 6000

/**
 * Sheet layout (spec §6.2): three banks of four, one per breathing pose.
 * 0-3 open, 4-7 shut, 8-11 reopening. Breathing keeps running under a blink,
 * so the lid art has to be the variant baked at the current chest offset or
 * the body pops a pixel mid-blink.
 */
export const BREATH_FRAMES = 4
export const FRAME_SHUT = 4
export const FRAME_REOPEN = 8
export const IDLE_FRAMES = 12

/**
 * Chest rise per breathing frame, source px — mirrors BREATH_DY in
 * gen-sprites.mjs. The pupil layer rides the head, so it needs the same
 * vertical offset the current frame bakes in.
 */
export const BREATH_DY = [0, -1, -2, -1] as const

/**
 * A single rAF step can span a long gap (window occluded, machine slept).
 * Clamping keeps the catch-up loop bounded instead of replaying hours of
 * missed frames. Must stay well above BREATH_MS or a slow step would lose
 * real time and drift the breathing behind the wall clock.
 */
const MAX_DT_MS = 1000

export interface IdleAnim {
  breathElapsed: number
  breathIndex: number
  /** ms until the next blink *starts*, so blink-to-blink never exceeds BLINK_MAX_MS. */
  untilBlink: number
  /** ms into the current blink, or null when the eyes are open. */
  blinkElapsed: number | null
}

export type Random = () => number

const nextBlinkDelay = (rand: Random) =>
  BLINK_MIN_MS + rand() * (BLINK_MAX_MS - BLINK_MIN_MS)

export function createIdleAnim(rand: Random = Math.random): IdleAnim {
  return {
    breathElapsed: 0,
    breathIndex: 0,
    untilBlink: nextBlinkDelay(rand),
    blinkElapsed: null,
  }
}

/** Advances `anim` by `dtMs` in place. Breathing keeps running under a blink. */
export function tickIdle(anim: IdleAnim, dtMs: number, rand: Random = Math.random): void {
  const dt = Math.min(Math.max(dtMs, 0), MAX_DT_MS)

  anim.breathElapsed += dt
  while (anim.breathElapsed >= BREATH_MS) {
    anim.breathElapsed -= BREATH_MS
    anim.breathIndex = (anim.breathIndex + 1) % BREATH_FRAMES
  }

  if (anim.blinkElapsed !== null) {
    anim.blinkElapsed += dt
    if (anim.blinkElapsed >= BLINK_FRAME_MS * 2) anim.blinkElapsed = null
  }

  anim.untilBlink -= dt
  if (anim.untilBlink <= 0) {
    anim.blinkElapsed = 0
    anim.untilBlink = nextBlinkDelay(rand)
  }
}

export function idleFrame(anim: IdleAnim): number {
  if (anim.blinkElapsed === null) return anim.breathIndex
  const bank = anim.blinkElapsed < BLINK_FRAME_MS ? FRAME_SHUT : FRAME_REOPEN
  return bank + anim.breathIndex
}
