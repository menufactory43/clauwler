import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
const [, , log, out] = process.argv
const T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = b => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
const png = (name, W, H, rgbAt) => {
  const raw = Buffer.alloc((W * 3 + 1) * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * (W * 3 + 1) + 1 + x * 3; const c = rgbAt(x, y); raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2] }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2
  writeFileSync(`${out}/${name}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
  console.log(`wrote ${out}/${name}.png (${W}x${H})`)
}
for (const line of readFileSync(log, 'utf8').split('\n')) {
  const pm = line.match(/^PNG (\S+) (\S+)/)
  if (pm) { writeFileSync(`${out}/${pm[1]}.png`, Buffer.from(pm[2], 'base64')); console.log(`wrote ${out}/${pm[1]}.png`); continue }
  const im = line.match(/^IMG (\S+) (\d+) (\d+) (\S+)/)
  if (im) {
    const [, name, ws, hs, b64] = im
    const w = +ws, h = +hs, px = Buffer.from(b64, 'base64'), Z = 3
    png(name, w * Z, h * Z, (x, y) => { const i = (Math.floor(y / Z) * w + Math.floor(x / Z)) * 4; return [px[i], px[i + 1], px[i + 2]] })
    continue
  }
  const m = line.match(/^SNAP (\S+) (\d+) (\d+) (\S+)/)
  if (!m) continue
  const [, name, cs, rs, b64] = m
  const cols = +cs, rows = +rs
  const words = new Uint32Array(new Uint8Array(Buffer.from(b64, 'base64')).buffer)
  // A cell is about 8x16 points; a glyph lights its quarters (TL, TR, BL, BR) in ink, the rest in paper.
  const QUADS = [0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588]
  const CW = 8, CH = 16, W = cols * CW, H = rows * CH
  const raw = Buffer.alloc((W * 3 + 1) * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cell = Math.floor(y / CH) * cols + Math.floor(x / CW)
    const code = words[cell * 3]
    const mask = Math.max(0, QUADS.indexOf(code))
    const q = (x % CW < CW / 2 ? 0 : 1) + (y % CH < CH / 2 ? 0 : 2)
    const c = (mask >> q) & 1 ? words[cell * 3 + 1] : words[cell * 3 + 2]
    const i = y * (W * 3 + 1) + 1 + x * 3
    raw[i] = (c >> 16) & 255; raw[i + 1] = (c >> 8) & 255; raw[i + 2] = c & 255
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2
  writeFileSync(`${out}/${name}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
  console.log(`wrote ${out}/${name}.png (${cols}x${rows})`)
}
