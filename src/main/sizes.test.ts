import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSizeOption, layoutFor, SCALES, SIZE_MENU, windowSizeFor } from './sizes.ts'

test('every size tier scales by an integer — non-integer factors would blur pixel art', () => {
  for (const scale of Object.values(SCALES)) assert.ok(Number.isInteger(scale))
})

test('normal reproduces the original constants (192px draw, 68px headroom, 280x260)', () => {
  assert.deepEqual(layoutFor('normal'), { scale: 3, drawSize: 192, headroom: 68 })
  assert.deepEqual(windowSizeFor('normal'), { width: 280, height: 260 })
})

test('window bounds always clear the sprite plus headroom, at every tier', () => {
  for (const { size } of SIZE_MENU) {
    const { drawSize, headroom } = layoutFor(size)
    const { width, height } = windowSizeFor(size)
    assert.ok(width > drawSize, `${size}: window wider than the sprite`)
    assert.equal(height, drawSize + headroom, `${size}: exact headroom above the sprite`)
    // Tiers are strictly ordered so the tray radio ladder matches reality.
    assert.ok(drawSize > 0 && headroom > 0)
  }
  assert.ok(layoutFor('small').drawSize < layoutFor('normal').drawSize)
  assert.ok(layoutFor('normal').drawSize < layoutFor('large').drawSize)
})

test('isSizeOption rejects anything the settings file might contain', () => {
  assert.ok(isSizeOption('small') && isSizeOption('normal') && isSizeOption('large'))
  assert.ok(!isSizeOption('huge') && !isSizeOption(130) && !isSizeOption(undefined))
})
