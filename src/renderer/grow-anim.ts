// In-place elastic grow animation for Stretch and Drink Water events.

export type GrowKind = 'stretch' | 'water'
export type GrowPhase = 'idle' | 'growing' | 'holding' | 'shrinking'

export interface GrowAnimState {
  phase: GrowPhase
  kind: GrowKind | null
  scaleX: number
  scaleY: number
  elapsedMs: number
  maxScale: number
  holdDurationMs: number
}

const GROW_MS = 450
const SHRINK_MS = 400
const DEFAULT_HOLD_MS = 6500

export function createGrowAnimState(): GrowAnimState {
  return {
    phase: 'idle',
    kind: null,
    scaleX: 1,
    scaleY: 1,
    elapsedMs: 0,
    maxScale: 1.5,
    holdDurationMs: DEFAULT_HOLD_MS,
  }
}

export function triggerGrowAnim(
  state: GrowAnimState,
  kind: GrowKind,
  holdDurationMs = DEFAULT_HOLD_MS,
): void {
  state.phase = 'growing'
  state.kind = kind
  state.elapsedMs = 0
  state.scaleX = 1
  state.scaleY = 1
  state.maxScale = 1.5
  state.holdDurationMs = holdDurationMs
}

export function dismissGrowAnim(state: GrowAnimState): void {
  if (state.phase === 'growing' || state.phase === 'holding') {
    state.phase = 'shrinking'
    state.elapsedMs = 0
  }
}

export function tickGrowAnim(state: GrowAnimState, dtMs: number): void {
  if (state.phase === 'idle') return

  state.elapsedMs += dtMs

  if (state.phase === 'growing') {
    const t = Math.min(1, state.elapsedMs / GROW_MS)
    // Elastic overshoot easing: f(t) = sin(-13 * (t + 1) * PI/2) * pow(2, -10 * t) + 1
    const overshoot = Math.sin(t * Math.PI * 1.5) * 0.15
    const baseScale = 1 + (state.maxScale - 1) * t + overshoot
    state.scaleX = baseScale
    state.scaleY = baseScale

    if (t >= 1) {
      state.phase = 'holding'
      state.elapsedMs = 0
      state.scaleX = state.maxScale
      state.scaleY = state.maxScale
    }
  } else if (state.phase === 'holding') {
    // Rhythmic stretch / bobbing during hold
    if (state.kind === 'stretch') {
      const stretchCycle = Math.sin(state.elapsedMs * 0.005)
      state.scaleY = state.maxScale + stretchCycle * 0.08
      state.scaleX = state.maxScale - stretchCycle * 0.05
    } else {
      // Gentle water pulse
      const bob = Math.sin(state.elapsedMs * 0.006)
      state.scaleX = state.maxScale + bob * 0.03
      state.scaleY = state.maxScale + bob * 0.03
    }

    if (state.elapsedMs >= state.holdDurationMs) {
      state.phase = 'shrinking'
      state.elapsedMs = 0
    }
  } else if (state.phase === 'shrinking') {
    const t = Math.min(1, state.elapsedMs / SHRINK_MS)
    const currentScale = state.maxScale - (state.maxScale - 1) * t
    state.scaleX = Math.max(1, currentScale)
    state.scaleY = Math.max(1, currentScale)

    if (t >= 1) {
      state.phase = 'idle'
      state.kind = null
      state.scaleX = 1
      state.scaleY = 1
      state.elapsedMs = 0
    }
  }
}
