// Slices the 3×3 evolution reference into 9 individual 256×256 frames with
// transparent backgrounds.
//   sips -s format png evolving.jpeg --out "$TMPDIR/evolving.png"
//   node scripts/slice-evolution.mjs "$TMPDIR/evolving.png"   (writes assets/sprites/agumon/evolution-{0..8}.png)
//   node scripts/slice-evolution.mjs --self-test
// The source is a 2048x2048 JPEG with dark scenery backgrounds. Dark pixels
// (luminance ≤ 35) are keyed to transparent so the renderer's own dark
// backdrop shows through. The silhouette frame (index 2) is mostly dark by
// design — it becomes near-invisible on transparency, which is fine: the
// renderer fills #0a0a12 first, and the silhouette reads against that fill.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { decodePng, encodePng } from './png.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FRAME = 256
const GRID = 3
// ponytail: luminance threshold for bg removal — raise if character edges clip
const LUM_THRESHOLD = 35

/** Box-filter downscale of an integer source rect to FRAME × FRAME with bg keyed to alpha 0. */
function downscale(img, [x0, y0, x1, y1]) {
  const { width: W, rgba } = img
  const sw = x1 - x0
  const sh = y1 - y0
  const out = new Uint8Array(FRAME * FRAME * 4)
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) {
      const sx0 = Math.min(x1 - 1, x0 + Math.floor((x * sw) / FRAME))
      const sx1 = Math.max(sx0 + 1, x0 + Math.floor(((x + 1) * sw) / FRAME))
      const sy0 = Math.min(y1 - 1, y0 + Math.floor((y * sh) / FRAME))
      const sy1 = Math.max(sy0 + 1, y0 + Math.floor(((y + 1) * sh) / FRAME))
      let r = 0, g = 0, b = 0, n = 0
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const p = (sy * W + sx) * 4
        r += rgba[p]; g += rgba[p + 1]; b += rgba[p + 2]; n++
      }
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const o = (y * FRAME + x) * 4
      out[o] = r; out[o + 1] = g; out[o + 2] = b
      out[o + 3] = lum <= LUM_THRESHOLD ? 0 : 255
    }
  }
  return out
}

function slice(file) {
  const img = decodePng(readFileSync(file))
  if (img.width !== img.height) {
    console.error(`FAIL expected a square source, found ${img.width}x${img.height}`)
    process.exit(1)
  }
  const dir = join(root, 'assets/sprites/agumon')
  mkdirSync(dir, { recursive: true })
  const cells = GRID * GRID
  for (let i = 0; i < cells; i++) {
    const cx = i % GRID
    const cy = Math.floor(i / GRID)
    const x0 = Math.floor((cx * img.width) / GRID)
    const x1 = Math.floor(((cx + 1) * img.width) / GRID)
    const y0 = Math.floor((cy * img.height) / GRID)
    const y1 = Math.floor(((cy + 1) * img.height) / GRID)
    const frame = downscale(img, [x0, y0, x1, y1])
    const out = join(dir, `evolution-${i}.png`)
    writeFileSync(out, encodePng(FRAME, FRAME, frame))
  }
  console.log(`wrote ${cells} frames to assets/sprites/agumon/evolution-{0..8}.png (${FRAME}x${FRAME}, transparent bg)`)
}

function selfTest() {
  // 3×3 grid, 90px source, one distinct solid color per cell → 9 frames.
  // Bright cells stay opaque; a dark cell goes transparent.
  const S = 90
  const rgba = new Uint8Array(S * S * 4)
  const cellCol = (i) => [i * 20, 100 + i * 10, 150 - i * 10]
  for (let i = 0; i < 9; i++) {
    const [r, g, b] = cellCol(i)
    const cx = (i % 3) * (S / 3)
    const cy = Math.floor(i / 3) * (S / 3)
    for (let y = cy; y < cy + S / 3; y++) for (let x = cx; x < cx + S / 3; x++) {
      rgba.set([r, g, b, 255], (y * S + x) * 4)
    }
  }
  const img = { width: S, height: S, rgba }
  // Cell 0: [0, 100, 150] → lum ≈ 0.299*0 + 0.587*100 + 0.114*150 = 75.8 → opaque
  const f0 = downscale(img, [0, 0, S / 3, S / 3])
  assert.deepEqual([f0[0], f0[1], f0[2]], cellCol(0))
  assert.equal(f0[3], 255, 'bright cell should be opaque')
  // Cell 8: [160, 180, 70] → lum ≈ 153 → opaque
  const f8 = downscale(img, [2 * S / 3, 2 * S / 3, S, S])
  assert.deepEqual([f8[0], f8[1], f8[2]], cellCol(8))
  assert.equal(f8[3], 255, 'bright cell should be opaque')
  // Synthetic dark cell: rgb(10, 10, 10) → lum ≈ 10 → transparent
  const dark = new Uint8Array(S * S * 4)
  for (let i = 0; i < S * S; i++) dark.set([10, 10, 10, 255], i * 4)
  const dimg = { width: S, height: S, rgba: dark }
  const fd = downscale(dimg, [0, 0, S, S])
  assert.equal(fd[3], 0, 'dark pixel should be transparent')
  console.log('slice-evolution self-test OK')
}

const [a] = process.argv.slice(2)
if (a === '--self-test') selfTest()
else if (a) slice(a)
else {
  console.error('usage: node scripts/slice-evolution.mjs <evolving.png> | --self-test')
  process.exit(2)
}
