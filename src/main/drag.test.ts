import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampDrag, spriteBox } from './drag.ts'

// Normal tier (scale 3): 280x260 window, 192px draw, 68px headroom.
const box = spriteBox(280, 260, 192, 68)

test('the sprite box is centered and offset by headroom', () => {
  assert.deepEqual(box, { offsetX: 44, offsetY: 68, size: 192 })
})

test('the pet hangs from the grab point when nothing clamps', () => {
  const wa = { x: 0, y: 0, width: 1920, height: 1080 }
  assert.deepEqual(
    clampDrag({ x: 800, y: 600 }, { x: 44, y: 68 }, box, wa),
    { x: 756, y: 532 },
  )
})

test('the sprite box is clamped to each edge of the work area', () => {
  const wa = { x: 100, y: 100, width: 500, height: 400 }
  // Top-left corner: the box pins its top-left to the work area's top-left.
  assert.deepEqual(clampDrag({ x: 0, y: 0 }, { x: 0, y: 0 }, box, wa), {
    x: 100 - box.offsetX,
    y: 100 - box.offsetY,
  })
  // Bottom-right corner: the box pins to the work area's bottom-right.
  assert.deepEqual(clampDrag({ x: 9999, y: 9999 }, { x: 0, y: 0 }, box, wa), {
    x: 100 + 500 - 192 - box.offsetX,
    y: 100 + 400 - 192 - box.offsetY,
  })
})

test('the sprite box stays on screen across a two-display layout', () => {
  // Secondary display to the left of the primary (negative x): cursor on its
  // far-left edge, grabbed off-center so the unclamped box would hang over.
  const secondary = { x: -1920, y: 0, width: 1920, height: 1080 }
  const grab = { x: 44, y: 68 }
  const pos = clampDrag({ x: -1920, y: 500 }, grab, box, secondary)
  const sx = pos.x + box.offsetX
  const sy = pos.y + box.offsetY
  assert.ok(sx >= secondary.x, 'left edge inside the display')
  assert.ok(sy >= secondary.y, 'top edge inside the display')
  assert.ok(sx + box.size <= secondary.x + secondary.width, 'right edge inside')
  assert.ok(sy + box.size <= secondary.y + secondary.height, 'bottom edge inside')
})
