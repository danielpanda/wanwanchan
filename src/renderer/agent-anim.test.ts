import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAgentAnimState, handleAgentPayload, tickAgentAnim, triggerHop } from './agent-anim.ts'

test('handleAgentPayload updates status and triggers hop on done', () => {
  const state = createAgentAnimState()
  let doneCount = 0
  handleAgentPayload(state, { status: 'thinking', agent: 'claude-code' }, () => {
    doneCount++
  })

  assert.equal(state.status, 'thinking')
  assert.equal(state.agentName, 'claude-code')
  assert.equal(state.hopActive, false)
  assert.equal(doneCount, 0)

  handleAgentPayload(state, { status: 'done' }, () => {
    doneCount++
  })
  assert.equal(state.status, 'done')
  assert.equal(state.hopActive, true)
  assert.equal(doneCount, 1)
})

test('tickAgentAnim simulates hop parabolic motion and returns to floor', () => {
  const state = createAgentAnimState()
  triggerHop(state)
  assert.equal(state.hopActive, true)
  assert.ok(state.hopVy < 0, 'Initial upwards velocity')

  // Tick physics
  tickAgentAnim(state, 100)
  assert.ok(state.hopDy < 0, 'Risen above floor')

  // Advance to completion
  tickAgentAnim(state, 1000)
  assert.equal(state.hopActive, false)
  assert.equal(state.hopDy, 0)
})

test('done status automatically resets to idle after timeout', () => {
  const state = createAgentAnimState()
  handleAgentPayload(state, { status: 'done' })
  assert.equal(state.status, 'done')

  let reset = false
  tickAgentAnim(state, 4500, () => {
    reset = true
  })
  assert.equal(state.status, 'idle')
  assert.equal(reset, true)
})

test('approval and error statuses trigger respective callbacks and auto-reset', () => {
  const state = createAgentAnimState()
  let approvalCalled = false
  let errorCalled = false

  handleAgentPayload(
    state,
    { status: 'approval', agent: 'claude-code' },
    {
      onApproval: () => {
        approvalCalled = true
      },
      onError: () => {
        errorCalled = true
      },
    },
  )
  assert.equal(state.status, 'approval')
  assert.equal(approvalCalled, true)
  assert.equal(errorCalled, false)

  handleAgentPayload(
    state,
    { status: 'error', agent: 'claude-code' },
    {
      onApproval: () => {
        approvalCalled = true
      },
      onError: () => {
        errorCalled = true
      },
    },
  )
  assert.equal(state.status, 'error')
  assert.equal(errorCalled, true)

  // Test error auto-reset
  let reset = false
  tickAgentAnim(state, 6000, () => {
    reset = true
  })
  assert.equal(state.status, 'idle')
  assert.equal(reset, true)
})
