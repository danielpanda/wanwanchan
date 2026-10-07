import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng } from './png.mjs';


const baseTan = decodePng(readFileSync('assets/sprites/frenchie_revamp/black_tan_base.png'));
const blinkB = decodePng(readFileSync('assets/sprites/black_french_bulldog/blink.png'));
const typingB = decodePng(readFileSync('assets/sprites/black_french_bulldog/typing.png'));
const overheatB = decodePng(readFileSync('assets/sprites/black_french_bulldog/overheat.png'));
const sleepTransB = decodePng(readFileSync('assets/sprites/black_french_bulldog/sleep-transition.png'));
const sleepB = decodePng(readFileSync('assets/sprites/black_french_bulldog/sleep.png'));

// Specific tan markings extracted directly from baseTan:
// Eyebrows, cheeks, paw tops
const TAN_ZONES = [];
for (let y = 0; y < 64; y++) {
  for (let x = 0; x < 64; x++) {
    const idx = (y * 64 + x) * 4;
    const r = baseTan.rgba[idx];
    const g = baseTan.rgba[idx+1];
    const b = baseTan.rgba[idx+2];
    const a = baseTan.rgba[idx+3];
    // Tan spots: warm tones where r > 100, g > 70, b < 110, r > g
    const isTan = (a > 200 && r > 100 && r > g && g > b && b < 100);
    // Pink inner ears:
    const isPinkEar = (a > 200 && y >= 8 && y <= 21 && r > 120 && b > 80 && g < 100);
    if (isTan || isPinkEar) {
      TAN_ZONES.push({ x, y, r, g, b, a });
    }
  }
}
console.log('Precise TAN_ZONES count:', TAN_ZONES.length);

function applyTanMarkings(targetBuf, sheetWidth, frameX, offsetY = 0) {
  for (const p of TAN_ZONES) {
    const tx = p.x + frameX;
    const ty = p.y + offsetY;
    if (tx < 0 || tx >= sheetWidth || ty < 0 || ty >= 64) continue;
    const idx = (ty * sheetWidth + tx) * 4;
    // Never paint over transparent areas (keep crisp outline)
    if (targetBuf[idx+3] < 120) continue;
    // Never paint over pure dark outlines
    if (targetBuf[idx] < 25 && targetBuf[idx+1] < 25 && targetBuf[idx+2] < 25) continue;
    targetBuf[idx] = p.r;
    targetBuf[idx+1] = p.g;
    targetBuf[idx+2] = p.b;
    targetBuf[idx+3] = p.a;
  }
}

// 1. PUPILS.PNG (64 x 64, centered at 32, 32)
const pupilRgba = Buffer.alloc(64 * 64 * 4);
function setPupilPx(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= 64 || y < 0 || y >= 64) return;
  const idx = (y * 64 + x) * 4;
  pupilRgba[idx] = r; pupilRgba[idx+1] = g; pupilRgba[idx+2] = b; pupilRgba[idx+3] = a;
}
setPupilPx(31, 31, 0xff, 0xff, 0xff, 0xff); // crisp specular spark
setPupilPx(32, 31, 0x02, 0x02, 0x03, 0xff);
setPupilPx(31, 32, 0x02, 0x02, 0x03, 0xff);
setPupilPx(32, 32, 0x02, 0x02, 0x03, 0xff);
setPupilPx(33, 32, 0x02, 0x02, 0x03, 0xee);
setPupilPx(31, 33, 0x6d, 0x84, 0xab, 0xdd); // subtle lower blue ambient shimmer
setPupilPx(32, 33, 0x6d, 0x84, 0xab, 0xee);
setPupilPx(33, 33, 0x36, 0x48, 0x66, 0xaa);

// 2. IDLE SOCKET BASE
const socketBase = Buffer.from(baseTan.rgba);
const SOCKET_COLOR = [0x15, 0x15, 0x1c, 0xff];
for (let y = 28; y <= 30; y++) {
  for (let x = 21; x <= 23; x++) {
    const idx = (y * 64 + x) * 4;
    socketBase[idx] = SOCKET_COLOR[0]; socketBase[idx+1] = SOCKET_COLOR[1]; socketBase[idx+2] = SOCKET_COLOR[2]; socketBase[idx+3] = 0xff;
  }
  for (let x = 38; x <= 40; x++) {
    const idx = (y * 64 + x) * 4;
    socketBase[idx] = SOCKET_COLOR[0]; socketBase[idx+1] = SOCKET_COLOR[1]; socketBase[idx+2] = SOCKET_COLOR[2]; socketBase[idx+3] = 0xff;
  }
}
socketBase[(31 * 64 + 21) * 4] = 0x22; socketBase[(31 * 64 + 21) * 4 + 1] = 0x22; socketBase[(31 * 64 + 21) * 4 + 2] = 0x2a;
socketBase[(31 * 64 + 22) * 4] = 0x22; socketBase[(31 * 64 + 22) * 4 + 1] = 0x22; socketBase[(31 * 64 + 22) * 4 + 2] = 0x2a;
socketBase[(31 * 64 + 38) * 4] = 0x22; socketBase[(31 * 64 + 38) * 4 + 1] = 0x22; socketBase[(31 * 64 + 38) * 4 + 2] = 0x2a;
socketBase[(31 * 64 + 39) * 4] = 0x22; socketBase[(31 * 64 + 39) * 4 + 1] = 0x22; socketBase[(31 * 64 + 39) * 4 + 2] = 0x2a;

// 3. BLINK BASE (closed eyes smile)
const blinkBase = Buffer.from(socketBase);
for (let y = 27; y <= 31; y++) {
  for (let x = 19; x <= 25; x++) {
    const idx = (y * 64 + x) * 4;
    blinkBase[idx] = blinkB.rgba[idx]; blinkBase[idx+1] = blinkB.rgba[idx+1]; blinkBase[idx+2] = blinkB.rgba[idx+2]; blinkBase[idx+3] = blinkB.rgba[idx+3];
  }
  for (let x = 36; x <= 42; x++) {
    const idx = (y * 64 + x) * 4;
    blinkBase[idx] = blinkB.rgba[idx]; blinkBase[idx+1] = blinkB.rgba[idx+1]; blinkBase[idx+2] = blinkB.rgba[idx+2]; blinkBase[idx+3] = blinkB.rgba[idx+3];
  }
}

// 4. HALF-BLINK BASE
const halfBlinkBase = Buffer.from(socketBase);
const LID_COLOR = [0x31, 0x2e, 0x3b, 0xff];
const LID_RIM = [0x1e, 0x1d, 0x28, 0xff];
for (let x = 20; x <= 24; x++) {
  const i1 = (27 * 64 + x) * 4; halfBlinkBase[i1] = LID_COLOR[0]; halfBlinkBase[i1+1] = LID_COLOR[1]; halfBlinkBase[i1+2] = LID_COLOR[2];
  const i2 = (28 * 64 + x) * 4; halfBlinkBase[i2] = LID_RIM[0]; halfBlinkBase[i2+1] = LID_RIM[1]; halfBlinkBase[i2+2] = LID_RIM[2];
}
for (let x = 37; x <= 41; x++) {
  const i1 = (27 * 64 + x) * 4; halfBlinkBase[i1] = LID_COLOR[0]; halfBlinkBase[i1+1] = LID_COLOR[1]; halfBlinkBase[i1+2] = LID_COLOR[2];
  const i2 = (28 * 64 + x) * 4; halfBlinkBase[i2] = LID_RIM[0]; halfBlinkBase[i2+1] = LID_RIM[1]; halfBlinkBase[i2+2] = LID_RIM[2];
}

// 5. ASSEMBLE IDLE.PNG (768 x 64, 12 frames)
const BREATH_DY = [0, -1, -2, -1];
const idleRgba = Buffer.alloc(768 * 64 * 4);
function copyPoseWithBreathing(dest, frameIdx, sourceBuf, dy) {
  const frameX = frameIdx * 64;
  for (let y = 0; y < 64; y++) {
    const sy = (y < 54) ? y - dy : y;
    if (sy < 0 || sy >= 64) continue;
    for (let x = 0; x < 64; x++) {
      const sIdx = (sy * 64 + x) * 4;
      const dIdx = (y * 768 + frameX + x) * 4;
      dest[dIdx] = sourceBuf[sIdx];
      dest[dIdx+1] = sourceBuf[sIdx+1];
      dest[dIdx+2] = sourceBuf[sIdx+2];
      dest[dIdx+3] = sourceBuf[sIdx+3];
    }
  }
}

for (let b = 0; b < 4; b++) {
  copyPoseWithBreathing(idleRgba, b, socketBase, BREATH_DY[b]);
  copyPoseWithBreathing(idleRgba, 4 + b, blinkBase, BREATH_DY[b]);
  copyPoseWithBreathing(idleRgba, 8 + b, halfBlinkBase, BREATH_DY[b]);
}

// 6. ASSEMBLE TYPING.PNG (192 x 64, 3 frames)
const typingRgba = Buffer.from(typingB.rgba);
for (let f = 0; f < 3; f++) {
  applyTanMarkings(typingRgba, 192, f * 64, 0);
  // Clean eye sockets in each typing frame
  for (let y = 28; y <= 30; y++) {
    for (let x = 21; x <= 23; x++) {
      const idx = (y * 192 + f * 64 + x) * 4;
      typingRgba[idx] = SOCKET_COLOR[0]; typingRgba[idx+1] = SOCKET_COLOR[1]; typingRgba[idx+2] = SOCKET_COLOR[2]; typingRgba[idx+3] = 0xff;
    }
    for (let x = 38; x <= 40; x++) {
      const idx = (y * 192 + f * 64 + x) * 4;
      typingRgba[idx] = SOCKET_COLOR[0]; typingRgba[idx+1] = SOCKET_COLOR[1]; typingRgba[idx+2] = SOCKET_COLOR[2]; typingRgba[idx+3] = 0xff;
    }
  }
  typingRgba[(31 * 192 + f * 64 + 21) * 4] = 0x22; typingRgba[(31 * 192 + f * 64 + 21) * 4 + 1] = 0x22; typingRgba[(31 * 192 + f * 64 + 21) * 4 + 2] = 0x2a;
  typingRgba[(31 * 192 + f * 64 + 22) * 4] = 0x22; typingRgba[(31 * 192 + f * 64 + 22) * 4 + 1] = 0x22; typingRgba[(31 * 192 + f * 64 + 22) * 4 + 2] = 0x2a;
  typingRgba[(31 * 192 + f * 64 + 38) * 4] = 0x22; typingRgba[(31 * 192 + f * 64 + 38) * 4 + 1] = 0x22; typingRgba[(31 * 192 + f * 64 + 38) * 4 + 2] = 0x2a;
  typingRgba[(31 * 192 + f * 64 + 39) * 4] = 0x22; typingRgba[(31 * 192 + f * 64 + 39) * 4 + 1] = 0x22; typingRgba[(31 * 192 + f * 64 + 39) * 4 + 2] = 0x2a;
}

// 7. ASSEMBLE OVERHEAT.PNG (192 x 64, 3 frames)
const overheatRgba = Buffer.from(overheatB.rgba);
for (let f = 0; f < 3; f++) {
  applyTanMarkings(overheatRgba, 192, f * 64, 0);
}

// 8. ASSEMBLE SLEEP-TRANSITION.PNG (256 x 64, 4 frames)
const sleepTransRgba = Buffer.from(sleepTransB.rgba);
for (let f = 0; f < 3; f++) {
  applyTanMarkings(sleepTransRgba, 256, f * 64, 0);
}

// 9. ASSEMBLE SLEEP.PNG (128 x 64, 2 frames)
const sleepRgba = Buffer.from(sleepB.rgba);

// Write all sheets to frenchie_revamp/
writeFileSync('assets/sprites/frenchie_revamp/pupils.png', encodePng(64, 64, pupilRgba));
writeFileSync('assets/sprites/frenchie_revamp/idle.png', encodePng(768, 64, idleRgba));
writeFileSync('assets/sprites/frenchie_revamp/typing.png', encodePng(192, 64, typingRgba));
writeFileSync('assets/sprites/frenchie_revamp/overheat.png', encodePng(192, 64, overheatRgba));
writeFileSync('assets/sprites/frenchie_revamp/sleep-transition.png', encodePng(256, 64, sleepTransRgba));
writeFileSync('assets/sprites/frenchie_revamp/sleep.png', encodePng(128, 64, sleepRgba));

console.log('Clean build complete!');
