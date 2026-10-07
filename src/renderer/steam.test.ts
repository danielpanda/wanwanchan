import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createSteamAnim,
  STEAM_EARS,
  STEAM_EMIT_MS,
  STEAM_LIFETIME_MS,
  steamAlpha,
  steamFrameIndex,
  tickSteam,
} from './steam.ts'

const rand = () => 0.5 // zero horizontal drift

test('the first overheat tick emits a puff from the left ear, then the right', () => {
  const anim = createSteamAnim()
  tickSteam(anim, 16, true, rand)
  assert.equal(anim.particles.length, 1, 'emits immediately on overheat entry')
  const [x, y] = STEAM_EARS[0]!
  assert.equal(anim.particles[0]!.x, x)
  assert.equal(anim.particles[0]!.y, y)

  tickSteam(anim, STEAM_EMIT_MS, true, rand)
  assert.equal(anim.particles.length, 2, 'next puff on the 300ms cadence')
  assert.equal(anim.particles[1]!.x, STEAM_EARS[1]![0], 'alternates ears')
})

test('no emission below the cadence and none while not overheated', () => {
  const anim = createSteamAnim()
  tickSteam(anim, 16, true, rand)
  tickSteam(anim, STEAM_EMIT_MS - 1, true, rand)
  assert.equal(anim.particles.length, 1, 'under 300ms since the last puff: none')

  tickSteam(anim, 16, false, rand)
  assert.equal(anim.particles.length, 1, 'not overheated: no new puffs')
})

test('puffs drift upward, age through frames and are removed — no accumulation', () => {
  const anim = createSteamAnim()
  tickSteam(anim, 16, true, rand)
  // Particles are mutated in place, so snapshot the spawn pose.
  const bornY = anim.particles[0]!.y

  tickSteam(anim, 100, false, rand)
  const risen = anim.particles[0]!
  assert.ok(risen.y < bornY, 'drifts up')
  assert.ok(steamAlpha(risen) < 1, 'fades out with age')

  tickSteam(anim, STEAM_LIFETIME_MS, false, rand)
  assert.ok(anim.particles.every((p) => steamAlpha(p) > 0), 'alive puffs stay fadeable')
  tickSteam(anim, 1, false, rand)
  assert.equal(anim.particles.length, 0, 'dead puffs are removed')
})

test('frame index walks the sheet and clamps to the last frame', () => {
  assert.equal(steamFrameIndex({ x: 0, y: 0, vx: 0, age: 0 }), 0)
  assert.equal(steamFrameIndex({ x: 0, y: 0, vx: 0, age: STEAM_LIFETIME_MS - 1 }), 2)
  assert.equal(steamFrameIndex({ x: 0, y: 0, vx: 0, age: STEAM_LIFETIME_MS }), 2)
})

test('a long occlusion gap emits at most one puff and reaps everything dead', () => {
  const anim = createSteamAnim()
  tickSteam(anim, 5000, true, rand)
  assert.ok(anim.particles.length <= 1, 'no catch-up burst')
  tickSteam(anim, 5000, false, rand)
  assert.equal(anim.particles.length, 0, 'gap-spanning puffs are not kept alive')
})
