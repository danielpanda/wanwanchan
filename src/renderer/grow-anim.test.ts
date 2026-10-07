import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGrowAnimState, dismissGrowAnim, tickGrowAnim, triggerGrowAnim } from './grow-anim.ts'

test('triggerGrowAnim scales up to maxScale and enters holding phase', () => {
  const state = createGrowAnimState()
  triggerGrowAnim(state, 'stretch', 1000)

  assert.equal(state.phase, 'growing')
  assert.equal(state.kind, 'stretch')

  // Advance past grow duration (450ms)
  tickGrowAnim(state, 500)
  assert.equal(state.phase, 'holding')
  assert.ok(state.scaleX >= 1.4)
})

test('dismissGrowAnim transitions to shrinking and returns to idle', () => {
  const state = createGrowAnimState()
  triggerGrowAnim(state, 'water', 5000)
  tickGrowAnim(state, 500) // now holding

  dismissGrowAnim(state)
  assert.equal(state.phase, 'shrinking')

  // Advance past shrink duration (400ms)
  tickGrowAnim(state, 500)
  assert.equal(state.phase, 'idle')
  assert.equal(state.scaleX, 1)
  assert.equal(state.scaleY, 1)
})
