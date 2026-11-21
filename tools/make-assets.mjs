// Generates the default pixel cat sprite sheet, sprite.json, app icon and tray icon.
// Usage: node tools/make-assets.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- PNG encoder ----------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- palette ----------
const PAL = {
  O: [92, 54, 58], // soft outline
  b: [250, 178, 104], // orange base
  d: [226, 134, 70], // stripes / shade
  f: [196, 112, 54],
  l: [255, 238, 210], // cream
  p: [255, 150, 172], // pink
  P: [255, 122, 150], // blush
  e: [52, 34, 60], // eye
  w: [255, 255, 255],
  r: [235, 70, 80],
  h: [255, 88, 120], // heart
  y: [255, 218, 80],
  g: [206, 212, 224],
  G: [118, 124, 142],
  c: [120, 176, 255],
  B: [90, 60, 40],
};

const S = 32;
class Layer {
  constructor(w = S, h = S) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  ell(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
  }
  // triangle ear: apex at (ax, ay), grows downward to base width bw at ay+h-1, dir = +1 leans right
  ear(ax, ay, h, bw, c) {
    for (let j = 0; j < h; j++) {
      const w = Math.max(1, Math.round(((j + 1) / h) * bw));
      this.rect(ax - Math.floor(w / 2) + Math.round(j * 0.0), ay + j, w, 1, c);
    }
  }
  line(x0, y0, x1, y1, c, t = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      this.rect(Math.round(x), Math.round(y), t, t, c);
    }
  }
  outline(color = "O") {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x + 1, y) || this.get(x - 1, y) || this.get(x, y + 1) || this.get(x, y - 1)) add.push([x, y]);
      }
    for (const [x, y] of add) this.set(x, y, color);
  }
  over(top) {
    for (let i = 0; i < this.px.length; i++) if (top.px[i]) this.px[i] = top.px[i];
  }
}

// ---------- cat drawing (chibi, front-facing; direction is shown by head/pupil lean + mirroring) ----------
const hcxBase = 16;
function cat(p = {}) {
  const d = {
    pose: "stand", oy: 0, hx: 0, hy: 0, bodyDx: 0, bw: 7.5, bh: 5, bodyY: 24.5,
    eye: "open", pupil: [0, 0], mouth: "smile", blush: 1,
    paws: [0, 0], pawDx: [0, 0], pawsUp: 0, hang: 0,
    tail: 0, tailUp: 0, ear: [0, 0], tailFront: false, tongue: false, groomPaw: -1,
    ...p,
  };
  const L = new Layer();
  const hcx = hcxBase + d.hx, hcy = 12.5 + d.hy + d.oy;
  const by = d.bodyY + d.oy;

  const tail = () => {
    // tail on the left, white tip
    const sway = Math.round(d.tail * 2);
    const tipX = 3 + sway, tipY = 17 - Math.round(d.tailUp * 5) + (d.pose === "sit" ? 5 : 0);
    L.line(9, Math.round(by + 1), 5, Math.round(by - 1), "b", 2);
    L.line(5, Math.round(by - 1), tipX, tipY + 3, "b", 2);
    L.line(tipX, tipY + 3, tipX, tipY, "b", 2);
    L.rect(tipX, tipY, 2, 2, "l");
  };

  if (d.pose === "sleep") {
    const sy = 26 + d.oy;
    L.line(27, sy + 1, 29, sy - 3, "b", 2); // tail along the right
    L.rect(29, sy - 4, 2, 2, "l");
    L.ell(16, sy, 12.5, 4.8, "b");
    L.ell(16, sy + 1.5, 9, 2.5, "l");
    drawHead(L, 16, 19 + d.oy, { ...d, eye: "closed", mouth: "smile", hx: 0 }, true);
    L.rect(8, sy + 2, 4, 2, "l");
    L.rect(20, sy + 2, 4, 2, "l");
    L.outline();
    return L;
  }

  if (!d.tailFront) tail();
  if (d.pose === "sit") L.ell(16 + d.bodyDx, by, 6.8, 6.2, "b"), L.ell(16 + d.bodyDx, by + 1.5, 4.3, 4, "l");
  else L.ell(16 + d.bodyDx, by, d.bw, d.bh, "b"), L.ell(16 + d.bodyDx, by + 1.5, d.bw - 3, d.bh - 2, "l");

  // paws / feet
  if (d.hang) {
    for (const sx of [11, 19]) L.rect(sx + d.bodyDx + (sx === 11 ? -d.hang * 0 : 0), by + 3, 2, 31 - Math.round(by + 3), "b"), L.rect(sx, 29, 3, 2, "l");
  } else if (d.pose === "sit") {
    L.ell(13.5, 28.6, 2.4, 1.8, "w");
    L.ell(18.5, 28.6, 2.4, 1.8, "w");
  } else {
    L.ell(11.5 + d.pawDx[0], 28.4 - d.paws[0], 2.5, 1.9, "w");
    L.ell(20.5 + d.pawDx[1], 28.4 - d.paws[1], 2.5, 1.9, "w");
  }
  if (d.tailFront) {
    L.line(24, 29, 18, 30, "b", 2);
    L.rect(16, 29, 2, 2, "l");
  }
  drawHead(L, hcx, hcy, d, false);
  if (d.pawsUp) {
    // little arms raised beside the face
    const up = d.pawsUp;
    L.ell(hcx - 12, hcy + 1 - up, 2, 3, "b");
    L.ell(hcx + 12, hcy + 1 - up, 2, 3, "b");
    L.rect(hcx - 13, hcy - 2 - up, 3, 2, "l");
    L.rect(hcx + 11, hcy - 2 - up, 3, 2, "l");
  }
  if (d.groomPaw >= 0) {
    const gy = d.groomPaw;
    L.ell(hcx + 7, hcy + 3 - gy, 2.2, 3, "b");
    L.rect(hcx + 6, hcy + 1 - gy, 3, 2, "l");
  }
  L.outline();
  // whiskers (drawn after outline so they stay thin)
  const wy = Math.round(hcy + 3);
  for (const [x, y] of [[hcx - 13, wy], [hcx - 12, wy], [hcx - 13, wy + 2], [hcx - 12, wy + 2], [hcx + 12, wy], [hcx + 13, wy], [hcx + 12, wy + 2], [hcx + 13, wy + 2]]) if (!L.get(x, y)) L.set(x, y, "d");
  return L;
}

function drawHead(L, hcx, hcy, d, flat) {
  // ears (drawn first so the head overlaps their base)
  const [el, er] = d.ear;
  L.ear(hcx - 8 + Math.min(0, el) * 2, hcy - 12 + Math.max(0, -el) * 0 + Math.max(0, el) * 2, 7, 7, "b");
  L.ear(hcx + 8 + Math.max(0, er) * 2 * 0 - Math.min(0, er) * 0 + Math.abs(Math.min(0, er)) * 0 + Math.max(0, er) * 2, hcy - 12 + Math.max(0, er) * 2, 7, 7, "b");
  L.ear(hcx - 8, hcy - 10 + Math.max(0, el) * 2, 4, 3, "p");
  L.ear(hcx + 8, hcy - 10 + Math.max(0, er) * 2, 4, 3, "p");
  L.ell(hcx, hcy, 11, flat ? 7 : 8.5, "b");
  L.ell(hcx - 9, hcy + 3, 3, 2.6, "b");
  L.ell(hcx + 9, hcy + 3, 3, 2.6, "b");
  L.ell(hcx, hcy + 4, 4.3, 2.9, "l");
  for (const sx of [-4, -1, 0, 3]) L.rect(hcx + sx, hcy - 8, 1, 2, "d");
  // blush
  for (let i = 0; i < d.blush; i++) {
    L.rect(hcx - 10, hcy + 3 + i, 3, 1, "P");
    L.rect(hcx + 7, hcy + 3 + i, 3, 1, "P");
  }
  // eyes
  const [px, py] = d.pupil;
  const ey = Math.round(hcy - 1);
  const eyeAt = (x, side) => {
    x = Math.round(x);
    const ox = Math.max(-1, Math.min(1, px)), oy = Math.max(-1, Math.min(1, py));
    switch (d.eye) {
      case "open":
        L.rect(x + ox, ey + oy, 3, 4, "e");
        L.set(x + ox, ey + oy, "w");
        L.set(x + ox + 2, ey + oy + 3, "w");
        break;
      case "wide":
        L.rect(x - 1, ey - 1, 5, 6, "w");
        L.rect(x + ox, ey + oy, 3, 4, "e");
        L.set(x + ox, ey + oy, "w");
        break;
      case "half":
        L.rect(x, ey + 2, 3, 2, "e");
        L.rect(x, ey + 1, 3, 1, "d");
        break;
      case "closed":
        L.set(x, ey + 2, "e"); L.set(x + 1, ey + 3, "e"); L.set(x + 2, ey + 2, "e");
        break;
      case "happy":
        L.set(x, ey + 3, "e"); L.set(x + 1, ey + 2, "e"); L.set(x + 2, ey + 3, "e");
        L.set(x + 1, ey + 1, "e");
        break;
      case "sad":
        L.rect(x, ey + 1, 3, 4, "e");
        L.set(x, ey + 1, "w");
        L.set(side < 0 ? x : x + 2, ey, "d");
        L.set(side < 0 ? x + 1 : x + 1, ey - 1, "d");
        L.set(x + 1, ey + 5, "c");
        break;
      case "squeeze":
        if (side < 0) { L.set(x, ey + 1, "e"); L.set(x + 1, ey + 2, "e"); L.set(x + 2, ey + 3, "e"); L.set(x + 1, ey + 3, "e"); L.set(x, ey + 4, "e"); }
        else { L.set(x + 2, ey + 1, "e"); L.set(x + 1, ey + 2, "e"); L.set(x, ey + 3, "e"); L.set(x + 1, ey + 3, "e"); L.set(x + 2, ey + 4, "e"); }
        break;
    }
  };
  eyeAt(hcx - 6, -1);
  eyeAt(hcx + 3, 1);
  // nose + mouth
  const nx = Math.round(hcx) - 1, ny = Math.round(hcy + 3);
  L.rect(nx, ny, 2, 1, "p");
  switch (d.mouth) {
    case "smile": L.set(nx - 1, ny + 1, "e"); L.set(nx, ny + 2, "e"); L.set(nx + 1, ny + 2, "e"); L.set(nx + 2, ny + 1, "e"); break;
    case "open": L.rect(nx - 1, ny + 1, 4, 3, "e"); L.rect(nx, ny + 3, 2, 1, "p"); break;
    case "big": L.rect(nx - 2, ny + 1, 6, 5, "e"); L.rect(nx - 1, ny + 4, 4, 2, "p"); break;
    case "o": L.rect(nx, ny + 1, 2, 2, "e"); break;
    case "frown": L.set(nx - 1, ny + 2, "e"); L.set(nx, ny + 1, "e"); L.set(nx + 1, ny + 1, "e"); L.set(nx + 2, ny + 2, "e"); break;
  }
  if (d.tongue) L.rect(nx + 1, ny + 3, 2, 2, "p");
}

// ---------- deco layers ----------
function bubble(dots) {
  const D = new Layer();
  const x = 19, y = 0;
  D.rect(x, y, 12, 7, "w");
  D.set(x, y, null); D.set(x + 11, y, null); D.set(x, y + 6, null); D.set(x + 11, y + 6, null);
  D.set(x + 1, y + 7, "w"); D.set(x, y + 8, "w");
  for (let i = 0; i < dots; i++) D.rect(x + 2 + i * 3, y + 3, 2, 2, "G");
  D.outline();
  return D;
}
function zzz(t) {
  const D = new Layer();
  const z = (x, y, s) => { D.rect(x, y, s, 1, "c"); D.line(x + s - 1, y, x, y + s - 1, "c"); D.rect(x, y + s - 1, s, 1, "c"); };
  z(23 + t, 9 - t, 3);
  z(27 + t, 3 - t, 4 - (t ? 1 : 0));
  return D;
}
function laptop() {
  const D = new Layer();
  D.rect(6, 24, 20, 7, "g");
  D.rect(7, 25, 18, 5, "G");
  D.rect(15, 26, 2, 2, "w");
  D.outline();
  return D;
}
function heart(x, y) {
  const D = new Layer();
  for (const [dx, dy] of [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]]) D.set(x + dx, y + dy, "h");
  return D;
}
function hearts(t) {
  const D = new Layer();
  const pos = [[[1, 5], [25, 2]], [[2, 3], [26, 0]], [[0, 6], [24, 4]]][t];
  for (const [x, y] of pos) D.over(heart(x, y));
  return D;
}
function stars(t) {
  const D = new Layer();
  const sp = (x, y) => { D.set(x, y, "y"); D.set(x - 1, y, "y"); D.set(x + 1, y, "y"); D.set(x, y - 1, "y"); D.set(x, y + 1, "y"); };
  if (t === 0) { sp(6, 7); sp(26, 8); sp(16, 2); } else { sp(8, 4); sp(24, 5); sp(16, 4); }
  return D;
}
function sweat() {
  const D = new Layer();
  D.rect(28, 7, 2, 3, "c"); D.set(28, 6, "c"); D.set(29, 10, "c");
  return D;
}
function lines() {
  const D = new Layer();
  for (const y of [18, 22, 26]) D.rect(0, y, 3, 1, "g");
  return D;
}
function sparkle(t) {
  const D = new Layer();
  const sp = (x, y) => { D.set(x, y, "y"); D.set(x - 1, y, "y"); D.set(x + 1, y, "y"); D.set(x, y - 1, "y"); D.set(x, y + 1, "y"); };
  if (t === 0) { sp(3, 4); sp(29, 6); } else if (t === 1) { sp(2, 8); sp(29, 3); } else { sp(4, 2); sp(28, 9); }
  return D;
}
function fr(c, front = [], back = []) {
  const f = new Layer();
  for (const b of back) f.over(b);
  f.over(c);
  for (const x of front) f.over(x);
  return f;
}

// ---------- animation definitions ----------
const anims = [];
const add = (name, fps, loop, frames) => anims.push({ name, fps, loop, frames });
const P = (o) => fr(cat(o));

add("idle", 3, true, [P({ tail: 0, tailUp: 0.3 }), P({ hy: 1, tail: 1, tailUp: 0.5, bh: 4.6, ear: [0, 1] })]);
add("blink", 14, false, [P({ eye: "half" }), P({ eye: "closed" }), P({ eye: "half" })]);
const wp = [
  { paws: [2, 0], hx: -1, oy: 0, tail: -1, bodyDx: -1 },
  { paws: [0, 0], hx: 0, oy: -1, tail: 0 },
  { paws: [0, 2], hx: 1, oy: 0, tail: 1, bodyDx: 1 },
  { paws: [0, 0], hx: 0, oy: -1, tail: 0 },
];
add("walk", 8, true, wp.map((o) => P({ pupil: [1, 0], tailUp: 0.5, ...o, hx: o.hx + 1 })));
const rp = [
  { paws: [3, 0], pawDx: [-2, 2] }, { paws: [1, 1], pawDx: [0, 0], oy: -2 }, { paws: [0, 3], pawDx: [2, -2] }, { paws: [1, 1], pawDx: [0, 0], oy: -2 },
];
add("run", 12, true, rp.map((o, i) => fr(cat({ eye: "wide", pupil: [1, 0], mouth: "open", hx: 2, hy: 1, bw: 8.5, bh: 4.4, bodyY: 25, tail: i % 2 ? -1 : 1, tailUp: 0, ear: [0, 0], ...o }), [lines()])));
add("sit", 2, true, [P({ pose: "sit", tail: 0 }), P({ pose: "sit", tail: 1, hy: 1 })]);
add("sleep", 1.5, true, [fr(cat({ pose: "sleep" }), [zzz(0)]), fr(cat({ pose: "sleep", oy: 1 }), [zzz(1)])]);
add("look", 3, true, [P({ pupil: [1, 0], hx: 1 }), P({ pupil: [1, -1], hx: 1, hy: -1, eye: "wide" }), P({ pupil: [1, 0], hx: 1 }), P({ pupil: [1, 1], hx: 1, hy: 1 })]);
add("typing", 8, true, [0, 1, 2, 3].map((i) => {
  const L = cat({ pupil: [0, 1], hy: 1, tail: i % 2 ? 1 : -1, ear: [i === 1 ? 1 : 0, i === 3 ? 1 : 0] });
  const D = laptop();
  const up = (i % 2 === 0 ? 0 : 1);
  D.rect(10, 21 - up, 4, 3, "l"); D.rect(18, 21 - (1 - up), 4, 3, "l");
  D.outline();
  return fr(L, [D]);
}));
add("jump", 10, false, [
  P({ bh: 3.6, bw: 9, bodyY: 26, hy: 2, eye: "closed", paws: [0, 0] }),
  P({ oy: -1, eye: "wide", mouth: "open", paws: [2, 2], pawsUp: 2, tailUp: 0.8 }),
  P({ oy: -1, eye: "happy", mouth: "big", paws: [3, 3], pawsUp: 3, tailUp: 1, blush: 2 }),
  P({ bh: 4, bw: 8.8, bodyY: 25.5, hy: 1, eye: "closed" }),
]);
add("happy", 6, true, [
  fr(cat({ eye: "happy", mouth: "open", blush: 2, pawsUp: 1, tail: 1, tailUp: 1 }), [hearts(0)]),
  fr(cat({ eye: "happy", mouth: "open", blush: 2, pawsUp: 2, oy: -2, tail: -1, tailUp: 1, paws: [1, 1] }), [hearts(1)]),
  fr(cat({ eye: "happy", mouth: "open", blush: 2, pawsUp: 1, tail: 1, tailUp: 1 }), [hearts(2)]),
]);
add("thinking", 3, true, [1, 2, 3].map((n, i) => fr(cat({ pose: "sit", pupil: [1, -1], hx: 2, mouth: "o", tail: i % 2 }), [bubble(n)])));
add("drag", 5, true, [
  P({ hang: 1, bh: 4, bodyY: 22, oy: -1, eye: "wide", pupil: [0, -1], mouth: "o", tail: -1, tailUp: -0.4, ear: [1, 1] }),
  fr(cat({ hang: 1, bh: 4, bodyY: 22, oy: -1, bodyDx: 1, eye: "wide", pupil: [0, -1], mouth: "o", tail: 1, tailUp: -0.4, ear: [1, 1] })),
]);
add("drop", 8, false, [
  fr(cat({ bh: 3.2, bw: 10, bodyY: 26.5, hy: 3, eye: "squeeze", mouth: "o", blush: 2, paws: [0, 0] }), [stars(0)]),
  fr(cat({ bh: 4, bw: 9, bodyY: 25.5, hy: 1, eye: "half", blush: 2 }), [stars(1)]),
]);
add("error", 3, true, [
  fr(cat({ pose: "sit", eye: "sad", mouth: "frown", ear: [1, 1], tail: 0 }), [sweat()]),
  fr(cat({ pose: "sit", eye: "sad", mouth: "frown", ear: [1, 1], tail: 1, hy: 1 }), [sweat()]),
]);
add("groom", 5, true, [0, 1, 2, 3].map((i) => fr(cat({ pose: "sit", eye: "closed", mouth: i % 2 ? "o" : "smile", tongue: i % 2 === 1, groomPaw: i % 2 ? 2 : 0, tail: i % 2, hx: 1 }))));
add("stretch", 4, false, [
  P({ bh: 4, bw: 8.8, bodyY: 26, hy: 2, eye: "closed", paws: [0, 0] }),
  P({ bh: 6.5, bw: 6.2, bodyY: 23, oy: -1, eye: "squeeze", mouth: "big", pawsUp: 3, paws: [2, 2], tailUp: 1 }),
  P({ eye: "closed", mouth: "smile", pawsUp: 1, blush: 2 }),
]);
add("yawn", 3, false, [
  P({ eye: "half", mouth: "open" }),
  P({ eye: "closed", mouth: "big", hy: -1, ear: [0, 0] }),
  P({ eye: "closed", mouth: "big", hy: -1 }),
]);
add("wiggle", 8, true, [-1, 0, 1].map((dx, i) => P({ bh: 3.8, bw: 9, bodyY: 26, hy: 2, eye: "wide", pupil: [1, 0], bodyDx: dx, tail: dx, tailUp: 0.9, ear: [0, 0], hx: dx })));

// ---------- sheet ----------
const COLS = 8;
const total = anims.reduce((n, a) => n + a.frames.length, 0);
const ROWS = Math.ceil(total / COLS);
const sheetW = COLS * S,
  sheetH = ROWS * S;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
let idx = 0;
const json = {
  name: "Pixel Cat",
  frameWidth: S,
  frameHeight: S,
  anchor: { x: 0.5, y: 1 },
  animations: {},
  states: {},
};
for (const a of anims) {
  json.animations[a.name] = { start: idx, count: a.frames.length, fps: a.fps, loop: a.loop };
  json.states[a.name] = a.name;
  for (const f of a.frames) {
    const cx = (idx % COLS) * S,
      cy = Math.floor(idx / COLS) * S;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const k = f.get(x, y);
        if (!k) continue;
        const [r, g, b] = PAL[k];
        const o = ((cy + y) * sheetW + cx + x) * 4;
        sheet[o] = r;
        sheet[o + 1] = g;
        sheet[o + 2] = b;
        sheet[o + 3] = 255;
      }
    idx++;
  }
}
mkdirSync(resolve(root, "public/characters/cat"), { recursive: true });
writeFileSync(resolve(root, "public/characters/cat/sheet.png"), encodePNG(sheetW, sheetH, sheet));
writeFileSync(resolve(root, "public/characters/cat/sprite.json"), JSON.stringify(json, null, 2) + "\n");

// preview (8x) for eyeballing
{
  const k = 6;
  const pw = sheetW * k,
    ph = sheetH * k;
  const pv = Buffer.alloc(pw * ph * 4);
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      const sx = Math.floor(x / k),
        sy = Math.floor(y / k);
      const checker = ((Math.floor(x / 24) + Math.floor(y / 24)) & 1) === 0 ? 235 : 250;
      const o = (y * pw + x) * 4;
      const so = (sy * sheetW + sx) * 4;
      const a = sheet[so + 3] / 255;
      for (let c = 0; c < 3; c++) pv[o + c] = Math.round(sheet[so + c] * a + checker * (1 - a));
      pv[o + 3] = 255;
    }
  if (process.argv[2]) writeFileSync(process.argv[2], encodePNG(pw, ph, pv));
}

// ---------- icons ----------
function faceLayer() {
  return fr(cat({ blush: 2 }));
}
{
  const N = 1024;
  const img = Buffer.alloc(N * N * 4);
  const inset = 100,
    size = N - inset * 2,
    rad = 185;
  const inside = (x, y) => {
    const x0 = inset,
      y0 = inset,
      x1 = inset + size,
      y1 = inset + size;
    if (x < x0 || y < y0 || x >= x1 || y >= y1) return false;
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
  };
  const face = faceLayer();
  const k = 22;
  const off = Math.round((N - S * k) / 2);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!inside(x, y)) continue;
      const t = (y - inset) / size;
      let col = [Math.round(255 - 30 * t), Math.round(226 - 50 * t), Math.round(196 - 60 * t)];
      const fx = Math.floor((x - off) / k),
        fy = Math.floor((y - off) / k);
      const c = fx >= 0 && fy >= 0 && fx < S && fy < S ? face.get(fx, fy) : null;
      if (c) col = PAL[c];
      const o = (y * N + x) * 4;
      img[o] = col[0];
      img[o + 1] = col[1];
      img[o + 2] = col[2];
      img[o + 3] = 255;
    }
  mkdirSync(resolve(root, "src-tauri/icons"), { recursive: true });
  writeFileSync(resolve(root, "src-tauri/icons/source.png"), encodePNG(N, N, img));
}
{
  // tray template: black silhouette on 22x22 grid, drawn at 2x => 44x44
  const T = new Layer(22, 22);
  T.ear(5, 3, 5, 5, "O");
  T.ear(16, 3, 5, 5, "O");
  T.ell(11, 12, 9, 7.5, "O");
  // eye holes + nose hole
  for (const [x, y] of [
    [7, 11],
    [8, 11],
    [7, 12],
    [8, 12],
    [14, 11],
    [15, 11],
    [14, 12],
    [15, 12],
    [10, 14],
    [11, 14],
  ])
    T.set(x, y, null);
  const k = 2;
  const N = 22 * k;
  const img = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (T.get(Math.floor(x / k), Math.floor(y / k))) img[(y * N + x) * 4 + 3] = 255;
  writeFileSync(resolve(root, "src-tauri/icons/tray.png"), encodePNG(N, N, img));
}
console.log(`sheet ${sheetW}x${sheetH}, ${total} frames, ${anims.length} animations`);
