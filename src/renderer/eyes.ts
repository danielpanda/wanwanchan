// PUPIL tracking: gaze offset toward the global cursor (spec §7).
// Pure, DOM-free; the render loop feeds it the window rect + cursor each
// frame and draws the smoothed offset. See eyes.test.ts.

/** Gaze travel cap in source pixels (spec §7.2). */
export const PUPIL_MAX_OFFSET = 0.5

/**
 * Glide half-time: after this much time the gaze has covered ~63% of the
 * remaining distance. Small enough to feel attentive, large enough to read
 * as a glide rather than a snap.
 */
export const PUPIL_SMOOTH_MS = 120

/** Same occlusion-gap bound every animation module clamps to. */
export const MAX_DT_MS = 1000

/**
 * Eye centers in frame coordinates, matching the sockets baked into the
 * open-eye frames of gen-sprites.mjs. The renderer adds the current pose's
 * breath offset and the smoothed gaze offset.
 */
export const EYE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [25, 26],
  [39, 26],
]

export const EYE_ANCHORS_PER_SKIN: Record<string, ReadonlyArray<readonly [number, number]>> = {
  // mirrors assets/art-src/agumon/skin.json "eyes" (3/4 view: one visible eye)
  agumon: [[29, 17]],
}

export function getEyeAnchors(skin: string): ReadonlyArray<readonly [number, number]> {
  return EYE_ANCHORS_PER_SKIN[skin] ?? EYE_ANCHORS
}

export interface PupilOffset {
  x: number
  y: number
}

export function createPupilOffset(): PupilOffset {
  return { x: 0, y: 0 }
}

/**
 * Where the gaze should point: a unit vector from the window's center toward
 * the cursor, scaled to the cap. Cursor and window rect share one coordinate
 * space (macOS global display points), so the angle holds on any display.
 */
export function pupilTarget(
  cursorX: number,
  cursorY: number,
  winX: number,
  winY: number,
  winW: number,
  winH: number,
): PupilOffset {
  const angle = Math.atan2(cursorY - (winY + winH / 2), cursorX - (winX + winW / 2))
  return {
    x: Math.cos(angle) * PUPIL_MAX_OFFSET,
    y: Math.sin(angle) * PUPIL_MAX_OFFSET,
  }
}

/**
 * Exponential approach — frame-rate-independent smoothing: the same fraction
 * of the remaining distance per PUPIL_SMOOTH_MS whatever the dt, so the gaze
 * glides at one speed on a 60Hz display and a throttled one alike.
 */
export function tickPupils(p: PupilOffset, target: PupilOffset, dtMs: number): void {
  // The exp saturates well before 1s anyway, but the clamp keeps the module
  // uniform with its siblings and the bound explicit.
  const dt = Math.min(Math.max(dtMs, 0), MAX_DT_MS)
  const t = 1 - Math.exp(-dt / PUPIL_SMOOTH_MS)
  p.x += (target.x - p.x) * t
  p.y += (target.y - p.y) * t
}
