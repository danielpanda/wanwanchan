// Generates the monochrome macOS menu-bar template icons in assets/tray/.
// Placeholder bulldog face until final SpriteCook art lands (issue 08).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// 16x16 grid: bat ears + rounded head, eyes and mouth carved out.
const SIZE = 16
const grid = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0))
const fill = (x, y, w, h) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j][i] = 1
}
const clear = (x, y, w, h) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j][i] = 0
}

fill(2, 2, 12, 12) // head
fill(3, 0, 3, 3) // left ear
fill(10, 0, 3, 3) // right ear
clear(2, 2, 1, 1)
clear(13, 2, 1, 1)
clear(2, 13, 1, 1)
clear(13, 13, 1, 1) // rounded corners
clear(5, 6, 2, 2) // left eye
clear(9, 6, 2, 2) // right eye
clear(7, 10, 2, 1) // mouth

function iconPng(scale) {
  const size = SIZE * scale
  const rgba = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = grid[Math.floor(y / scale)][Math.floor(x / scale)]
      rgba[(y * size + x) * 4 + 3] = on ? 255 : 0 // black, alpha-masked
    }
  }
  return encodePng(size, size, rgba)
}

mkdirSync(join(root, 'assets/tray'), { recursive: true })
writeFileSync(join(root, 'assets/tray/iconTemplate.png'), iconPng(1))
writeFileSync(join(root, 'assets/tray/iconTemplate@2x.png'), iconPng(2))
console.log('wrote assets/tray/iconTemplate.png + @2x')
