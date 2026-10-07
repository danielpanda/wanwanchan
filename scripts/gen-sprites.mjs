// Generates the 64x64 sprite strips for every skin:
//   assets/sprites/<skin>/idle.png    12 frames — three banks of four, one per
//                                         breath pose: 0-3 open, 4-7 blinked,
//                                         8-11 half-open
//   assets/sprites/<skin>/typing.png   3 frames — 0 neutral, 1 left paw down,
//                                         2 right paw down
//   assets/sprites/<skin>/overheat.png 3 frames — typing poses with the
//                                         tongue-out panting face
//   assets/sprites/<skin>/sleep-transition.png
//                                     4 frames — eyes droop → head nod → curl
//   assets/sprites/<skin>/sleep.png    2 frames — curled breathing loop
//   assets/sprites/<skin>/pupils.png   1 frame  — iris + catchlight, centered
//   assets/sprites/steam.png           3 frames — shared; puffs are
//                                         skin-independent
//
// Every skin shares ONE drawing skeleton: head/eye/ear anchors (EYE_ANCHORS in
// eyes.ts, STEAM_EARS in steam.ts) and the breath/pose offsets the engine bakes
// against (BREATH_DY in idle.ts, TYPING_POSE_DY in typing.ts) are identical,
// so a skin is a palette plus a few geometry flags. That constraint is what
// keeps the sheets in lockstep with the renderer.
// ponytail: agumon reuses the frenchie skeleton rather than getting his own
// rig; revisit only if a future skin needs different proportions or anchors.
//
// The art is drawn procedurally rather than painted. Every frame is
// pixel-exact and reproducible from this file. Repaint by hand only if the
// anchor lockstep above stays true — re-run `npm run sprites` after any edit.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const SIZE = 64

// Frenchie palette from the design spec (§4.1): charcoal coat + velvet
// highlight. The rim light is the lid value — a relit edge, not a new entry.
const FRENCHIE = {
  name: 'frenchie',
  coat: [0x1a, 0x1a, 0x1f],
  coatHi: [0x2b, 0x2b, 0x36],
  coatLo: [0x0e, 0x0e, 0x12],
  muzzle: [0x26, 0x26, 0x2f],
  nose: [0x08, 0x08, 0x0b],
  eyeRim: [0x45, 0x45, 0x54],
  eyeSocket: [0x15, 0x15, 0x1a],
  coatRim: [0x45, 0x45, 0x54],
  iris: [0x0b, 0x0b, 0x0e],
  chest: [0x2b, 0x2b, 0x36],
  ears: 'bat',
  claws: false,
  teeth: false,
  tail: false,
}

// Agumon (Digimon): orange hide, cream muzzle/belly/claws, green eyes with a
// black pupil center. The rim is a lighter orange — the same trick the
// near-black frenchie coat needs to stay readable on dark wallpapers.
const AGUMON = {
  name: 'agumon',
  coat: [0xe8, 0x94, 0x2c],
  coatHi: [0xf5, 0xb4, 0x5a],
  coatLo: [0xb9, 0x6a, 0x15],
  muzzle: [0xf2, 0xe0, 0xb8],
  nose: [0x3f, 0x2a, 0x12],
  eyeRim: [0x3f, 0x2a, 0x12],
  // Dark socket: a brighter one read as frog eyes; the green iris layer
  // carries the Agumon eye on its own.
  eyeSocket: [0x0e, 0x2e, 0x0e],
  coatRim: [0xf8, 0xcd, 0x7e],
  iris: [0x8f, 0xd3, 0x3e],
  chest: [0xf2, 0xe0, 0xb8],
  ears: 'round',
  claws: true,
  teeth: true,
  nostrils: true,
  tail: true,
}

const SKINS = [FRENCHIE, AGUMON]

// Colors every skin shares: desk, tongue, steam, catchlight, pupil center.
const DESK = [0x3a, 0x30, 0x2a]
const DESK_HI = [0x53, 0x45, 0x3b]
const KEY = [0x22, 0x1d, 0x19]
const TONGUE = [0xd9, 0x8b, 0x94]
const TONGUE_LO = [0xb0, 0x64, 0x6e]
const STEAM = [0xe6, 0xe6, 0xec]
const SPARK = [0xff, 0xff, 0xff]
const PUPIL_DARK = [0x0b, 0x0b, 0x0e]

// Chest rise per breathing frame. Head, ears and torso lift together; the
// paws and desk stay planted.
const BREATH_DY = [0, -1, -2, -1]
// Typing frames are baked mid-breath too, so switching idle↔typing never
// shifts the body — only the paws move.
const TYPING_DY = -1

function newFrame() {
  return new Uint8Array(SIZE * SIZE * 4)
}

function px(buf, x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  buf[i] = r
  buf[i + 1] = g
  buf[i + 2] = b
  buf[i + 3] = a
}

function rect(buf, x, y, w, h, color) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(buf, i, j, color)
}

function ellipse(buf, cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1) px(buf, x, y, color)
    }
  }
}

// Ear at the shared base anchor. 'bat' is the frenchie's tall rounded ear,
// apex at the top (dir -1 leans left, +1 leans right; h shortens it for the
// drooping sleep poses). 'round' is Agumon's small head nub — same anchor, so
// the shared STEAM_EARS still rise from the head's crown.
function ear(buf, sk, baseX, baseY, dir, h = 15) {
  if (sk.ears === 'round') {
    // Taller nub: reads as Agumon's head bumps, not a cat ear.
    ellipse(buf, baseX + dir * 2, baseY - 3, 3.5, 5, sk.coat)
    ellipse(buf, baseX + dir * 2, baseY - 5, 2.2, 2, sk.coatHi)
    return
  }
  for (let t = 0; t < h; t++) {
    const y = baseY - t
    const halfW = Math.round(4 * (1 - t / h) + 0.8)
    const lean = Math.round((t / h) * 2) * dir
    rect(buf, baseX + lean - halfW, y, halfW * 2 + 1, 1, t > h - 4 ? sk.coatLo : sk.coat)
    if (t < h - 5) rect(buf, baseX + lean - halfW + 1, y, 1, 1, sk.coatHi) // inner contour
  }
}

// Relights every coat pixel that touches transparency (frame borders count as
// edges). Runs from a snapshot so a just-lit pixel is never treated as the
// body for its neighbour — that would eat a second pixel inward and thin the
// character. Desk pixels are skipped: their browns already clear lum 49.
function rimLight(buf, sk) {
  const src = buf.slice()
  const solid = (x, y) =>
    x >= 0 && y >= 0 && x < SIZE && y < SIZE && src[(y * SIZE + x) * 4 + 3] > 0
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4
      if (src[i + 3] === 0) continue
      if (solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1)) continue
      if (!sk.family.has([src[i], src[i + 1], src[i + 2]].join())) continue
      px(buf, x, y, sk.coatRim)
    }
  }
  return buf
}

function paw(buf, sk, x, y) {
  ellipse(buf, x, y, 5, 3.5, sk.coat)
  ellipse(buf, x, y - 1, 4, 2, sk.coatHi)
  if (sk.claws) {
    // Agumon: three cream claw tips at the front of the paw.
    for (const tx of [-3, 0, 3]) rect(buf, x + tx, y + 1, 1, 2, sk.muzzle)
  } else {
    for (const tx of [-3, 0, 3]) rect(buf, x + tx, y + 1, 1, 3, sk.coatLo) // toe splits
  }
}

/**
 * @param eyeOpen 1 = open, 0.5 = half, 0 = closed
 * @param paws [leftDy, rightDy] paw offsets: negative lifts off the keys,
 *   positive presses into them. Defaults to both planted.
 * @param tongue overheat panting face: open mouth, tongue lolling out,
 *   squint-left to the caller
 */
function drawFrame(sk, dy, eyeOpen, paws = [0, 0], tongue = false) {
  const buf = newFrame()

  // --- Body (lifts with the breath) ---
  ear(buf, sk, 22, 20 + dy, -1)
  ear(buf, sk, 42, 20 + dy, 1)
  if (sk.tail) {
    // Agumon's tail curls up behind the torso (drawn first so the torso
    // overlaps its base), cream tip last so it clears the coat silhouette.
    ellipse(buf, 50, 48 + dy, 5, 4, sk.coat)
    ellipse(buf, 52, 45 + dy, 2.5, 2.5, sk.muzzle)
  }
  ellipse(buf, 32, 47 + dy, 17, 13, sk.coat) // torso
  ellipse(buf, 32, 42 + dy, 12, 6, sk.chest) // chest highlight / cream belly
  ellipse(buf, 32, 28 + dy, 15, 12, sk.coat) // head
  ellipse(buf, 32, 22 + dy, 11, 6, sk.coatHi) // brow highlight

  // --- Face ---
  ellipse(buf, 32, 34 + dy, sk.nostrils ? 10 : 9, sk.nostrils ? 7 : 6, sk.muzzle)
  rect(buf, 27, 36 + dy, 11, 1, sk.coatLo) // jowl crease
  if (sk.nostrils) {
    // Agumon's flat reptilian snout: two nostrils instead of a dog nose.
    px(buf, 30, 31 + dy, sk.nose)
    px(buf, 34, 31 + dy, sk.nose)
  } else {
    ellipse(buf, 32, 31 + dy, 3, 2, sk.nose)
  }
  rect(buf, 32, 33 + dy, 1, 2, sk.coatLo) // philtrum
  if (tongue) {
    // Panting: mouth open wide, tongue lolling past the jowl onto the chest.
    ellipse(buf, 32, 36 + dy, 4, 2, sk.nose)
    rect(buf, 30, 36 + dy, 5, 5, TONGUE)
    rect(buf, 30, 40 + dy, 5, 1, TONGUE_LO) // rounded tip
    rect(buf, 32, 37 + dy, 1, 4, TONGUE_LO) // center crease
  } else if (sk.teeth) {
    // Agumon: solid grin line with two corner fangs — his signature look.
    rect(buf, 28, 35 + dy, 11, 1, sk.coatLo)
    rect(buf, 29, 36 + dy, 1, 2, SPARK)
    rect(buf, 37, 36 + dy, 1, 2, SPARK)
  } else {
    rect(buf, 28, 35 + dy, 3, 1, sk.coatLo)
    rect(buf, 34, 35 + dy, 3, 1, sk.coatLo) // mouth
  }

  // Large dark Frenchie eyes: near-black iris with a soft rim and a single
  // specular catchlight (spec §4.1) — not white sclera. Open eyes leave an
  // empty socket: the iris rides in pupils.png and glides toward the cursor
  // (spec §7). Squint and closed lids keep their baked look — no tracking
  // layer is drawn over them. Same sockets for every skin, so EYE_ANCHORS
  // stay shared.
  for (const ex of [25, 39]) {
    const ey = 26 + dy
    if (eyeOpen === 0) {
      rect(buf, ex - 3, ey, 7, 1, sk.eyeRim) // closed lash line
      continue
    }
    const ry = eyeOpen === 0.5 ? 1.6 : 3.2
    ellipse(buf, ex, ey, 4, ry + 0.8, sk.eyeRim) // lid rim
    if (eyeOpen === 1) {
      ellipse(buf, ex, ey, 3.2, ry, sk.eyeSocket) // socket the iris floats in
    } else {
      ellipse(buf, ex, ey, 3.2, ry, sk.iris) // squint keeps its baked slit-iris
      px(buf, ex - 1, ey - 1, SPARK)
    }
  }

  // --- Desk & paws ---
  paw(buf, sk, 23, 53 + paws[0])
  paw(buf, sk, 41, 53 + paws[1])
  rect(buf, 4, 56, 56, 8, DESK)
  rect(buf, 4, 56, 56, 1, DESK_HI)
  for (let kx = 7; kx < 57; kx += 5) {
    rect(buf, kx, 58, 3, 2, KEY)
    rect(buf, kx, 61, 3, 2, KEY)
  }

  return rimLight(buf, sk)
}

/**
 * Curled asleep on the desk (spec §6.2): body lying along the desktop, head
 * tucked over the paws, tail wrapped around the haunch. `dy` is the breathing
 * offset; `headUp` keeps the chin lifted for the last settle frame, so the
 * wake (that frame reversed) reads as the head rising first.
 */
function drawCurlFrame(sk, dy, headUp) {
  const buf = newFrame()
  const hy = 47 + dy + (headUp ? -2 : 0)

  // --- Ears (behind the head): one half-up, one folded flat ---
  ear(buf, sk, 28, hy - 8, 1, 9)
  ellipse(buf, 11, hy - 8, 5, 2, sk.coat)
  rect(buf, 8, hy - 9, 4, 1, sk.coatLo) // fold crease

  // --- Tail curled around the haunch (behind the body) ---
  ellipse(buf, 45, 50 + dy, 7, 5, sk.coat)
  ellipse(buf, 45, 50 + dy, 3, 2, sk.tail ? sk.muzzle : sk.coatLo) // tail tip

  // --- Body curled along the desk ---
  ellipse(buf, 33, 49 + dy, 15, 7, sk.coat)
  ellipse(buf, 33, 45 + dy, 10, 3, sk.coatHi) // back highlight

  // --- Head resting over the paws ---
  // Same skull as the standing pose, turned side-on: a curled animal's head
  // does not shrink, so the radii stay within a hair of drawFrame's 15x12
  // rather than the half-scale they used to be (ticket 08, "same character
  // across states").
  ellipse(buf, 22, hy - 2, 13, 10, sk.coat)
  ellipse(buf, 22, hy - 7, 9, 4, sk.coatHi) // brow highlight
  ellipse(buf, 12, hy + 1, 6, 4.5, sk.muzzle) // muzzle turned sideways
  ellipse(buf, 7, hy + 1, 2, 1.5, sk.nose)
  if (sk.teeth) px(buf, 11, hy + 4, SPARK) // one fang keeps the face on-skin
  rect(buf, 17, hy - 3, 7, 1, sk.eyeRim) // closed lash line
  ellipse(buf, 28, hy + 6, 4, 2.5, sk.muzzle) // paws tucked under the chin
  ellipse(buf, 34, hy + 7, 4, 2.5, sk.muzzle)

  // --- Desk (baked in, spec §6.4) ---
  rect(buf, 4, 56, 56, 8, DESK)
  rect(buf, 4, 56, 56, 1, DESK_HI)
  for (let kx = 7; kx < 57; kx += 5) {
    rect(buf, kx, 58, 3, 2, KEY)
    rect(buf, kx, 61, 3, 2, KEY)
  }

  return rimLight(buf, sk)
}

// Steam puffs: a translucent blob expanding and thinning over three frames.
// The renderer anchors the frame CENTER (32, 32) to the particle position, so
// each puff is built around that point. Mostly transparent padding — the
// engine depends only on the 64x64 format, not on the puff filling it.
function puff(buf, cx, cy, rx, ry, a) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1) px(buf, x, y, STEAM, a)
    }
  }
}

// Blob = 3 overlapping circles; a lone circle reads as a ball, not steam.
function steamFrame(r, a) {
  const buf = newFrame()
  puff(buf, 32 - r * 0.5, 32 - r * 0.3, r * 0.7, r * 0.6, a)
  puff(buf, 32 + r * 0.5, 32 - r * 0.2, r * 0.7, r * 0.6, a)
  puff(buf, 32, 32 + r * 0.3, r * 0.8, r * 0.7, a)
  return buf
}

/** Stitches frames into one horizontal strip and writes it to assets/sprites. */
function writeSheet(name, frames) {
  const sheetW = SIZE * frames.length
  const sheet = new Uint8Array(sheetW * SIZE * 4)
  frames.forEach((frame, f) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const src = (y * SIZE + x) * 4
        const dst = (y * sheetW + f * SIZE + x) * 4
        sheet.set(frame.subarray(src, src + 4), dst)
      }
    }
  })
  const file = join(root, `assets/sprites/${name}.png`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, encodePng(sheetW, SIZE, sheet))
  console.log(`wrote assets/sprites/${name}.png (${sheetW}x${SIZE}, ${frames.length} frames)`)
}

// Typing: struck paw presses into the keys (the desk, drawn last, clips its
// lower edge), the other lifts clear so the alternation is unmistakable.
const PAW_PRESS = 1
const PAW_LIFT = -3

for (const sk of SKINS) {
  // The rim-light family set, built once per skin.
  sk.family = new Set([sk.coat, sk.coatHi, sk.coatLo, sk.muzzle].map((c) => c.join()))

  // Breathing never pauses for a blink, so each lid pose is baked once per
  // breath offset. A blink that interrupts frame 0 or 2 then keeps the body
  // exactly where it was instead of popping to a single mid-breath pose.
  writeSheet(
    `${sk.name}/idle`,
    [1, 0, 0.5].flatMap((eyeOpen) => BREATH_DY.map((dy) => drawFrame(sk, dy, eyeOpen))),
  )

  writeSheet(`${sk.name}/typing`, [
    drawFrame(sk, TYPING_DY, 1),
    drawFrame(sk, TYPING_DY, 1, [PAW_PRESS, PAW_LIFT]),
    drawFrame(sk, TYPING_DY, 1, [PAW_LIFT, PAW_PRESS]),
  ])

  // Overheat: same paw drumming, squinting panting face with the tongue out.
  writeSheet(`${sk.name}/overheat`, [
    drawFrame(sk, TYPING_DY, 0.5, [0, 0], true),
    drawFrame(sk, TYPING_DY, 0.5, [PAW_PRESS, PAW_LIFT], true),
    drawFrame(sk, TYPING_DY, 0.5, [PAW_LIFT, PAW_PRESS], true),
  ])

  // Settle: droop → nod → chin up in the curl → settled. Played once at 2.5 FPS.
  writeSheet(`${sk.name}/sleep-transition`, [
    drawFrame(sk, 0, 0.5),
    drawFrame(sk, 2, 0),
    drawCurlFrame(sk, -1, true),
    drawCurlFrame(sk, 0, false),
  ])

  // Sleep loop: the curled body's slow breath, 2 frames at ~1 FPS.
  writeSheet(`${sk.name}/sleep`, [drawCurlFrame(sk, 0, false), drawCurlFrame(sk, -1, false)])

  // Pupil layer: iris + catchlight centered in the frame; the renderer anchors
  // the frame center at each eye socket and offsets by the gaze vector.
  // Agumon's green iris carries a black pupil center; the frenchie's near-black
  // iris is its own pupil.
  const pupilFrame = newFrame()
  ellipse(pupilFrame, 32, 32, 3.2, 3.2, sk.iris)
  if (sk.ears === 'round') ellipse(pupilFrame, 32, 32, 1.4, 1.4, PUPIL_DARK)
  px(pupilFrame, 31, 31, SPARK)
  writeSheet(`${sk.name}/pupils`, [pupilFrame])
}

// Steam is shared: same gray puff for every skin.
writeSheet('steam', [steamFrame(3, 210), steamFrame(5, 160), steamFrame(7, 110)])
