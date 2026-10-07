import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { decodePng, encodePng } from './png.mjs';


// Composite neutral: frame 0 of idle.png + pupils.png at [22, 29] and [39, 29]
const idle = decodePng(readFileSync('assets/sprites/frenchie/idle.png'));
const pupils = decodePng(readFileSync('assets/sprites/frenchie/pupils.png'));

const comp = Buffer.alloc(64 * 64 * 4);
for (let y = 0; y < 64; y++) {
  for (let x = 0; x < 64; x++) {
    const sIdx = (y * 768 + x) * 4;
    const dIdx = (y * 64 + x) * 4;
    comp[dIdx] = idle.rgba[sIdx];
    comp[dIdx+1] = idle.rgba[sIdx+1];
    comp[dIdx+2] = idle.rgba[sIdx+2];
    comp[dIdx+3] = idle.rgba[sIdx+3];
  }
}
// Composite pupils
for (const [ex, ey] of [[22, 29], [39, 29]]) {
  for (let sy = 0; sy < 64; sy++) {
    for (let sx = 0; sx < 64; sx++) {
      const pIdx = (sy * 64 + sx) * 4;
      const a = pupils.rgba[pIdx+3];
      if (a === 0) continue;
      const dx = ex - 32 + sx;
      const dy = ey - 32 + sy;
      if (dx < 0 || dx >= 64 || dy < 0 || dy >= 64) continue;
      const cIdx = (dy * 64 + dx) * 4;
      const alpha = a / 255;
      comp[cIdx] = Math.round(pupils.rgba[pIdx] * alpha + comp[cIdx] * (1 - alpha));
      comp[cIdx+1] = Math.round(pupils.rgba[pIdx+1] * alpha + comp[cIdx+1] * (1 - alpha));
      comp[cIdx+2] = Math.round(pupils.rgba[pIdx+2] * alpha + comp[cIdx+2] * (1 - alpha));
      comp[cIdx+3] = 255;
    }
  }
}

function nearestResize(src, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(Math.floor(y * yRatio), srcH - 1);
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(Math.floor(x * xRatio), srcW - 1);
      const sIdx = (sy * srcW + sx) * 4;
      const dIdx = (y * dstW + x) * 4;
      dst[dIdx] = src[sIdx];
      dst[dIdx+1] = src[sIdx+1];
      dst[dIdx+2] = src[sIdx+2];
      dst[dIdx+3] = src[sIdx+3];
    }
  }
  return dst;
}

const iconsetDir = 'build/icon.iconset';
rmSync('build', { recursive: true, force: true });
mkdirSync(iconsetDir, { recursive: true });

const sizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

for (const { name, size } of sizes) {
  const resized = nearestResize(comp, 64, 64, size, size);
  import('node:fs').then(fs => {
    fs.writeFileSync(`${iconsetDir}/${name}`, encodePng(size, size, resized));
  });
}
