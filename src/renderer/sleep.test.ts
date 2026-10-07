import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createSleepAnim,
  createZzzAnim,
  fallAsleep,
  LOOP_FRAME_MS,
  sleepFrame,
  SLEEP_AFTER_MS,
  startWake,
  tickSleep,
  tickZzz,
  TRANSITION_FRAME_MS,
  TRANSITION_FRAMES,
  WAKE_FRAME_MS,
  ZZZ_COUNT,
  ZZZ_LIFETIME_MS,
  ZZZ_ORIGIN,
  ZZZ_RISE_PX,
  ZZZ_WOBBLE_AMPLITUDE,
  zzzGlyphs,
} from './sleep.ts'

/**
 * Steps time forward in 100ms slices. tickSleep/tickZzz clamp a single step
 * to 1s (the occlusion-gap bound), so tests must not hand them more.
 */
function run(ms: number, tick: (dt: number) => void): void {
  for (let t = 0; t < ms; t += 100) tick(100)
}

/** Hands the settle off to the loop without tripping the dt clamp. */
function settleIntoLoop(anim: ReturnType<typeof createSleepAnim>): void {
  fallAsleep(anim)
  run(TRANSITION_FRAMES * TRANSITION_FRAME_MS, (dt) => tickSleep(anim, dt))
}

test('the settle transition plays each frame once at 2.5 FPS, then hands off to the loop', () => {
  const anim = createSleepAnim()
  fallAsleep(anim)
  const seen: number[] = []
  for (let t = 0; t < TRANSITION_FRAMES * TRANSITION_FRAME_MS; t += TRANSITION_FRAME_MS) {
    seen.push(sleepFrame(anim))
    tickSleep(anim, TRANSITION_FRAME_MS)
  }
  assert.deepEqual(seen, [0, 1, 2, 3])
  assert.equal(anim.phase, 'loop', 'transition ends in the sleep loop')
})

test('the sleep loop alternates two frames at ~1 FPS and never leaves on its own', () => {
  const anim = createSleepAnim()
  settleIntoLoop(anim)
  const seen: number[] = []
  for (let t = 0; t < 5000; t += LOOP_FRAME_MS) {
    seen.push(sleepFrame(anim))
    tickSleep(anim, LOOP_FRAME_MS)
  }
  assert.deepEqual(seen, [0, 1, 0, 1, 0])
  assert.equal(anim.phase, 'loop')
})

test('wake plays the last two transition frames reversed, quickly, then ends awake', () => {
  const anim = createSleepAnim()
  settleIntoLoop(anim)
  assert.equal(anim.phase, 'loop')

  startWake(anim)
  const seen: number[] = []
  for (let t = 0; t < 2 * WAKE_FRAME_MS; t += WAKE_FRAME_MS) {
    seen.push(sleepFrame(anim))
    tickSleep(anim, WAKE_FRAME_MS)
  }
  assert.deepEqual(seen, [3, 2], 'curled → head-up, the reverse of the settle tail')
  assert.equal(anim.phase, null, 'awake again — idle or typing takes over')
})

test('a keystroke during the settle cuts straight to the wake', () => {
  const anim = createSleepAnim()
  fallAsleep(anim)
  tickSleep(anim, TRANSITION_FRAME_MS)
  startWake(anim)
  assert.equal(anim.phase, 'wake')
  assert.equal(sleepFrame(anim), 3)
})

test('a multi-hour stall is clamped instead of fast-forwarding', () => {
  const anim = createSleepAnim()
  fallAsleep(anim)
  tickSleep(anim, 6 * 60 * 60 * 1000)
  // A single huge step advances at most the 1s clamp — not the whole settle.
  assert.equal(anim.phase, 'transition')
  assert.equal(anim.elapsed, 1000)
  tickSleep(anim, 1000)
  assert.equal(anim.phase, 'loop', 'the settle still finishes on the next step')
  assert.ok(anim.elapsed < LOOP_FRAME_MS)
})

test('SLEEP_AFTER_MS is the specified 3 minutes', () => {
  assert.equal(SLEEP_AFTER_MS, 180_000)
})

test('Zzz glyphs rise, fade and grow over their lifetime', () => {
  const anim = createZzzAnim()
  const start = zzzGlyphs(anim)
  run(ZZZ_LIFETIME_MS * 0.9, (dt) => tickZzz(anim, dt))
  const late = zzzGlyphs(anim)

  // Glyph 0 starts at age 0, so 0.9 lifetimes cannot wrap it.
  assert.ok(late[0]!.y < start[0]!.y, 'glyph 0 floats upward')
  assert.ok(late[0]!.alpha < start[0]!.alpha, 'glyph 0 fades as it rises')
  assert.ok(late[0]!.size > start[0]!.size, 'glyph 0 grows as it rises')
  assert.ok(late[0]!.y < ZZZ_ORIGIN.y - ZZZ_RISE_PX * 0.8, 'most of the rise has happened')
  // The staggered glyphs may wrap mid-window; the field's top still rises.
  assert.ok(
    Math.min(...late.map((g) => g.y)) < Math.min(...start.map((g) => g.y)),
    'the highest glyph ends higher than the field started',
  )
})

test('Zzz wobble stays inside the amplitude and actually oscillates', () => {
  const anim = createZzzAnim()
  const xs: number[] = []
  for (let t = 0; t <= ZZZ_LIFETIME_MS; t += 100) {
    xs.push(zzzGlyphs(anim)[0]!.x)
    tickZzz(anim, 100)
  }
  assert.ok(
    xs.every((x) => Math.abs(x - ZZZ_ORIGIN.x) <= ZZZ_WOBBLE_AMPLITUDE),
    'wobble never exceeds the amplitude',
  )
  assert.ok(new Set(xs.map((x) => Math.round(x))).size > 3, 'x actually moves')
})

test('the Zzz field resets continuously — glyph 0 wraps back to full opacity', () => {
  const anim = createZzzAnim()
  run(ZZZ_LIFETIME_MS - 100, (dt) => tickZzz(anim, dt))
  tickZzz(anim, 99)
  assert.ok(zzzGlyphs(anim)[0]!.alpha < 0.01, 'faded out at end of life')
  tickZzz(anim, 2) // past the lifetime: wraps, not clamps
  assert.ok(zzzGlyphs(anim)[0]!.alpha > 0.99, 'reborn at the origin')
})

test('Zzz glyphs are staggered, not in lockstep', () => {
  const anim = createZzzAnim()
  const glyphs = zzzGlyphs(anim)
  const alphas = glyphs.map((g) => g.alpha)
  assert.notDeepEqual(alphas, [alphas[0], alphas[0], alphas[0]])
})
