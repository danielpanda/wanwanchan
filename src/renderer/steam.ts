// OVERHEAT steam particles: puffs rising off the bat ears while KPS ≥ 5.
// Pure, DOM-free and time-based, like idle.ts and typing.ts. Positions are in
// source sprite pixels (the 64x64 frame space); the renderer maps them to CSS
// coordinates. See steam.test.ts.

/** Typing at or above this rolling KPS trips overheat (spec §8.3). */
export const OVERHEAT_KPS = 5

/** One puff per ear alternately, every ~300ms while overheated. */
export const STEAM_EMIT_MS = 300

/** Puff lifetime; also the sheet's per-frame hold, so the walk is 0,1,2. */
export const STEAM_LIFETIME_MS = 900
const STEAM_FRAME_MS = STEAM_LIFETIME_MS / 3

/** Upward drift, source px/ms (~11px over a lifetime ≈ 33 CSS px at 3x). */
const RISE_PX_PER_MS = -0.012

/**
 * Ear-tip anchors in frame coordinates, matching the typing pose baked in
 * gen-sprites.mjs (ears at x 22/42, apex y 5 at TYPING_DY = -1).
 */
export const STEAM_EARS: ReadonlyArray<readonly [number, number]> = [
  [22, 5],
  [42, 5],
]

/**
 * Same bound as idle.ts: one rAF step can span an occlusion gap or machine
 * sleep. Clamping keeps a gap from aging puffs by hours — they simply die —
 * and stops the emit accumulator from releasing a catch-up burst.
 */
const MAX_DT_MS = 1000

export interface SteamParticle {
  x: number
  y: number
  /** Lateral wobble assigned at spawn, source px/ms. */
  vx: number
  age: number
}

export interface SteamAnim {
  particles: SteamParticle[]
  /** ms since the last puff; starts "due" so overheat entry puffs at once. */
  sinceEmit: number
  /** Index into STEAM_EARS for the next puff. */
  nextEar: number
}

export type Random = () => number

export function createSteamAnim(): SteamAnim {
  return { particles: [], sinceEmit: STEAM_EMIT_MS, nextEar: 0 }
}

/**
 * Advances `anim` by `dtMs` in place. Existing puffs rise and age out whether
 * or not `emitting` — overheat exit must dissipate in-flight steam, not
 * freeze or leak it.
 */
export function tickSteam(
  anim: SteamAnim,
  dtMs: number,
  emitting: boolean,
  rand: Random = Math.random,
): void {
  const dt = Math.min(Math.max(dtMs, 0), MAX_DT_MS)

  for (const p of anim.particles) {
    p.age += dt
    p.x += p.vx * dt
    p.y += RISE_PX_PER_MS * dt
  }
  anim.particles = anim.particles.filter((p) => p.age < STEAM_LIFETIME_MS)

  if (!emitting) return
  anim.sinceEmit += dt
  if (anim.sinceEmit >= STEAM_EMIT_MS) {
    anim.sinceEmit = 0
    const [x, y] = STEAM_EARS[anim.nextEar]!
    anim.particles.push({ x, y, vx: (rand() - 0.5) * 0.008, age: 0 })
    anim.nextEar = (anim.nextEar + 1) % STEAM_EARS.length
  }
}

/** Sheet frame for a puff: 0 small → 2 large, clamped so the last frame holds. */
export function steamFrameIndex(p: SteamParticle): number {
  return Math.min(Math.floor(p.age / STEAM_FRAME_MS), 2)
}

/** Linear fade over the lifetime, on top of the sheet's baked-in falloff. */
export function steamAlpha(p: SteamParticle): number {
  return Math.max(1 - p.age / STEAM_LIFETIME_MS, 0)
}
