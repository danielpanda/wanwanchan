import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createDrag,
  dragFrame,
  dragTransform,
  DIZZY_BUBBLE_TEXT,
  DIZZY_MS,
  dizzyBubble,
  FALL_MS,
  LIFT_MS,
  SQUASH_MS,
  springLimits,
  tickDrag,
  type DragState,
} from './drag.ts'

const STEP = 16

/** Advance a state held at a fixed cursor speed (px/ms) for `ms`. */
function run(d: DragState, ms: number, speed: { vx?: number; vy?: number } = {}): void {
  const { vx = 0, vy = 0 } = speed
  let x = 0
  let y = 0
  const steps = Math.ceil(ms / STEP)
  for (let i = 0; i < steps; i++) {
    x += vx * STEP
    y += vy * STEP
    tickDrag(d, { held: d.holding, cursorX: x, cursorY: y, dtMs: STEP })
  }
}

test('phase timeline: lift → held → fall → squash → dizzy → idle', () => {
  const d = createDrag()
  tickDrag(d, { held: true, cursorX: 0, cursorY: 0, dtMs: STEP })
  assert.equal(d.phase, 'lift')
  run(d, LIFT_MS)
  assert.equal(d.phase, 'held')
  run(d, 500)
  assert.equal(d.phase, 'held')
  tickDrag(d, { held: false, cursorX: 0, cursorY: 0, dtMs: STEP })
  assert.equal(d.phase, 'fall')
  run(d, FALL_MS)
  assert.equal(d.phase, 'squash')
  run(d, SQUASH_MS)
  assert.equal(d.phase, 'dizzy')
  run(d, DIZZY_MS)
  assert.equal(d.phase, 'idle')
})

test('logical frames map to lift/held/swing/flail/fall/squash/dizzy', () => {
  const d = createDrag()
  const frame = (): number => dragFrame(d)

  tickDrag(d, { held: true, cursorX: 0, cursorY: 0, dtMs: STEP })
  assert.equal(frame(), 2) // lift
  run(d, LIFT_MS)
  assert.equal(frame(), 3) // held at rest

  run(d, 200, { vx: 1 }) // moving right → body trails left → 4
  assert.equal(frame(), 4)
  run(d, 200, { vx: -1 }) // moving left → body trails right → 6
  assert.equal(frame(), 6)

  // Three reversals within the window set shook → 5 regardless of direction.
  for (let i = 0; i < 3; i++) {
    run(d, 150, { vx: 1 })
    run(d, 150, { vx: -1 })
  }
  assert.equal(d.shook, true)
  assert.equal(frame(), 5)

  tickDrag(d, { held: false, cursorX: 0, cursorY: 0, dtMs: STEP })
  assert.equal(frame(), 7) // fall
  run(d, FALL_MS)
  assert.equal(frame(), 8) // squash
  run(d, SQUASH_MS)
  assert.equal(frame(), 9) // dizzy
})

test('flail detection honors the 1s reversal window', () => {
  const d = createDrag()
  tickDrag(d, { held: true, cursorX: 0, cursorY: 0, dtMs: STEP })
  run(d, LIFT_MS)

  // Two reversals inside the window, then one after the window expires.
  run(d, 100, { vx: 1 })
  run(d, 100, { vx: -1 })
  run(d, 1100) // > REVERSAL_WINDOW_MS gap: velocity decays, swing resets
  run(d, 100, { vx: 1 }) // swing 1 (from 0 — no reversal counted)
  run(d, 100, { vx: -1 }) // reversal 1 in the fresh window
  assert.equal(d.shook, false)

  // Two more reversals — the third within 1s flips it.
  run(d, 100, { vx: 1 }) // reversal 2
  run(d, 100, { vx: -1 }) // reversal 3
  assert.equal(d.shook, true)
})

test('spring clamps stretch to headroom and squash to side padding', () => {
  for (const size of ['small', 'normal', 'large'] as const) {
    const { maxStretch, minSquash } = springLimits(size)
    assert.ok(maxStretch <= 1.3, `${size}: maxStretch ${maxStretch} ≤ 1.3`)
    assert.ok(minSquash >= 1 / 1.3, `${size}: minSquash ${minSquash} ≥ 0.769`)
    assert.ok(maxStretch > 1 && minSquash < 1)
  }

  // A hard downward yank must never stretch past the headroom bound.
  const d = createDrag()
  const { maxStretch } = springLimits('normal')
  tickDrag(d, { held: true, cursorX: 0, cursorY: 0, dtMs: STEP })
  run(d, LIFT_MS)
  run(d, 400, { vy: 3 }) // 3 px/ms downward — far above anything a mouse does
  assert.ok(d.stretch <= maxStretch + 1e-6, `stretch ${d.stretch} ≤ ${maxStretch}`)
})

test('spring settles near rest with 2–3 visible overshoots after squash', () => {
  const d = createDrag()
  tickDrag(d, { held: true, cursorX: 0, cursorY: 0, dtMs: STEP })
  run(d, LIFT_MS + 300)
  tickDrag(d, { held: false, cursorX: 0, cursorY: 0, dtMs: STEP })
  run(d, FALL_MS + SQUASH_MS) // land in dizzy, spring released from squash

  const peaks: number[] = []
  let prevV = d.stretchV
  run(d, 40) // first release step
  for (let i = 0; i < 60; i++) {
    tickDrag(d, { held: false, cursorX: 0, cursorY: 0, dtMs: STEP })
    if (prevV > 0 && d.stretchV <= 0 && d.stretch > 1.01) peaks.push(d.stretch)
    prevV = d.stretchV
  }

  assert.ok(peaks.length >= 2 && peaks.length <= 4, `got ${peaks.length} overshoot peaks`)
  assert.ok(Math.abs(d.stretch - 1) < 0.02, `settles near 1 (got ${d.stretch})`)
})

test('transform is volume-preserving and lean stays within ~20°', () => {
  const d = createDrag()
  const { maxStretch } = springLimits('normal')
  const t = dragTransform(d)
  assert.ok(Math.abs(t.scaleX * t.stretchY - 1) < 1e-9)

  // Hold at a fast lateral speed: lean tracks opposite the motion, bounded.
  tickDrag(d, { held: true, cursorX: 0, cursorY: 0, dtMs: STEP })
  run(d, LIFT_MS + 400, { vx: 2 })
  const t2 = dragTransform(d)
  assert.ok(t2.leanRad < 0, 'lean is opposite positive motion')
  assert.ok(t2.leanRad >= -0.36, 'lean ≥ -20°')
  assert.ok(Math.abs(t2.scaleX * t2.stretchY - 1) < 1e-9)
})

test('tickDrag reports each phase it enters once: squash on landing, nothing while held', () => {
  const d = createDrag()
  const entered: (string | null)[] = []
  const tick = (held: boolean, ms: number): void => {
    for (let i = 0; i < Math.ceil(ms / STEP); i++) {
      const e = tickDrag(d, { held, cursorX: 0, cursorY: 0, dtMs: STEP })
      if (e) entered.push(e)
    }
  }
  tick(true, LIFT_MS + 300)
  assert.deepEqual(entered, ['lift', 'held'])
  tick(false, FALL_MS + SQUASH_MS + DIZZY_MS + 100)
  assert.deepEqual(entered, ['lift', 'held', 'fall', 'squash', 'dizzy', 'idle'])
})

test('dizzy bubble needs shook + a name, and respects the 30% roll', () => {
  assert.equal(DIZZY_BUBBLE_TEXT, '@_@ wheee~')
  assert.equal(dizzyBubble(true, 'Ana', () => 0.29), true)
  assert.equal(dizzyBubble(true, 'Ana', () => 0.3), false)
  assert.equal(dizzyBubble(true, '', () => 0), false)
  assert.equal(dizzyBubble(false, 'Ana', () => 0), false)
})

test('shook is still set when dizzy is entered', () => {
  const d = createDrag()
  tickDrag(d, { held: true, cursorX: 0, cursorY: 0, dtMs: STEP })
  run(d, LIFT_MS)
  for (let i = 0; i < 3; i++) {
    run(d, 150, { vx: 1 })
    run(d, 150, { vx: -1 })
  }
  tickDrag(d, { held: false, cursorX: 0, cursorY: 0, dtMs: STEP })
  let entered = null
  while (entered !== 'dizzy') entered = tickDrag(d, { held: false, cursorX: 0, cursorY: 0, dtMs: STEP })
  assert.equal(d.shook, true)
})

test('fall drops a few px and eases back out', () => {
  const d = createDrag()
  tickDrag(d, { held: true, cursorX: 0, cursorY: 0, dtMs: STEP })
  run(d, LIFT_MS + 200)
  tickDrag(d, { held: false, cursorX: 0, cursorY: 0, dtMs: STEP })
  assert.ok(d.dropPx > 0, 'drop present at release')
  run(d, 400)
  assert.ok(d.dropPx < 1, 'drop eased back out')
})
