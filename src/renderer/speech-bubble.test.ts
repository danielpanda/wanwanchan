import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSpeechBubble, hideSpeechBubble, showSpeechBubble, tickSpeechBubble } from './speech-bubble.ts'

test('createSpeechBubble initializes hidden', () => {
  const b = createSpeechBubble()
  assert.equal(b.visible, false)
  assert.equal(b.alpha, 0)
  assert.equal(b.text, '')
})

test('showSpeechBubble makes bubble visible with full opacity', () => {
  const b = createSpeechBubble()
  showSpeechBubble(b, 'Hello Aura!', 3000)
  assert.equal(b.visible, true)
  assert.equal(b.alpha, 1)
  assert.equal(b.text, 'Hello Aura!')
})

test('tickSpeechBubble fades out and hides after duration', () => {
  const b = createSpeechBubble()
  showSpeechBubble(b, 'Time to stretch!', 1000)

  // At 700ms, should be fading (< 400ms remaining)
  tickSpeechBubble(b, 700)
  assert.equal(b.visible, true)
  assert.ok(b.alpha < 1 && b.alpha > 0)

  // At 1100ms, should be hidden
  tickSpeechBubble(b, 400)
  assert.equal(b.visible, false)
  assert.equal(b.alpha, 0)
})

test('hideSpeechBubble immediately resets visibility', () => {
  const b = createSpeechBubble()
  showSpeechBubble(b, 'Test', 5000)
  hideSpeechBubble(b)
  assert.equal(b.visible, false)
  assert.equal(b.alpha, 0)
})
