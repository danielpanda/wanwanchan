import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SIZE_MENU } from './sizes.ts'
import { SKIN_MENU } from './skins.ts'
import { TRAY_LABELS } from './tray-labels.ts'

// Emoji: Extended_Pictographic base chars, plus ZWJ and variation selectors
// that carry the presentation of keycap/double-glyph emoji.
const EMOJI = /[\p{Extended_Pictographic}‍️]/u

function trayLabels(): string[] {
  return [
    TRAY_LABELS.header('active'),
    TRAY_LABELS.companionHub,
    TRAY_LABELS.grantAccessibility,
    TRAY_LABELS.clickThrough,
    TRAY_LABELS.size,
    TRAY_LABELS.skin,
    TRAY_LABELS.resetPosition,
    TRAY_LABELS.quit,
    ...SIZE_MENU.map((entry) => entry.label),
    ...SKIN_MENU.map((entry) => entry.label),
  ]
}

test('no tray menu label contains an emoji', () => {
  for (const label of trayLabels()) {
    assert.equal(EMOJI.test(label), false, `emoji in tray label: ${label}`)
  }
})
