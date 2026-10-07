// Art verification: dimensions, Art Source parity, frame alignment, tray icons.
// Run: node scripts/verify-art.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from './png.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')


const FRAME = 64

const expected = {
  idle: 12, typing: 3, overheat: 3,
  'sleep-transition': 4, sleep: 2, pupils: 1,
}

let ok = true
const fail = (msg) => { console.log(`FAIL ${msg}`); ok = false }

// ponytail: no palette check — every committed skin is curated or AI art now,
// so there is no procedural palette left to hold them to.
for (const skin of ['frenchie', 'agumon', 'black_french_bulldog']) {
  for (const [name, expFrames] of Object.entries(expected)) {
    const { width, height } = decodePng(readFileSync(join(root, `assets/sprites/${skin}/${name}.png`)))
    if (height !== FRAME || width !== expFrames * FRAME) {
      fail(`${skin}/${name}: ${width}x${height} (expected ${expFrames * FRAME}x${FRAME})`)
    } else {
      console.log(`OK ${skin}/${name}: ${width}x${height} (${expFrames} frames)`)
    }
  }
}

/** Lowest opaque row of one frame, or -1 if the frame is empty. */
const lowestRow = ({ width, rgba }, frame) => {
  for (let y = FRAME - 1; y >= 0; y--) {
    for (let x = frame * FRAME; x < (frame + 1) * FRAME; x++) if (rgba[(y * width + x) * 4 + 3]) return y
  }
  return -1
}

// Art Source skins (spec §10): expression sheets, eye anchors, ground line.
const eyesTs = readFileSync(join(root, 'src/renderer/eyes.ts'), 'utf8')
for (const skin of readdirSync(join(root, 'assets/art-src'))) {
  const cfgFile = join(root, 'assets/art-src', skin, 'skin.json')
  if (!existsSync(cfgFile)) continue
  const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'))

  const m = eyesTs.match(new RegExp(`\\b${skin}:\\s*(\\[[\\s\\S]*?\\]\\s*\\]),`))
  const anchors = m && JSON.parse(m[1].replace(/,\s*\]/g, ']'))
  if (JSON.stringify(anchors) !== JSON.stringify(cfg.eyes)) {
    fail(`${skin}: eyes.ts anchors ${JSON.stringify(anchors)} != skin.json eyes ${JSON.stringify(cfg.eyes)}`)
  } else {
    console.log(`OK ${skin}: eye anchors match skin.json`)
  }

  for (const name of cfg.expressions) {
    const file = join(root, `assets/sprites/${skin}/${name}.png`)
    if (!existsSync(file)) { fail(`${skin}/${name}: missing`); continue }
    const img = decodePng(readFileSync(file))
    if (img.width !== 2 * FRAME || img.height !== FRAME) { fail(`${skin}/${name}: ${img.width}x${img.height} (expected 128x64)`); continue }
    const rows = [0, 1].map((f) => lowestRow(img, f))
    if (rows.some((r) => r !== cfg.groundY)) fail(`${skin}/${name}: lowest rows ${rows} (expected groundY ${cfg.groundY})`)
    else console.log(`OK ${skin}/${name}: 128x64, grounded at y=${cfg.groundY}`)
  }
}

// Drag frames (issue 17) are optional per skin: 8 frames, landing frames grounded.
for (const skin of ['frenchie', 'agumon', 'black_french_bulldog']) {
  const file = join(root, `assets/sprites/${skin}/drag.png`)
  if (!existsSync(file)) continue
  const img = decodePng(readFileSync(file))
  if (img.width !== 8 * FRAME || img.height !== FRAME) { fail(`${skin}/drag: ${img.width}x${img.height} (expected 512x64)`); continue }
  const rows = [6, 7].map((f) => lowestRow(img, f))
  if (rows.some((r) => r !== 60)) fail(`${skin}/drag: frames 8-9 lowest rows ${rows} (expected 60)`)
  else console.log(`OK ${skin}/drag: 512x64 (8 frames), frames 8-9 grounded at y=60`)
}

// Steam is shared across skins and uses alpha blending — dimensions only.
{
  const { width, height } = decodePng(readFileSync(join(root, 'assets/sprites/steam.png')))
  if (height === FRAME && width / FRAME === 3) {
    console.log(`OK steam: ${width}x${height} (3 frames, palette: skip — alpha blending)`)
  } else {
    console.log(`FAIL steam: ${width}x${height}`); ok = false
  }
}

// Tray icons
for (const file of ['iconTemplate.png', 'iconTemplate@2x.png']) {
  const { width, height } = decodePng(readFileSync(join(root, `assets/tray/${file}`)))
  const exp = file.includes('@2x') ? 32 : 16
  if (width === exp && height === exp) {
    console.log(`OK tray/${file}: ${width}x${height}`)
  } else {
    console.log(`FAIL tray/${file}: ${width}x${height} (expected ${exp}x${exp})`); ok = false
  }
}

// Tray icon is alpha-only (template image: black channel, alpha mask)
const trayPng = decodePng(readFileSync(join(root, 'assets/tray/iconTemplate.png')))
let allBlackOrTransparent = true
for (let i = 0; i < trayPng.rgba.length; i += 4) {
  if (trayPng.rgba[i + 3] === 0) continue
  if (trayPng.rgba[i] !== 0 || trayPng.rgba[i + 1] !== 0 || trayPng.rgba[i + 2] !== 0) {
    allBlackOrTransparent = false; break
  }
}
console.log(allBlackOrTransparent ? 'OK tray: monochrome template' : 'FAIL tray: non-monochrome')
if (!allBlackOrTransparent) ok = false

console.log(ok ? '\n✅ ALL ART CHECKS PASSED' : '\n❌ SOME CHECKS FAILED')
process.exit(ok ? 0 : 1)
