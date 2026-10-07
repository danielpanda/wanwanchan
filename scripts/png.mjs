// Minimal RGBA PNG encoder. Shared by the tray-icon and sprite-sheet
// generators so neither needs an image library.
import { deflateSync, inflateSync } from 'node:zlib'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** @param rgba Uint8Array of width * height * 4 bytes, row-major. */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA

  // Filter type 0 (none) byte prefixed to every scanline.
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    )
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Decodes 8-bit non-interlaced RGBA PNGs (what encodePng and SpriteCook emit)
// and RGB ones (what `sips -s format png` emits, expanded to opaque RGBA),
// undoing all five scanline filters. Throws on anything else rather than
// returning garbage pixels.
export function decodePng(buf) {
  let pos = 8
  let width = 0, height = 0, bpp = 4
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    pos += 12 + len
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || (data[9] !== 6 && data[9] !== 2) || data[12] !== 0) {
        throw new Error(`decodePng: need 8-bit RGB/RGBA non-interlaced (depth ${data[8]}, colorType ${data[9]}, interlace ${data[12]})`)
      }
      bpp = data[9] === 6 ? 4 : 3
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
  }
  const src = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const px = Buffer.alloc(width * height * bpp)
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  let o = 0
  for (let y = 0; y < height; y++) {
    const filter = src[o++]
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x
      const a = x >= bpp ? px[i - bpp] : 0
      const b = y > 0 ? px[i - stride] : 0
      const c = y > 0 && x >= bpp ? px[i - stride - bpp] : 0
      const raw = src[o++]
      px[i] = filter === 1 ? raw + a
        : filter === 2 ? raw + b
        : filter === 3 ? raw + ((a + b) >> 1)
        : filter === 4 ? raw + paeth(a, b, c)
        : raw
    }
  }
  if (bpp === 4) return { width, height, rgba: px }
  const rgba = Buffer.alloc(width * height * 4, 255)
  for (let i = 0; i < width * height; i++) px.copy(rgba, i * 4, i * 3, i * 3 + 3)
  return { width, height, rgba }
}
