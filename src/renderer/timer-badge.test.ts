import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createTimerBadgeState,
  formatTime,
  hitTestTimerBadge,
  skipPomodoroPhase,
  startPomodoro,
  stopPomodoro,
  tickTimerBadge,
  togglePausePomodoro,
} from './timer-badge.ts'

test('formatTime formats seconds into MM:SS', () => {
  assert.equal(formatTime(1500), '25:00')
  assert.equal(formatTime(65), '01:05')
  assert.equal(formatTime(9), '00:09')
  assert.equal(formatTime(0), '00:00')
})

test('startPomodoro and tickTimerBadge advance time and trigger phase transitions', () => {
  const state = createTimerBadgeState()
  startPomodoro(state, 1, 1) // 1 min focus, 1 min break

  assert.equal(state.mode, 'focus')
  assert.equal(state.remainingSec, 60)

  // Advance 59 seconds
  tickTimerBadge(state, 59000)
  assert.equal(state.remainingSec, 1)
  assert.equal(state.mode, 'focus')

  let completedPhase = ''
  // Advance 2 seconds to cross the boundary
  tickTimerBadge(state, 2000, (p) => {
    completedPhase = p
  })

  assert.equal(completedPhase, 'focus')
  assert.equal(state.mode, 'break')
  assert.equal(state.remainingSec, 60)
})

test('togglePausePomodoro and skipPomodoroPhase work correctly', () => {
  const state = createTimerBadgeState()
  startPomodoro(state, 25, 5)

  assert.equal(togglePausePomodoro(state), true)
  assert.equal(state.paused, true)

  // When paused, ticking does not decrease time
  tickTimerBadge(state, 5000)
  assert.equal(state.remainingSec, 25 * 60)

  skipPomodoroPhase(state)
  assert.equal(state.mode, 'break')
  assert.equal(state.remainingSec, 5 * 60)

  stopPomodoro(state)
  assert.equal(state.mode, 'idle')
})

test('hitTestTimerBadge detects bounds click', () => {
  const state = createTimerBadgeState()
  state.mode = 'focus'
  state.bounds = { x: 50, y: 30, w: 80, h: 20 }

  assert.equal(hitTestTimerBadge(state, 60, 35), true)
  assert.equal(hitTestTimerBadge(state, 10, 10), false)
})
