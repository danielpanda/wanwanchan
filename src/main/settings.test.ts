import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DEFAULTS, loadSettings, sanitize, saveSettings } from './settings.ts'

test('sanitize fills defaults for absent or malformed input', () => {
  assert.deepEqual(sanitize(undefined), DEFAULTS)
  assert.deepEqual(sanitize('junk'), DEFAULTS)
  // Fractional or string coordinates are not positions.
  assert.deepEqual(sanitize({ position: { x: 1.5, y: 2 } }), DEFAULTS)
  assert.deepEqual(sanitize({ position: { x: '3', y: 4 } }), DEFAULTS)
})

test('sanitize keeps valid values, including negative multi-display coords', () => {
  const custom = {
    ...DEFAULTS,
    ghostMode: true,
    shortcut: 'Alt+G',
    position: { x: -100, y: 2048 },
    size: 'large' as const,
    skin: 'agumon' as const,
    userName: 'Aura',
    soundEnabled: false,
    soundVolume: 0.5,
    nativeNotifications: true,
    pomodoro: { enabled: true, focusMinutes: 50, breakMinutes: 10 },
    stretch: { enabled: true, intervalMinutes: 30 },
    water: { enabled: true, intervalMinutes: 45 },
    reminders: [{ id: '1', time: '14:00', message: 'Team Meeting', enabled: true }],
    aiServerPort: 4000,
  }
  assert.deepEqual(
    sanitize({
      ...custom,
      shortcut: ' Alt+G ',
      userName: '  Aura  ',
    }),
    custom,
  )
})

test('sanitize rejects unknown size tiers; the tier round-trips through disk', () => {
  assert.equal(sanitize({ size: 'enormous' }).size, 'normal')
  const dir = mkdtempSync(join(tmpdir(), 'wanwan-settings-'))
  saveSettings({ ...DEFAULTS, size: 'small' }, dir)
  assert.equal(loadSettings(dir).size, 'small')
})

test('sanitize rejects unknown skins; a skin round-trips through disk', () => {
  assert.equal(sanitize({ skin: 'pikachu' }).skin, 'agumon')
  assert.equal(sanitize({ skin: 'frenchie' }).skin, 'agumon')
  const dir = mkdtempSync(join(tmpdir(), 'wanwan-settings-'))
  saveSettings({ ...DEFAULTS, skin: 'agumon' }, dir)
  assert.equal(loadSettings(dir).skin, 'agumon')
})

test('sanitize clamps or defaults invalid timer and sound values', () => {
  const result = sanitize({
    soundVolume: 5, // out of range [0, 1]
    pomodoro: { focusMinutes: -10, breakMinutes: 500 },
    stretch: { intervalMinutes: 0 },
    water: { intervalMinutes: 'invalid' },
    aiServerPort: 80, // out of port range [1024, 65535]
  })
  assert.equal(result.soundVolume, DEFAULTS.soundVolume)
  assert.equal(result.pomodoro.focusMinutes, DEFAULTS.pomodoro.focusMinutes)
  assert.equal(result.pomodoro.breakMinutes, DEFAULTS.pomodoro.breakMinutes)
  assert.equal(result.stretch.intervalMinutes, DEFAULTS.stretch.intervalMinutes)
  assert.equal(result.water.intervalMinutes, DEFAULTS.water.intervalMinutes)
  assert.equal(result.aiServerPort, DEFAULTS.aiServerPort)
})

test('settings round-trip through disk; a corrupt file falls back to defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wanwan-settings-'))
  saveSettings({ ...DEFAULTS, ghostMode: true, position: { x: 3, y: 4 }, userName: 'Dev' }, dir)
  assert.deepEqual(loadSettings(dir), {
    ...DEFAULTS,
    ghostMode: true,
    position: { x: 3, y: 4 },
    userName: 'Dev',
  })
  writeFileSync(join(dir, 'settings.json'), '{not json')
  assert.deepEqual(loadSettings(dir), DEFAULTS)
})
