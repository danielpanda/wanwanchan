// Imports an upscaled 4x4 pose sheet (flat green background, dark grid lines,
// e.g. a Gemini render) into an Art Source: 16 binary-alpha 64x64 PNGs.
//   sips -s format png sheet.jpeg --out "$TMPDIR/sheet.png"   (decodePng reads PNG only)
//   node scripts/import-art.mjs <sheet.png> <skin>
//   node scripts/import-art.mjs --self-test
// Cells are row-major in NAMES order; the 16th cell is a spare and is skipped.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { decodePng, encodePng } from './png.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SIZE = 64
export const GROUND_Y = 60
const NAMES = [
  'base', 'eyes-closed', 'typing-0', 'typing-1',
  'typing-2', 'sleep-0', 'sleep-1', 'happy-0',
  'happy-1', 'laugh-0', 'laugh-1', 'pepper-0',
  'pepper-1', 'confused-0', 'confused-1',
]

export const isKey = (r, g, b) => g > 150 && r < 130 && b < 130 && g - Math.max(r, b) > 80
export const isDark = (r, g, b) => r + g + b < 120

/** Spans between dark grid lines along one axis (lines = >70% dark). */
export function cellSpans(img, axis) {
  const { width: W, height: H, rgba } = img
  const len = axis === 'x' ? W : H
  const other = axis === 'x' ? H : W
  const spans = []
  let start = 0
  for (let i = 0; i <= len; i++) {
    let dark = 0
    if (i < len) {
      for (let j = 0; j < other; j++) {
        const p = ((axis === 'x' ? j * W + i : i * W + j)) * 4
        dark += isDark(rgba[p], rgba[p + 1], rgba[p + 2])
      }
    }
    const line = i === len || dark / other > 0.7
    if (line) {
      if (i - start > len / 8) spans.push([start, i])
      start = i + 1
    }
  }
  return spans
}

/** Estimates the art-pixel pitch from horizontal color-edge positions. */
export function pitchOf(img, [x0, x1], [y0, y1]) {
  const { width: W, rgba } = img
  const edges = []
  for (let y = y0; y < y1; y += 5) {
    for (let x = x0 + 1; x < x1; x++) {
      const a = (y * W + x) * 4
      const d = Math.abs(rgba[a] - rgba[a - 4]) + Math.abs(rgba[a + 1] - rgba[a - 3]) + Math.abs(rgba[a + 2] - rgba[a - 2])
      if (d > 90) edges.push(x)
    }
  }
  const TOL = 1.5
  let best = [-Infinity, 0]
  // ponytail: brute-force pitch/phase search; fine for a one-off import
  for (let p = 6; p <= 24; p += 0.02) {
    for (let ph = 0; ph < p; ph += 0.5) {
      let hits = 0
      for (const e of edges) {
        const f = ((e - ph) % p + p) % p
        if (Math.min(f, p - f) <= TOL) hits++
      }
      // subtract the hit rate random edges would get, else small pitches always win
      const score = hits / edges.length - (2 * TOL) / p
      if (score > best[0]) best = [score, p]
    }
  }
  return best[1]
}

/** Samples one cell into an art-pixel grid; each sample is the median of the block centre. */
export function sampleCell(img, [x0, x1], [y0, y1], pitch) {
  const { width: W, rgba } = img
  const w = Math.floor((x1 - x0) / pitch)
  const h = Math.floor((y1 - y0) / pitch)
  const px = []
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const cx = x0 + (gx + 0.5) * pitch
      const cy = y0 + (gy + 0.5) * pitch
      const r = Math.max(1, Math.floor(pitch / 4))
      const s = [[], [], []]
      let keyed = 0
      let n = 0
      for (let y = Math.round(cy) - r; y <= Math.round(cy) + r; y++) {
        for (let x = Math.round(cx) - r; x <= Math.round(cx) + r; x++) {
          const p = (y * W + x) * 4
          n++
          if (isKey(rgba[p], rgba[p + 1], rgba[p + 2])) keyed++
          else for (let c = 0; c < 3; c++) s[c].push(rgba[p + c])
        }
      }
      if (keyed * 2 >= n) px.push(null)
      else px.push(s.map((v) => v.sort((a, b) => a - b)[v.length >> 1]))
    }
  }
  return { w, h, px }
}

/** Snaps colors onto a shared greedy palette so JPEG noise collapses. */
export function quantize(cells, tolerance = 48) {
  const palette = []
  const counts = new Map()
  for (const c of cells) for (const p of c.px) if (p) counts.set(p.join(), (counts.get(p.join()) ?? 0) + 1)
  // most frequent colors seed the palette first
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  for (const [k] of sorted) {
    const col = k.split(',').map(Number)
    if (!palette.some((q) => dist(q, col) <= tolerance)) palette.push(col)
  }
  const snap = (p) => palette.reduce((best, q) => (dist(q, p) < dist(best, p) ? q : best))
  for (const c of cells) c.px = c.px.map((p) => p && snap(p))
  return palette
}

const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])

/** Opaque bounds of a sampled cell, in art px: [x0, y0, x1, y1] inclusive. */
export function bounds({ w, px }) {
  const b = [Infinity, Infinity, -1, -1]
  px.forEach((p, i) => {
    if (!p) return
    const x = i % w, y = Math.floor(i / w)
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y)
  })
  return b
}

/**
 * Places a sampled cell on a 64x64 canvas at an integer scale: horizontally
 * centred on the cell (so poses keep their relative offsets), lowest opaque row on GROUND_Y
 * unless a vertical offset `dy` is given.
 */
export function place({ w, h, px }, scale = 1, dy = GROUND_Y + 1 - (bounds({ w, px })[3] + 1) * scale) {
  const dx = Math.floor((SIZE - w * scale) / 2)
  const out = new Uint8Array(SIZE * SIZE * 4)
  px.forEach((p, i) => {
    if (!p) return
    for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
      const x = (i % w) * scale + sx + dx
      const y = Math.floor(i / w) * scale + sy + dy
      if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) out.set([...p, 255], (y * SIZE + x) * 4)
    }
  })
  return out
}

function importSheet(file, skin) {
  const img = decodePng(readFileSync(file))
  const xs = cellSpans(img, 'x')
  const ys = cellSpans(img, 'y')
  if (xs.length !== 4 || ys.length !== 4) {
    console.error(`FAIL expected a 4x4 grid, found ${xs.length}x${ys.length}`)
    process.exit(1)
  }
  const pitch = pitchOf(img, xs[0], ys[0])
  const cells = NAMES.map((_, i) => sampleCell(img, xs[i % 4], ys[i >> 2], pitch))
  const palette = quantize(cells)
  // largest integer scale where every pose's content still fits the canvas height and width
  const fit = Math.min(...cells.map((c) => {
    const [x0, y0, x1] = bounds(c)
    const lowest = bounds(c)[3]
    const cx = c.w / 2
    const halfW = Math.max(cx - x0, x1 + 1 - cx)
    return Math.min(Math.floor((GROUND_Y + 1) / (lowest + 1 - y0)), Math.floor(SIZE / 2 / halfW))
  }))
  const scale = Math.max(1, fit)
  const out = join(root, 'assets/art-src', skin)
  mkdirSync(out, { recursive: true })
  NAMES.forEach((name, i) => writeFileSync(join(out, `${name}.png`), encodePng(SIZE, SIZE, place(cells[i], scale))))
  console.log(`pitch ${pitch.toFixed(2)}px, ${palette.length} colors, cell ${cells[0].w}x${cells[0].h} art px, scale ${scale}x`)
  console.log(`wrote ${NAMES.length} frames to assets/art-src/${skin}/`)
}

function selfTest() {
  // 2x2 grid of 40px cells split by 2px black lines, 8px art pixels, one red art pixel per cell
  const W = 84
  const rgba = new Uint8Array(W * W * 4)
  for (let i = 0; i < W * W; i++) rgba.set([10, 250, 5, 255], i * 4)
  for (let i = 0; i < W; i++) for (const l of [40, 41]) {
    rgba.set([0, 0, 0, 255], (i * W + l) * 4)
    rgba.set([0, 0, 0, 255], (l * W + i) * 4)
  }
  for (let y = 16; y < 24; y++) for (let x = 8; x < 16; x++) rgba.set([200, 30, 30, 255], (y * W + x) * 4)
  const img = { width: W, height: W, rgba }
  assert.deepEqual(cellSpans(img, 'x'), [[0, 40], [42, 84]])
  const cell = sampleCell(img, [0, 40], [0, 40], 8)
  assert.equal(cell.w, 5)
  assert.deepEqual(cell.px[2 * 5 + 1], [200, 30, 30])
  assert.equal(cell.px.filter(Boolean).length, 1)
  const noisy = [{ px: [[200, 30, 30], [205, 28, 33], [0, 0, 0]] }]
  assert.equal(quantize(noisy).length, 2)
  const frame = place(cell)
  assert.equal(frame[(GROUND_Y * SIZE + 1 + Math.floor((SIZE - 5) / 2)) * 4 + 3], 255)
  const big = place(cell, 2)
  const bx = 2 + Math.floor((SIZE - 10) / 2)
  for (const [x, y] of [[bx, GROUND_Y], [bx + 1, GROUND_Y - 1]]) assert.equal(big[(y * SIZE + x) * 4 + 3], 255)
  assert.equal(big[((GROUND_Y + 1) * SIZE + bx) * 4 + 3], 0)
  console.log('import-art self-test OK')
}

// CLI only when run directly — slice-drag.mjs imports the helpers above.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [a, b] = process.argv.slice(2)
  if (a === '--self-test') selfTest()
  else if (a && b) importSheet(a, b)
  else {
    console.error('usage: node scripts/import-art.mjs <sheet.png> <skin> | --self-test')
    process.exit(2)
  }
}
