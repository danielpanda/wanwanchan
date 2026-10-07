// Composes an Art Source (assets/art-src/<skin>/) into the runtime sprite
// sheets (assets/sprites/<skin>/). Deterministic: same input, same bytes.
//   node scripts/compose-skin.mjs <skin>
//   node scripts/compose-skin.mjs --self-test
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { decodePng, encodePng } from './png.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 64
// ponytail: duplicated from src/renderer/idle.ts and typing.ts (node can't import .ts)
const BREATH_DY = [0, -1, -2, -1]
const TYPING_POSE_DY = -1
const SLEEP_SETTLE_DY = 2

/** Moves a frame vertically by dy px (negative = up); vacated rows go transparent. */
export function shift(frame, dy) {
  const out = new Uint8Array(frame.length)
  for (let y = 0; y < SIZE; y++) {
    const sy = y - dy
    if (sy < 0 || sy >= SIZE) continue
    out.set(frame.subarray(sy * SIZE * 4, (sy + 1) * SIZE * 4), y * SIZE * 4)
  }
  return out
}

/** Idle strip layout expected by idle.ts: bank-major, breath-minor. */
export function idleFrames(banks) {
  return banks.flatMap((bank) => BREATH_DY.map((dy) => shift(bank, dy)))
}

/** Fills each [x0,y0,x1,y1] rect (inclusive) with the pixel just above it. */
export function lidded(frame, rects) {
  const out = frame.slice()
  for (const [x0, y0, x1, y1] of rects) {
    for (let x = x0; x <= x1; x++) {
      const lid = frame.subarray(((y0 - 1) * SIZE + x) * 4, ((y0 - 1) * SIZE + x) * 4 + 4)
      for (let y = y0; y <= y1; y++) out.set(lid, (y * SIZE + x) * 4)
    }
  }
  return out
}

export function strip(frames) {
  const w = SIZE * frames.length
  const sheet = new Uint8Array(w * SIZE * 4)
  frames.forEach((f, i) => {
    for (let y = 0; y < SIZE; y++) {
      sheet.set(f.subarray(y * SIZE * 4, (y + 1) * SIZE * 4), (y * w + i * SIZE) * 4)
    }
  })
  return encodePng(w, SIZE, sheet)
}

/** Returns an error string, or null when the frame is usable. */
export function validate(frame, width, height, groundY) {
  if (width !== SIZE || height !== SIZE) return `must be ${SIZE}x${SIZE}, got ${width}x${height}`
  let lowest = -1
  for (let i = 0; i < SIZE * SIZE; i++) {
    const a = frame[i * 4 + 3]
    if (a !== 0 && a !== 255) return `semi-transparent pixel at ${i % SIZE},${Math.floor(i / SIZE)} (alpha ${a})`
    if (a) lowest = Math.floor(i / SIZE)
  }
  if (lowest !== groundY) return `lowest opaque row is ${lowest}, skin.json groundY is ${groundY}`
  return null
}

function compose(skin) {
  const src = join(root, 'assets/art-src', skin)
  const cfg = JSON.parse(readFileSync(join(src, 'skin.json'), 'utf8'))
  const errors = []
  const load = (name) => {
    const file = join(src, `${name}.png`)
    if (!existsSync(file)) return errors.push(`${name}.png: missing`), new Uint8Array(SIZE * SIZE * 4)
    const { width, height, rgba } = decodePng(readFileSync(file))
    const err = validate(rgba, width, height, cfg.groundY)
    if (err) errors.push(`${name}.png: ${err}`)
    return rgba
  }
  const pair = (name) => [load(`${name}-0`), load(`${name}-1`)]

  const base = load('base')
  const closed = load('eyes-closed')
  const typing = [0, 1, 2].map((i) => load(`typing-${i}`))
  const sleep = pair('sleep')
  const expr = Object.fromEntries([...cfg.expressions, cfg.overheatFrom].map((e) => [e, pair(e)]))
  for (const [x, y] of cfg.eyes) {
    if (base[(y * SIZE + x) * 4 + 3] !== 255) errors.push(`base.png: eye anchor ${x},${y} is transparent`)
  }
  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${skin}/${e}`)
    process.exit(1)
  }

  const [p0, p1] = expr[cfg.overheatFrom]
  const sheets = {
    idle: idleFrames([base, closed, lidded(base, cfg.halfOpenLids)]),
    typing: typing.map((f) => shift(f, TYPING_POSE_DY)),
    overheat: [p0, p1, p0],
    'sleep-transition': [base, closed, shift(sleep[0], SLEEP_SETTLE_DY), sleep[0]],
    sleep,
    ...Object.fromEntries(cfg.expressions.map((e) => [e, expr[e]])),
  }
  const out = join(root, 'assets/sprites', skin)
  mkdirSync(out, { recursive: true })
  for (const [name, frames] of Object.entries(sheets)) {
    writeFileSync(join(out, `${name}.png`), strip(frames))
    console.log(`wrote assets/sprites/${skin}/${name}.png (${frames.length} frames)`)
  }
  // pupils.png is kept as-is: its iris art is skin-specific and gen-sprites owns it
  if (!existsSync(join(out, 'pupils.png'))) console.warn(`WARN ${skin}/pupils.png missing`)
}

function selfTest() {
  const f = new Uint8Array(SIZE * SIZE * 4)
  f.set([1, 2, 3, 255], (60 * SIZE + 10) * 4) // one opaque px on the ground row
  assert.equal(validate(f, SIZE, SIZE, 60), null)
  assert.match(validate(f, SIZE, SIZE, 59), /groundY/)
  assert.match(validate(f, 32, SIZE, 60), /64x64/)

  const up = shift(f, -2)
  assert.equal(up[(58 * SIZE + 10) * 4 + 3], 255)
  assert.equal(up[(60 * SIZE + 10) * 4 + 3], 0)
  assert.deepEqual(shift(shift(f, 3), -3), f)

  const frames = idleFrames([f, f, f])
  assert.equal(frames.length, 12)
  BREATH_DY.forEach((dy, i) => assert.equal(frames[4 + i][((60 + dy) * SIZE + 10) * 4 + 3], 255))

  const l = lidded(up, [[10, 59, 10, 60]]) // copies the px at row 58 down
  assert.deepEqual([...l.subarray((60 * SIZE + 10) * 4, (60 * SIZE + 10) * 4 + 4)], [1, 2, 3, 255])

  const { width, height, rgba } = decodePng(strip([f, up]))
  assert.equal(width, 128)
  assert.equal(height, SIZE)
  assert.equal(rgba[(58 * 128 + 64 + 10) * 4 + 3], 255)
  console.log('compose-skin self-test OK')
}

const arg = process.argv[2]
if (arg === '--self-test') selfTest()
else if (arg) compose(arg)
else {
  console.error('usage: node scripts/compose-skin.mjs <skin> | --self-test')
  process.exit(2)
}
