// TYPING animation timing: alternating paw strikes driven by keystrokes.
// Pure, DOM-free and time-based, like idle.ts. See typing.test.ts.
import type { InputState } from '../main/input-state.ts'

/**
 * How long a struck paw stays down. Long enough to read as a tap, short enough
 * that slow typing (one key a second) shows a strike-and-release rather than a
 * paw stuck on the key until the next keystroke.
 */
export const STRIKE_MS = 90

/**
 * The vertical offset the typing sheet bakes every pose at (mid-breath, so
 * idle↔typing switches never shift the body). Mirrors TYPING_DY in
 * gen-sprites.mjs; the pupil layer uses it as its anchor offset.
 */
export const TYPING_POSE_DY = -1

/** Sheet frame indices: neutral, left-down, right-down (spec §6.2). */
const FRAME_NEUTRAL = 0
const FRAME_LEFT = 1
const FRAME_RIGHT = 2

export type PawSide = InputState['lastKeyside']

export interface TypingAnim {
  side: PawSide
  /** ms into the current strike, or null when both paws are neutral. */
  strikeElapsed: number | null
}

export function createTypingAnim(): TypingAnim {
  return { side: 'right', strikeElapsed: null }
}

/** True when `next` reports a keystroke that `prev` did not (see `keySeq`). */
export function isNewStrike(prev: InputState | null, next: InputState): boolean {
  if (next.kps === 0) return false
  return next.keySeq > (prev?.keySeq ?? 0)
}

export function strike(anim: TypingAnim, side: PawSide): void {
  anim.side = side
  anim.strikeElapsed = 0
}

export function tickTyping(anim: TypingAnim, dtMs: number): void {
  if (anim.strikeElapsed === null) return
  anim.strikeElapsed += Math.max(dtMs, 0)
  if (anim.strikeElapsed >= STRIKE_MS) anim.strikeElapsed = null
}

export function typingFrame(anim: TypingAnim): number {
  if (anim.strikeElapsed === null) return FRAME_NEUTRAL
  return anim.side === 'left' ? FRAME_LEFT : FRAME_RIGHT
}
