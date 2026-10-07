// MOCHI DRAG (issue 16): the drag-phase timeline plus a jelly spring. Pure,
// DOM-free and clock-injected, like sleep.ts / steam.ts. The renderer applies
// dragTransform() as a draw transform on every skin; skins without Drag Frames
// (issue 17) draw idle frame 0 under the same transform.

import { layoutFor, windowSizeFor, type SizeOption } from '../main/sizes.ts'

// --- Phase timeline (all exported and tunable) ---
export const LIFT_MS = 120
export const FALL_MS = 100
export const SQUASH_MS = 150
export const DIZZY_MS = 600

export type DragPhase = 'idle' | 'lift' | 'held' | 'fall' | 'squash' | 'dizzy'

// --- Logical frames. issue 17 maps drag.png frame = logical - 2. ---
export const FRAME_LIFT = 2
export const FRAME_HELD = 3
/** Body trails opposite the motion: moving right draws 4, moving left draws 6. */
export const FRAME_SWING_A = 4
export const FRAME_FLAIL = 5
export const FRAME_SWING_B = 6
export const FRAME_FALL = 7
export const FRAME_SQUASH = 8
export const FRAME_DIZZY = 9

// --- Swing / flail detection ---
/** Lateral cursor speed (px/ms) that flips the held pose into a swing. */
export const SIDEWAYS_THRESHOLD_PX_MS = 0.3
export const REVERSAL_WINDOW_MS = 1000
export const REVERSALS_TO_FLAIL = 3

// --- Jelly spring ---
/** Vertical stretch cap (volume-preserving: width = 1 / height). */
export const MAX_STRETCH = 1.3
export const MIN_SQUASH = 1 / MAX_STRETCH
export const MAX_LEAN_RAD = (20 * Math.PI) / 180
/**
 * Damped-oscillator constants. ζ = STRETCH_C / (2√STRETCH_K) ≈ 0.21, so the
 * squash release rings ~2–3 times before settling within the dizzy window.
 */
export const STRETCH_K = 1800
export const STRETCH_C = 18
/** Stretch per px/ms of vertical cursor speed while held. */
export const STRETCH_GAIN = 0.12
/** Lean (rad) per px/ms of lateral cursor speed, opposite the motion. */
export const LEAN_GAIN = 0.0006
/** Visual drop on `fall`, css px, eased back to 0. */
export const FALL_DROP_PX = 4
/** Cursor-velocity exponential-moving-average time constant. */
export const VELOCITY_TAU_MS = 60

/** Same bound as idle.ts: one rAF step can span an occlusion gap / machine sleep. */
const MAX_DT_MS = 1000

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

export interface DragState {
  phase: DragPhase
  phaseElapsed: number
  holding: boolean
  shook: boolean
  /** Lateral swing sign while held; 0 = below threshold. */
  swing: -1 | 0 | 1
  // Spring state: stretch is the vertical scale factor (1 = rest), stretchV its
  // per-second derivative. lean is in radians.
  stretch: number
  stretchV: number
  lean: number
  dropPx: number
  // Motion tracking.
  cursorX: number
  cursorY: number
  vx: number
  vy: number
  reversalTimes: number[]
  /** Monotonic ms accumulator (reversal window + velocity deltas). */
  clock: number
}

export type Random = () => number

// --- Dizzy bubble (issue 18) ---
export const DIZZY_BUBBLE_CHANCE = 0.3
export const DIZZY_BUBBLE_TEXT = '@_@ wheee~'

/** On entering dizzy: a shaken pet with a named owner says wheee 30% of the time. */
export function dizzyBubble(shook: boolean, userName: string, random: Random = Math.random): boolean {
  return shook && userName !== '' && random() < DIZZY_BUBBLE_CHANCE
}

export function createDrag(): DragState {
  return {
    phase: 'idle',
    phaseElapsed: 0,
    holding: false,
    shook: false,
    swing: 0,
    stretch: 1,
    stretchV: 0,
    lean: 0,
    dropPx: 0,
    cursorX: 0,
    cursorY: 0,
    vx: 0,
    vy: 0,
    reversalTimes: [],
    clock: 0,
  }
}

export interface DragInput {
  held: boolean
  cursorX: number
  cursorY: number
  dtMs: number
  /** Per-size spring clamps from springLimits(); default MAX_STRETCH / MIN_SQUASH. */
  maxStretch?: number
  minSquash?: number
}

/**
 * Per-size spring bounds: stretch may rise only into the headroom above the
 * sprite, and squash may widen only into the window's side padding. At the
 * three shipped tiers both are looser than MAX_STRETCH / MIN_SQUASH, so those
 * constants bind; the headroom/padding math is the safety net for a tighter tier.
 */
export interface SpringLimits {
  maxStretch: number
  minSquash: number
}

export function springLimits(size: SizeOption): SpringLimits {
  const { drawSize, headroom } = layoutFor(size)
  const { width } = windowSizeFor(size)
  const sidePadding = (width - drawSize) / 2
  // Top of sprite must not pass the window top: stretch adds drawSize*(s-1).
  const maxStretch = Math.min(MAX_STRETCH, 1 + headroom / drawSize)
  // Squash widens to 1/s; half the width growth must stay inside sidePadding.
  const minSquash = Math.max(MIN_SQUASH, drawSize / (drawSize + sidePadding * 2))
  return { maxStretch, minSquash }
}

function beginLift(d: DragState, cursorX: number, cursorY: number): void {
  d.phase = 'lift'
  d.phaseElapsed = 0
  d.holding = true
  d.shook = false
  d.swing = 0
  // Seed the cursor so the first held velocity delta is from a real sample,
  // not a jump from (0,0).
  d.cursorX = cursorX
  d.cursorY = cursorY
  d.vx = 0
  d.vy = 0
  d.reversalTimes = []
}

function beginFall(d: DragState): void {
  d.phase = 'fall'
  d.phaseElapsed = 0
  d.holding = false
  d.dropPx = FALL_DROP_PX
}

/** Returns the phase entered this tick (for one-shot sound/bubble cues), else null. */
export function tickDrag(d: DragState, input: DragInput): DragPhase | null {
  const startPhase = d.phase
  const dtMs = clamp(input.dtMs, 0, MAX_DT_MS)
  const dt = dtMs / 1000
  d.clock += dtMs

  const maxStretch = input.maxStretch ?? MAX_STRETCH
  const minSquash = input.minSquash ?? MIN_SQUASH

  // Phase edges.
  if (input.held && !d.holding) beginLift(d, input.cursorX, input.cursorY)
  else if (!input.held && d.holding) beginFall(d)

  // Cursor velocity (EMA, px/ms). Tracked while held and through the short
  // fall/squash so the spring and lean keep their momentum after release.
  if (dtMs > 0 && (d.holding || d.phase === 'fall' || d.phase === 'squash')) {
    const alpha = dtMs / (VELOCITY_TAU_MS + dtMs)
    d.vx += ((input.cursorX - d.cursorX) / dtMs - d.vx) * alpha
    d.vy += ((input.cursorY - d.cursorY) / dtMs - d.vy) * alpha
    d.cursorX = input.cursorX
    d.cursorY = input.cursorY
  }

  // Advance the current phase.
  d.phaseElapsed += dtMs
  switch (d.phase) {
    case 'lift':
      if (d.phaseElapsed >= LIFT_MS) {
        d.phase = 'held'
        d.phaseElapsed = 0
      }
      break
    case 'fall':
      if (d.phaseElapsed >= FALL_MS) {
        d.phase = 'squash'
        d.phaseElapsed = 0
      }
      break
    case 'squash':
      if (d.phaseElapsed >= SQUASH_MS) {
        d.phase = 'dizzy'
        d.phaseElapsed = 0
      }
      break
    case 'dizzy':
      if (d.phaseElapsed >= DIZZY_MS) {
        d.phase = 'idle'
        d.phaseElapsed = 0
        d.shook = false
        d.vx = 0
        d.vy = 0
      }
      break
    case 'held':
    case 'idle':
      break
  }

  // Swing sign + flail reversals (lateral, while held).
  const nextSwing: -1 | 0 | 1 =
    d.phase === 'held' && Math.abs(d.vx) > SIDEWAYS_THRESHOLD_PX_MS
      ? d.vx > 0
        ? 1
        : -1
      : 0
  if (nextSwing !== 0 && d.swing !== 0 && nextSwing !== d.swing) {
    d.reversalTimes.push(d.clock)
    d.reversalTimes = d.reversalTimes.filter((t) => d.clock - t <= REVERSAL_WINDOW_MS)
    if (d.reversalTimes.length >= REVERSALS_TO_FLAIL) d.shook = true
  }
  d.swing = nextSwing

  // Spring: stretch oscillator around rest 1. Held stretches with vertical
  // speed; squash pins down; everything else releases back to 1.
  let target = 1
  if (d.phase === 'held') {
    target = 1 + clamp(d.vy * STRETCH_GAIN, minSquash - 1, maxStretch - 1)
  } else if (d.phase === 'squash') {
    target = minSquash
  }
  d.stretchV += (STRETCH_K * (target - d.stretch) - STRETCH_C * d.stretchV) * dt
  d.stretch += d.stretchV * dt
  if (d.stretch > maxStretch) {
    d.stretch = maxStretch
    if (d.stretchV > 0) d.stretchV = 0
  } else if (d.stretch < minSquash) {
    d.stretch = minSquash
    if (d.stretchV < 0) d.stretchV = 0
  }

  // Lean: first-order low-pass toward a lateral target (no overshoot needed).
  const leanTarget =
    d.holding || d.phase === 'fall' || d.phase === 'squash'
      ? clamp(-d.vx * LEAN_GAIN, -MAX_LEAN_RAD, MAX_LEAN_RAD)
      : 0
  d.lean += (leanTarget - d.lean) * (dtMs / (VELOCITY_TAU_MS + dtMs))

  // Fall drop eases back out.
  d.dropPx *= Math.exp(-dtMs / 120)

  return d.phase !== startPhase ? d.phase : null
}

export function dragFrame(d: DragState): number {
  switch (d.phase) {
    case 'lift':
      return FRAME_LIFT
    case 'held':
      if (d.shook) return FRAME_FLAIL
      if (d.swing === 1) return FRAME_SWING_A
      if (d.swing === -1) return FRAME_SWING_B
      return FRAME_HELD
    case 'fall':
      return FRAME_FALL
    case 'squash':
      return FRAME_SQUASH
    case 'dizzy':
      return FRAME_DIZZY
    case 'idle':
      return 0
  }
}

export interface DragTransform {
  /** Vertical scale around the bottom-center anchor (1 = rest). */
  stretchY: number
  /** Horizontal scale, 1 / stretchY, so area is preserved. */
  scaleX: number
  /** Lean angle in radians. */
  leanRad: number
  /** Vertical drop in css px (fall only). */
  dropPx: number
}

export function dragTransform(d: DragState): DragTransform {
  return { stretchY: d.stretch, scaleX: 1 / d.stretch, leanRad: d.lean, dropPx: d.dropPx }
}
