// Petting tracker: detects rubbing/stroking gestures over the pet's head.

export interface HeadBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface PettingState {
  level: number // 0 to 1
  isPetting: boolean
  lastStrokeAt: number
  lastPurrAt: number
  lastX: number
  lastY: number
  lastDx: number
  accumDistance: number
  strokeCount: number
}

const PURR_COOLDOWN_MS = 500
const DECAY_RATE_PER_SEC = 0.6
const STROKE_MIN_DIST = 6
const STROKE_TIMEOUT_MS = 800

export function createPettingState(): PettingState {
  return {
    level: 0,
    isPetting: false,
    lastStrokeAt: 0,
    lastPurrAt: 0,
    lastX: 0,
    lastY: 0,
    lastDx: 0,
    accumDistance: 0,
    strokeCount: 0,
  }
}

/** Calculates head bounds relative to canvas pixels based on sprite draw layout */
export function getHeadBounds(drawX: number, drawY: number, drawSize: number, scale: number): HeadBounds {
  // Head occupies approx source coords X:[14..50], Y:[8..36]
  return {
    minX: drawX + 14 * scale,
    maxX: drawX + 50 * scale,
    minY: drawY + 8 * scale,
    maxY: drawY + 36 * scale,
  }
}

export function isInsideHead(bounds: HeadBounds, x: number, y: number): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY
}

export function tickPetting(
  state: PettingState,
  cursorCanvasX: number,
  cursorCanvasY: number,
  bounds: HeadBounds,
  dtMs: number,
  now: number,
  onPurr?: () => void,
): void {
  const inHead = isInsideHead(bounds, cursorCanvasX, cursorCanvasY)
  const dtSec = dtMs / 1000

  if (inHead) {
    const dx = cursorCanvasX - state.lastX
    const dy = cursorCanvasY - state.lastY
    const dist = Math.hypot(dx, dy)

    if (dist >= STROKE_MIN_DIST && dist <= 80) {
      // Check for direction reversal (scrubbing back and forth)
      if (state.lastDx !== 0 && Math.sign(dx) !== Math.sign(state.lastDx)) {
        state.strokeCount++
        state.level = Math.min(1, state.level + 0.35)
        state.lastStrokeAt = now
      }
      state.accumDistance += dist
      state.lastDx = dx
    }
  } else {
    state.lastDx = 0
  }

  state.lastX = cursorCanvasX
  state.lastY = cursorCanvasY

  // Reset stroke count if cursor stopped moving
  if (now - state.lastStrokeAt > STROKE_TIMEOUT_MS) {
    state.strokeCount = 0
    state.level = Math.max(0, state.level - DECAY_RATE_PER_SEC * dtSec)
  }

  state.isPetting = state.level > 0.3

  // Trigger purr sound and events
  if (state.isPetting && now - state.lastPurrAt >= PURR_COOLDOWN_MS) {
    state.lastPurrAt = now
    onPurr?.()
  }
}
