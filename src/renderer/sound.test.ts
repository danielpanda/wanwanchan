import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configureSound, getSoundConfig, playPurr, playHappyHop, playReminderChime, playWaterBubble, playStretchSlide } from './sound.ts'

test('configureSound clamps volume and updates enabled state', () => {
  configureSound({ enabled: false, volume: 1.5 })
  assert.equal(getSoundConfig().enabled, false)
  assert.equal(getSoundConfig().volume, 1.0)

  configureSound({ enabled: true, volume: -0.2 })
  assert.equal(getSoundConfig().enabled, true)
  assert.equal(getSoundConfig().volume, 0)

  configureSound({ volume: 0.8 })
  assert.equal(getSoundConfig().volume, 0.8)
})

test('sound functions safely no-op in headless environment without window.AudioContext', () => {
  assert.doesNotThrow(() => {
    playPurr()
    playHappyHop()
    playReminderChime()
    playWaterBubble()
    playStretchSlide()
  })
})
