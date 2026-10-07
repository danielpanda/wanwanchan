import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createEvolutionAnim,
  dismissEvolution,
  evolutionActive,
  evolutionFrame,
  tickEvolution,
  triggerEvolution,
  EVOLUTION_FRAME_COUNT,
  EVOLUTION_HOLDS,
  FADE_MS,
} from './evolution.ts'

test('trigger starts the cutscene on frame 0', () => {
  const s = createEvolutionAnim()
  assert.equal(evolutionActive(s), false)
  triggerEvolution(s)
  assert.equal(evolutionActive(s), true)
  assert.equal(s.phase, 'playing')
  assert.equal(evolutionFrame(s), 0)
})

test('advances one frame per hold, in row-major order', () => {
  const s = createEvolutionAnim()
  triggerEvolution(s)
  for (let f = 0; f < EVOLUTION_FRAME_COUNT; f++) {
    assert.equal(evolutionFrame(s), f)
    tickEvolution(s, EVOLUTION_HOLDS[f])
  }
  assert.equal(s.phase, 'fading')
})

test('fade holds the last frame then returns to idle', () => {
  const s = createEvolutionAnim()
  triggerEvolution(s)
  for (const hold of EVOLUTION_HOLDS) tickEvolution(s, hold)
  assert.equal(s.phase, 'fading')
  assert.equal(evolutionFrame(s), EVOLUTION_FRAME_COUNT - 1)
  tickEvolution(s, FADE_MS)
  assert.equal(s.phase, 'idle')
  assert.equal(evolutionActive(s), false)
})

test('dismiss skips straight to fade', () => {
  const s = createEvolutionAnim()
  triggerEvolution(s)
  tickEvolution(s, EVOLUTION_HOLDS[0]) // now on the digitize frame
  dismissEvolution(s)
  assert.equal(s.phase, 'fading')
})

test('idle tick is a no-op', () => {
  const s = createEvolutionAnim()
  tickEvolution(s, 1000)
  assert.equal(s.phase, 'idle')
  assert.equal(evolutionFrame(s), 0)
})
