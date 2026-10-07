// Input aggregation: rolling KPS window + cursor + alternating paw side.
// Pure, electron-free and clock-injected so it can be driven by the 60Hz tick
// in input-hook.ts or by a test. See input-state.test.ts.

/** The 60Hz main→renderer payload (spec §9.1). */
export interface InputState {
  kps: number
  cursorX: number
  cursorY: number
  lastKeyside: 'left' | 'right'
  /**
   * Total keystrokes this session, monotonic. The renderer detects a new strike
   * by comparing this across snapshots.
   *
   * kps and lastKeyside cannot answer that on their own: two keys landing in
   * one 16ms tick flip the side twice back to its old value, and if two older
   * stamps age out of the window in the same tick kps is unchanged too — the
   * strike would be invisible. A counter has no such blind spot. It would need
   * ~14 billion years of continuous typing to reach MAX_SAFE_INTEGER.
   */
  keySeq: number
}

export const STATE_UPDATE_CHANNEL = 'wanwan:state-update'

/**
 * Rolling window width (spec §8.1). Doubles as the typing→idle silence timer:
 * one second after the last keystroke the window empties and kps hits 0, so
 * the renderer needs no separate inactivity timeout.
 */
export const KPS_WINDOW_MS = 1000

export interface InputTracker {
  /** Keydown timestamps inside the window, oldest first. */
  keys: number[]
  cursorX: number
  cursorY: number
  lastKeyside: 'left' | 'right'
  keySeq: number
}

/** Seeded 'right' so the first strike of a session lands on the left paw. */
export function createTracker(): InputTracker {
  return { keys: [], cursorX: 0, cursorY: 0, lastKeyside: 'right', keySeq: 0 }
}

function prune(tracker: InputTracker, now: number): void {
  const cutoff = now - KPS_WINDOW_MS
  let expired = 0
  while (expired < tracker.keys.length && tracker.keys[expired]! <= cutoff) expired++
  // One splice beats a shift per entry; a burst can hold hundreds of stamps.
  if (expired > 0) tracker.keys.splice(0, expired)
}

export function recordKey(tracker: InputTracker, now: number): void {
  tracker.keys.push(now)
  tracker.lastKeyside = tracker.lastKeyside === 'left' ? 'right' : 'left'
  tracker.keySeq++
  prune(tracker, now)
}

export function recordCursor(tracker: InputTracker, x: number, y: number): void {
  tracker.cursorX = x
  tracker.cursorY = y
}

export function snapshot(tracker: InputTracker, now: number): InputState {
  prune(tracker, now)
  return {
    kps: tracker.keys.length,
    cursorX: tracker.cursorX,
    cursorY: tracker.cursorY,
    lastKeyside: tracker.lastKeyside,
    keySeq: tracker.keySeq,
  }
}

export function sameState(a: InputState, b: InputState): boolean {
  return (
    a.kps === b.kps &&
    a.cursorX === b.cursorX &&
    a.cursorY === b.cursorY &&
    // keySeq subsumes lastKeyside — both only ever change on a keydown — but
    // not kps: the window draining to 0 is a real change with no new key, and
    // that is the TYPING→IDLE transition.
    a.keySeq === b.keySeq
  )
}
