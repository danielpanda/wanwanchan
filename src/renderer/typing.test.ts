import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { InputState } from '../main/input-state.ts'
import {
  createTypingAnim,
  isNewStrike,
  strike,
  STRIKE_MS,
  tickTyping,
  typingFrame,
} from './typing.ts'

const state = (kps: number, lastKeyside: 'left' | 'right', keySeq = kps): InputState => ({
  kps,
  cursorX: 0,
  cursorY: 0,
  lastKeyside,
  keySeq,
})

test('a struck paw shows its frame immediately and releases after STRIKE_MS', () => {
  const anim = createTypingAnim()
  assert.equal(typingFrame(anim), 0, 'starts neutral')

  strike(anim, 'left')
  assert.equal(typingFrame(anim), 1, 'left paw down on the same frame as the keystroke')

  tickTyping(anim, STRIKE_MS - 1)
  assert.equal(typingFrame(anim), 1, 'still down just before the hold expires')

  tickTyping(anim, 1)
  assert.equal(typingFrame(anim), 0, 'back to neutral once the hold expires')
})

test('sides map to distinct frames', () => {
  const anim = createTypingAnim()
  strike(anim, 'right')
  assert.equal(typingFrame(anim), 2)
})

test('a strike mid-hold restarts the hold on the new side', () => {
  const anim = createTypingAnim()
  strike(anim, 'left')
  tickTyping(anim, STRIKE_MS - 10)
  strike(anim, 'right')
  tickTyping(anim, 20)
  assert.equal(typingFrame(anim), 2, 'the new strike is not cut short by the old hold')
})

test('isNewStrike fires on a keySeq rise', () => {
  assert.ok(isNewStrike(state(1, 'left', 1), state(2, 'right', 2)))
})

test('isNewStrike fires when two keys in one tick flip the side back', () => {
  // Side went left→right→left, i.e. unchanged, but two keys were struck.
  assert.ok(isNewStrike(state(1, 'left', 1), state(3, 'left', 3)))
})

test('isNewStrike fires when keys arrive as many others age out', () => {
  // The case kps+lastKeyside cannot see: 2 in, 2 out, side flipped twice.
  // kps is flat and the side is back to its old value — only keySeq moved.
  assert.ok(isNewStrike(state(2, 'right', 2), state(2, 'right', 4)))
})

test('isNewStrike ignores a quiet tick and the idle window drain', () => {
  const typing = state(3, 'left', 3)
  assert.ok(!isNewStrike(typing, state(3, 'left', 3)), 'nothing happened')
  assert.ok(!isNewStrike(typing, state(1, 'left', 3)), 'stamps aging out is not a keystroke')
  assert.ok(!isNewStrike(typing, state(0, 'left', 3)), 'window empty is not a keystroke')
})

test('isNewStrike treats the first typing snapshot as a strike', () => {
  assert.ok(isNewStrike(null, state(1, 'left', 1)))
  assert.ok(!isNewStrike(null, state(0, 'right', 0)), 'first snapshot while idle is not')
})
