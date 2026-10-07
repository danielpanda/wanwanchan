import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createPupilOffset,
  getEyeAnchors,
  PUPIL_MAX_OFFSET,
  PUPIL_SMOOTH_MS,
  pupilTarget,
  tickPupils,
} from './eyes.ts'

// Window rect used throughout: origin (100, 200), 280x260 like the real one.
const W = { x: 100, y: 200, w: 280, h: 260 }

test('the gaze points at the cursor in each direction', () => {
  // Far right of center: pure +x; far below: pure +y.
  const right = pupilTarget(1000, 330, W.x, W.y, W.w, W.h)
  assert.ok(Math.abs(right.x - PUPIL_MAX_OFFSET) < 1e-9 && Math.abs(right.y) < 1e-9)
  const down = pupilTarget(240, 1000, W.x, W.y, W.w, W.h)
  assert.ok(Math.abs(down.x) < 1e-9 && Math.abs(down.y - PUPIL_MAX_OFFSET) < 1e-9)
  // Above and left of the window: both components negative.
  const upLeft = pupilTarget(0, 0, W.x, W.y, W.w, W.h)
  assert.ok(upLeft.x < 0 && upLeft.y < 0)
})

test('the offset magnitude is the cap, so no axis can exceed PUPIL_MAX_OFFSET', () => {
  // A sweep of angles around the window center: every target lands exactly on
  // the cap circle, whose axis-aligned bound is PUPIL_MAX_OFFSET.
  for (let a = 0; a < 64; a++) {
    const cx = W.x + W.w / 2
    const cy = W.y + W.h / 2
    const t = pupilTarget(
      cx + Math.cos((a / 64) * Math.PI * 2) * 500,
      cy + Math.sin((a / 64) * Math.PI * 2) * 500,
      W.x,
      W.y,
      W.w,
      W.h,
    )
    assert.ok(Math.abs(t.x) <= PUPIL_MAX_OFFSET)
    assert.ok(Math.abs(t.y) <= PUPIL_MAX_OFFSET)
    assert.ok(Math.abs(Math.hypot(t.x, t.y) - PUPIL_MAX_OFFSET) < 1e-9)
  }
})

test('the cursor dead on the window center yields a zero-length angle, not NaN', () => {
  const t = pupilTarget(W.x + W.w / 2, W.y + W.h / 2, W.x, W.y, W.w, W.h)
  assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y))
})

test('smoothing covers a fraction of the gap per tick, never a snap', () => {
  const p = createPupilOffset()
  const target = { x: PUPIL_MAX_OFFSET, y: -PUPIL_MAX_OFFSET }
  tickPupils(p, target, PUPIL_SMOOTH_MS)
  // Exactly 1 - 1/e of the way after one half-time.
  assert.ok(Math.abs(p.x - PUPIL_MAX_OFFSET * (1 - Math.exp(-1))) < 1e-9)
  assert.ok(Math.abs(p.y + PUPIL_MAX_OFFSET * (1 - Math.exp(-1))) < 1e-9)
  assert.ok(p.x < target.x, 'did not jump to the target')
})

test('a zero-dt tick does not move the gaze', () => {
  const p = createPupilOffset()
  tickPupils(p, { x: PUPIL_MAX_OFFSET, y: PUPIL_MAX_OFFSET }, 0)
  assert.deepEqual(p, { x: 0, y: 0 })
})

test('the gaze converges monotonically without overshooting', () => {
  const p = createPupilOffset()
  const target = { x: -PUPIL_MAX_OFFSET, y: PUPIL_MAX_OFFSET }
  let prev = Math.abs(target.x)
  for (let i = 0; i < 200; i++) {
    tickPupils(p, target, 16)
    const distance = Math.abs(target.x - p.x)
    assert.ok(distance <= prev + 1e-12, 'distance to target never grows')
    prev = distance
    assert.ok(Math.abs(p.x) <= PUPIL_MAX_OFFSET + 1e-9)
    assert.ok(Math.abs(p.y) <= PUPIL_MAX_OFFSET + 1e-9)
  }
  assert.ok(prev < 0.01, 'essentially on target after 200 frames')
})

test('a new target in the opposite direction reverses smoothly', () => {
  const p = createPupilOffset()
  for (let i = 0; i < 100; i++) tickPupils(p, { x: PUPIL_MAX_OFFSET, y: 0 }, 16)
  assert.ok(p.x > PUPIL_MAX_OFFSET * 0.95)
  for (let i = 0; i < 100; i++) tickPupils(p, { x: -PUPIL_MAX_OFFSET, y: 0 }, 16)
  assert.ok(p.x < -PUPIL_MAX_OFFSET * 0.95)
})

test('getEyeAnchors returns agumon coordinates with fallback', () => {
  assert.deepEqual(getEyeAnchors('agumon'), [[29, 17]])
  assert.deepEqual(getEyeAnchors('unknown_skin'), [[25, 26], [39, 26]])
})
