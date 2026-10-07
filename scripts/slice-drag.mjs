// Slices the 3x3 drag reference (flat green background, dark grid lines) into
// an 8-frame 512x64 strip of reference frames 2-9; frame 1 is the idle pose.
//   sips -s format png docs/reference/agumon/gen/dragging.jpeg --out "$TMPDIR/dragging.png"
//   node scripts/slice-drag.mjs "$TMPDIR/dragging.png"   (writes assets/sprites/agumon/drag.png)
//   node scripts/slice-drag.mjs --self-test
// Airborne frames 2-7 hang from the cursor, so they share a head-top line;
// frames 8-9 (squash, dizzy) land on the ground line like every other sheet.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { decodePng, encodePng } from './png.mjs'
import { GROUND_Y, SIZE, bounds, cellSpans, pitchOf, place, quantize, sampleCell } from './import-art.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FRAMES = 8
const AIRBORNE = 6
// head top of agumon idle frame 0, so the lift doesn't jump vertically
const HEAD_Y = 9
// ponytail: a leading run of >2 rows narrower than 8 art px is the mouse cursor
// drawn above the head (reference frame 2); a head crest is at most 1-2 rows.
const CURSOR_W = 8
const CURSOR_ROWS = 2

const rowWidth = ({ w, px }, y) => px.slice(y * w, (y + 1) * w).filter(Boolean).length

/** Blanks the cursor above the head, if the cell has one. */
function stripCursor(c) {
  const top = bounds(c)[1]
  let y = top
  while (y < c.h && rowWidth(c, y) < CURSOR_W) y++
  if (y - top > CURSOR_ROWS) c.px.fill(null, top * c.w, y * c.w)
}

/** Builds the strip from a decoded 3x3 sheet: frames 0-5 head-aligned, 6-7 grounded. */
function strip(img, pitch) {
  const xs = cellSpans(img, 'x')
  const ys = cellSpans(img, 'y')
  if (xs.length !== 3 || ys.length !== 3) throw new Error(`expected a 3x3 grid, found ${xs.length}x${ys.length}`)
  const cells = Array.from({ length: FRAMES }, (_, i) => sampleCell(img, xs[(i + 1) % 3], ys[Math.floor((i + 1) / 3)], pitch))
  if (cells[0].w > SIZE || cells[0].h > SIZE) throw new Error(`cell ${cells[0].w}x${cells[0].h} art px exceeds ${SIZE}`)
  quantize(cells)
  const out = new Uint8Array(FRAMES * SIZE * SIZE * 4)
  cells.forEach((c, i) => {
    if (i < AIRBORNE) stripCursor(c)
    const [, top, , lowest] = bounds(c)
    const dy = i < AIRBORNE ? HEAD_Y - top : GROUND_Y - lowest
    if (lowest + dy >= SIZE) throw new Error(`frame ${i + 2} overflows the canvas by ${lowest + dy - SIZE + 1}px`)
    const f = place(c, 1, dy)
    for (let y = 0; y < SIZE; y++) out.set(f.subarray(y * SIZE * 4, (y + 1) * SIZE * 4), (y * FRAMES + i) * SIZE * 4)
  })
  return out
}

function slice(file) {
  const img = decodePng(readFileSync(file))
  const xs = cellSpans(img, 'x')
  const ys = cellSpans(img, 'y')
  const pitch = pitchOf(img, xs[0], ys[0])
  writeFileSync(join(root, 'assets/sprites/agumon/drag.png'), encodePng(FRAMES * SIZE, SIZE, strip(img, pitch)))
  console.log(`pitch ${pitch.toFixed(2)}px, wrote ${FRAMES} frames to assets/sprites/agumon/drag.png`)
}

function selfTest() {
  // 3x3 grid of 72px cells (12x12 art px at pitch 6) split by 2px black lines;
  // each cell holds an 8x4 art-px block at a different height.
  const P = 6, C = 12 * P, W = 3 * C + 4
  const rgba = new Uint8Array(W * W * 4)
  for (let i = 0; i < W * W; i++) rgba.set([10, 250, 5, 255], i * 4)
  for (let i = 0; i < W; i++) for (const l of [C, C + 1, 2 * C + 2, 2 * C + 3]) {
    rgba.set([0, 0, 0, 255], (i * W + l) * 4)
    rgba.set([0, 0, 0, 255], (l * W + i) * 4)
  }
  const art = (cell, ax, ay, aw, ah) => {
    const ox = (cell % 3) * (C + 2), oy = Math.floor(cell / 3) * (C + 2)
    for (let y = oy + ay * P; y < oy + (ay + ah) * P; y++) for (let x = ox + ax * P; x < ox + (ax + aw) * P; x++) rgba.set([200, 120, 30, 255], (y * W + x) * 4)
  }
  for (let cell = 1; cell < 9; cell++) art(cell, 2, 3 + (cell % 4), 8, 4)
  art(1, 5, 1, 1, 3) // cursor above cell 1's body (reference frame 2)
  const out = strip({ width: W, height: W, rgba }, P)
  const alpha = (f, x, y) => out[(y * FRAMES * SIZE + f * SIZE + x) * 4 + 3]
  const rows = (f) => [...Array(SIZE).keys()].filter((y) => [...Array(SIZE).keys()].some((x) => alpha(f, x, y)))
  for (let f = 0; f < AIRBORNE; f++) assert.equal(rows(f)[0], HEAD_Y, `frame ${f} head top`)
  for (let f = AIRBORNE; f < FRAMES; f++) assert.equal(rows(f).at(-1), GROUND_Y, `frame ${f} ground`)
  assert.equal(rows(0).length, 4, 'cursor stripped from frame 0')
  assert.throws(() => strip({ width: W, height: W, rgba: new Uint8Array(W * W * 4).fill(255) }, P), /3x3 grid/)
  console.log('slice-drag self-test OK')
}

const [a] = process.argv.slice(2)
if (a === '--self-test') selfTest()
else if (a) slice(a)
else {
  console.error('usage: node scripts/slice-drag.mjs <dragging.png> | --self-test')
  process.exit(2)
}
