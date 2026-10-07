import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createTracker,
  KPS_WINDOW_MS,
  recordCursor,
  recordKey,
  sameState,
  snapshot,
} from './input-state.ts'

test('kps counts keys inside the rolling window', () => {
  const t = createTracker()
  for (const at of [1000, 1200, 1400]) recordKey(t, at)
  assert.equal(snapshot(t, 1500).kps, 3)
})

test('kps drops to 0 one second after the last keystroke', () => {
  const t = createTracker()
  recordKey(t, 1000)
  assert.equal(snapshot(t, 1000 + KPS_WINDOW_MS - 1).kps, 1, 'still typing just under 1s')
  assert.equal(snapshot(t, 1000 + KPS_WINDOW_MS).kps, 0, 'idle at exactly 1s')
})

test('the window slides rather than resetting', () => {
  const t = createTracker()
  recordKey(t, 1000)
  recordKey(t, 1900)
  // At 2000 the first stamp has aged out but the second has not.
  assert.equal(snapshot(t, 2000).kps, 1)
})

test('sides alternate and the first strike is left', () => {
  const t = createTracker()
  const sides: string[] = []
  for (let i = 0; i < 4; i++) {
    recordKey(t, 1000 + i * 10)
    sides.push(snapshot(t, 1000 + i * 10).lastKeyside)
  }
  assert.deepEqual(sides, ['left', 'right', 'left', 'right'])
})

test('side persists after the window empties', () => {
  const t = createTracker()
  recordKey(t, 1000)
  const idle = snapshot(t, 5000)
  assert.equal(idle.kps, 0)
  assert.equal(idle.lastKeyside, 'left', 'no phantom flip while idle')
  recordKey(t, 5000)
  assert.equal(snapshot(t, 5000).lastKeyside, 'right', 'next strike continues alternating')
})

test('cursor position rides along in the snapshot', () => {
  const t = createTracker()
  recordCursor(t, 640, 480)
  assert.deepEqual(
    { x: snapshot(t, 0).cursorX, y: snapshot(t, 0).cursorY },
    { x: 640, y: 480 },
  )
})

test('sameState suppresses redundant sends but not real changes', () => {
  const t = createTracker()
  recordKey(t, 1000)
  const a = snapshot(t, 1010)
  assert.ok(sameState(a, snapshot(t, 1020)), 'quiet tick is identical')
  recordCursor(t, 5, 5)
  assert.ok(!sameState(a, snapshot(t, 1030)), 'cursor move is a change')
  assert.ok(!sameState(a, snapshot(t, 3000)), 'window emptying is a change')
})

test('keySeq counts every keystroke monotonically', () => {
  const t = createTracker()
  assert.equal(snapshot(t, 0).keySeq, 0)
  for (const at of [1000, 1010, 1020]) recordKey(t, at)
  assert.equal(snapshot(t, 1020).keySeq, 3)
  // Survives the window draining: it is a session total, not a window count.
  assert.equal(snapshot(t, 9000).kps, 0)
  assert.equal(snapshot(t, 9000).keySeq, 3)
})

test('sameState sees keys arriving as an equal number age out', () => {
  // kps flat and side flipped twice back to itself — only keySeq reveals it.
  const t = createTracker()
  recordKey(t, 0)
  recordKey(t, 1)
  const before = snapshot(t, 500)
  recordKey(t, 1000)
  recordKey(t, 1001)
  const after = snapshot(t, 1001)
  assert.equal(before.kps, after.kps, 'kps really is unchanged')
  assert.equal(before.lastKeyside, after.lastKeyside, 'side really is unchanged')
  assert.ok(!sameState(before, after), 'and it is still reported as a change')
})
