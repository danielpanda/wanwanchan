import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPettingState, getHeadBounds, isInsideHead, tickPetting } from './petting.ts'

test('getHeadBounds maps within sprite frame', () => {
  const bounds = getHeadBounds(100, 50, 192, 3)
  assert.equal(bounds.minX, 100 + 14 * 3)
  assert.equal(bounds.maxX, 100 + 50 * 3)
  assert.equal(bounds.minY, 50 + 8 * 3)
  assert.equal(bounds.maxY, 50 + 36 * 3)

  assert.equal(isInsideHead(bounds, bounds.minX + 10, bounds.minY + 10), true)
  assert.equal(isInsideHead(bounds, bounds.minX - 10, bounds.minY + 10), false)
})

test('tickPetting detects back-and-forth rubbing and triggers purr', () => {
  const state = createPettingState()
  const bounds = getHeadBounds(0, 0, 192, 3) // minX: 42, maxX: 150, minY: 24, maxY: 108

  let purrCount = 0
  const onPurr = () => {
    purrCount++
  }

  let now = 1000
  // Stroke right
  tickPetting(state, 50, 50, bounds, 16, now, onPurr)
  now += 50
  tickPetting(state, 70, 50, bounds, 16, now, onPurr)

  // Reverse left
  now += 50
  tickPetting(state, 55, 50, bounds, 16, now, onPurr)

  // Reverse right again
  now += 50
  tickPetting(state, 75, 50, bounds, 16, now, onPurr)

  assert.equal(state.isPetting, true)
  assert.ok(purrCount >= 1, 'Purr sound triggered')
})

test('tickPetting decays when cursor leaves or stops moving', () => {
  const state = createPettingState()
  state.level = 0.8
  state.isPetting = true
  state.lastStrokeAt = 1000

  const bounds = getHeadBounds(0, 0, 192, 3)
  // After 2 seconds with no motion
  tickPetting(state, 0, 0, bounds, 1000, 3000)

  assert.ok(state.level < 0.3)
  assert.equal(state.isPetting, false)
})
