import assert from 'node:assert/strict'
import { test } from 'node:test'
import { expressionFrame, selectPose, type Expression, type PoseInput } from './pose.ts'

const ALL = new Set<Expression>(['happy', 'laugh', 'confused'])
const base: PoseInput = {
  sleepPhase: null,
  isTyping: false,
  overheated: false,
  isPetting: false,
  agentStatus: 'idle',
  expressions: ALL,
}
const pose = (o: Partial<PoseInput>) => selectPose({ ...base, ...o })

test('priority: sleep > overheat > laugh > happy > confused > typing/idle', () => {
  const all = { isTyping: true, overheated: true, isPetting: true, agentStatus: 'done' as const }
  assert.equal(pose({ ...all, sleepPhase: 'loop' }), 'sleep')
  assert.equal(pose({ ...all, sleepPhase: 'wake' }), 'sleepTransition')
  assert.equal(pose(all), 'overheat')
  assert.equal(pose({ ...all, overheated: false }), 'laugh')
  assert.equal(pose({ ...all, overheated: false, isPetting: false }), 'happy')
  assert.equal(pose({ isTyping: true, agentStatus: 'thinking' }), 'confused')
  assert.equal(pose({ isTyping: true }), 'typing')
  assert.equal(pose({}), 'idle')
})

test('skins without expression sheets fall back to base poses', () => {
  const none = new Set<Expression>()
  assert.equal(pose({ expressions: none, isPetting: true }), 'idle')
  assert.equal(pose({ expressions: none, agentStatus: 'done', isTyping: true }), 'typing')
  assert.equal(pose({ expressions: none, agentStatus: 'thinking' }), 'idle')
  // a partial set only overrides what it has
  assert.equal(pose({ expressions: new Set(['happy']), isPetting: true, agentStatus: 'done' }), 'happy')
})

test('expression frames alternate every 400ms', () => {
  assert.deepEqual([0, 399, 400, 799, 800].map(expressionFrame), [0, 0, 1, 1, 0])
})
