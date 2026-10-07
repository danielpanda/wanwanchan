import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSkinOption, SKIN_CHANNEL, SKIN_MENU, skinSubmenu, type SkinOption } from './skins.ts'

test('SKIN_CHANNEL is non-empty string', () => {
  assert.equal(typeof SKIN_CHANNEL, 'string')
  assert.ok(SKIN_CHANNEL.length > 0)
})

test('isSkinOption accepts agumon, rejects removed and unknown strings', () => {
  assert.ok(isSkinOption('agumon'))
  assert.ok(!isSkinOption('frenchie'))
  assert.ok(!isSkinOption('tetsu'))
  assert.ok(!isSkinOption('pikachu'))
  assert.ok(!isSkinOption(''))
  assert.ok(!isSkinOption(null))
  assert.ok(!isSkinOption(undefined))
})

test('SKIN_MENU contains agumon only', () => {
  const skins = SKIN_MENU.map((m) => m.skin)
  assert.deepEqual(skins, ['agumon'])
})

test('skinSubmenu builds radio items with current selection checked and click working', () => {
  let picked: SkinOption | null = null
  const items = skinSubmenu('agumon', (skin) => {
    picked = skin
  })

  assert.equal(items.length, 1)
  assert.equal(items[0].checked, true)
  assert.equal(items[0].type, 'radio')

  const agumonItem = items[0]
  assert.equal(typeof agumonItem.click, 'function')
  agumonItem.click?.({} as any, {} as any, {} as any)
  assert.equal(picked, 'agumon')
})
