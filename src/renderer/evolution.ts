// Agumon → WarGreymon evolution cutscene for the stretch reminder.
// A 9-frame strip played left→right, top→bottom with per-frame holds and
// procedural glitch (digitize) / screen-shake (roar, throw) accents. Pure and
// DOM-free so the frame timeline is unit-testable under node --test.

export type EvolutionPhase = 'idle' | 'playing' | 'fading'

export interface EvolutionAnimState {
  phase: EvolutionPhase
  frame: number
  elapsedMs: number
  /** Horizontal glitch offset in px, non-zero only on the digitize frame. */
  glitchX: number
  shakeX: number
  shakeY: number
}

/** Per-frame hold times in ms, index 0..8 (row-major). */
export const EVOLUTION_HOLDS = [600, 900, 700, 600, 600, 800, 600, 700, 900]
export const EVOLUTION_FRAME_COUNT = EVOLUTION_HOLDS.length
export const FADE_MS = 300

export function createEvolutionAnim(): EvolutionAnimState {
  return { phase: 'idle', frame: 0, elapsedMs: 0, glitchX: 0, shakeX: 0, shakeY: 0 }
}

export function evolutionActive(state: EvolutionAnimState): boolean {
  return state.phase !== 'idle'
}

export function evolutionFrame(state: EvolutionAnimState): number {
  return state.frame
}

export function triggerEvolution(state: EvolutionAnimState): void {
  state.phase = 'playing'
  state.frame = 0
  state.elapsedMs = 0
  state.glitchX = 0
  state.shakeX = 0
  state.shakeY = 0
}

/** Click-to-skip: jump to the fade-out, keeping the last frame on screen. */
export function dismissEvolution(state: EvolutionAnimState): void {
  if (state.phase === 'playing') {
    state.phase = 'fading'
    state.elapsedMs = 0
  }
}

export function evolutionAlpha(state: EvolutionAnimState): number {
  if (state.phase === 'fading') return Math.max(0, 1 - state.elapsedMs / FADE_MS)
  return 1
}

export function tickEvolution(state: EvolutionAnimState, dtMs: number): void {
  if (state.phase === 'idle') return
  state.elapsedMs += dtMs

  if (state.phase === 'playing') {
    // Frame 1 is the digitize; frames 5 (roar) and 8 (throw) shake.
    state.glitchX = state.frame === 1 ? (Math.random() < 0.5 ? -4 : 4) : 0
    if (state.frame === 5 || state.frame === 8) {
      state.shakeX = (Math.random() - 0.5) * 6
      state.shakeY = (Math.random() - 0.5) * 4
    } else {
      state.shakeX = 0
      state.shakeY = 0
    }

    const hold = EVOLUTION_HOLDS[state.frame]
    if (state.elapsedMs >= hold) {
      state.elapsedMs -= hold
      state.frame += 1
      if (state.frame >= EVOLUTION_FRAME_COUNT) {
        // Hold the final frame while fading out.
        state.frame = EVOLUTION_FRAME_COUNT - 1
        state.phase = 'fading'
        state.elapsedMs = 0
        state.glitchX = 0
        state.shakeX = 0
        state.shakeY = 0
      }
    }
  } else if (state.phase === 'fading') {
    if (state.elapsedMs >= FADE_MS) {
      state.phase = 'idle'
      state.elapsedMs = 0
    }
  }
}
