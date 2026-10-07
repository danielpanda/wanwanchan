// Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLINK_FRAME_MS,
  BLINK_MAX_MS,
  BLINK_MIN_MS,
  BREATH_FRAMES,
  BREATH_MS,
  createIdleAnim,
  FRAME_REOPEN,
  FRAME_SHUT,
  idleFrame,
  IDLE_FRAMES,
  tickIdle,
} from './idle.ts'

/** Steps the anim in 16ms slices, like a 60 FPS render loop. */
function run(anim: ReturnType<typeof createIdleAnim>, ms: number, rand = () => 0.5) {
  const frames: number[] = []
  for (let t = 0; t < ms; t += 16) {
    tickIdle(anim, 16, rand)
    frames.push(idleFrame(anim))
  }
  return frames
}

test('breathing cycles 0-1-2-3 on wall-clock time, not frame count', () => {
  const anim = createIdleAnim(() => 0.99) // blink pushed out to ~6s
  const seen: number[] = []
  for (let i = 0; i < 8; i++) {
    tickIdle(anim, BREATH_MS, () => 0.99)
    seen.push(idleFrame(anim))
  }
  assert.deepEqual(seen, [1, 2, 3, 0, 1, 2, 3, 0])
})

test('frame pacing is time-based, not step-count-based', () => {
  const slow = createIdleAnim(() => 0.99)
  const fast = createIdleAnim(() => 0.99)
  // Same elapsed time, very different step sizes: 8 x 125ms vs 1 x 1000ms.
  for (let i = 0; i < 8; i++) tickIdle(slow, 125, () => 0.99)
  tickIdle(fast, 1000, () => 0.99)
  assert.equal(slow.breathIndex, 2)
  assert.equal(fast.breathIndex, slow.breathIndex)
})

test('a multi-hour stall is clamped instead of replayed', () => {
  const anim = createIdleAnim(() => 0.99)
  tickIdle(anim, 6 * 60 * 60 * 1000, () => 0.99)
  assert.ok(anim.breathElapsed < BREATH_MS)
  assert.ok(anim.untilBlink > 0)
})

test('blink fires within every 3-6s window and holds ~2 frames', () => {
  const anim = createIdleAnim(() => 0)
  const frames = run(anim, BLINK_MIN_MS + 100, () => 0)
  const blinks = frames.filter((f) => f >= 4).length
  assert.ok(blinks > 0, 'blink never fired inside the minimum window')
  // ~220ms of blink at 16ms/step is 13-15 frames.
  assert.ok(blinks <= Math.ceil((BLINK_FRAME_MS * 2) / 16) + 1, `blink held too long: ${blinks}`)
})

test('blink interval always lands inside [3s, 6s]', () => {
  for (const r of [0, 0.5, 1]) {
    const anim = createIdleAnim(() => r)
    assert.ok(anim.untilBlink >= BLINK_MIN_MS && anim.untilBlink <= BLINK_MAX_MS)
  }
})

test('blink plays shut then reopening, then returns to breathing', () => {
  const anim = createIdleAnim(() => 0)
  anim.untilBlink = 0
  tickIdle(anim, 1, () => 0) // trip the blink
  assert.equal(idleFrame(anim), FRAME_SHUT)
  tickIdle(anim, BLINK_FRAME_MS, () => 0)
  assert.equal(idleFrame(anim), FRAME_REOPEN)
  tickIdle(anim, BLINK_FRAME_MS, () => 0)
  assert.ok(idleFrame(anim) < FRAME_SHUT, 'eyes stayed shut past the blink')
})

test('blink art follows the breathing pose it interrupts — no body pop', () => {
  // The chest keeps rising under a blink, so the shut/reopen art has to be the
  // variant baked at the current breath offset or the body jumps a pixel.
  for (let breath = 0; breath < BREATH_FRAMES; breath++) {
    const anim = createIdleAnim(() => 0)
    anim.breathIndex = breath
    anim.untilBlink = 0
    tickIdle(anim, 1, () => 0)
    assert.equal(idleFrame(anim), FRAME_SHUT + anim.breathIndex, `shut @breath ${breath}`)
    tickIdle(anim, BLINK_FRAME_MS, () => 0)
    assert.equal(idleFrame(anim), FRAME_REOPEN + anim.breathIndex, `reopen @breath ${breath}`)
  }
})

test('every frame idleFrame can return exists in the sheet', () => {
  const anim = createIdleAnim(() => 0)
  const frames = new Set(run(anim, 30_000, () => 0))
  for (const f of frames) assert.ok(f >= 0 && f < IDLE_FRAMES, `frame ${f} is off the sheet`)
})

test('no unbounded state growth over several simulated minutes', () => {
  const anim = createIdleAnim()
  run(anim, 5 * 60 * 1000)
  assert.ok(anim.breathElapsed >= 0 && anim.breathElapsed < BREATH_MS)
  assert.ok(anim.untilBlink > 0 && anim.untilBlink <= BLINK_MAX_MS)
  assert.ok(Object.keys(anim).length === 4)
})
