/**
 * A small PNG encoder: the frame as RGB rows, each filtered against the pixel
 * to its left, squeezed with LZ77 and deflate's fixed Huffman codes. Pixel art
 * repeats itself, so a frame shrinks several times over before it crosses the
 * terminal. No zlib in a mod's world, hence this.
 */

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = CRC[(c ^ bytes[i]!) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array, len: number): number {
  let a = 1
  let b = 0
  for (let i = 0; i < len;) {
    const end = Math.min(len, i + 5552)
    for (; i < end; i++) {
      a += bytes[i]!
      b += a
    }
    a %= 65521
    b %= 65521
  }
  return ((b << 16) | a) >>> 0
}

// Deflate's fixed codes, bit-reversed for the least-significant-first stream.
const reverse = (code: number, len: number) => {
  let r = 0
  for (let i = 0; i < len; i++) r = (r << 1) | ((code >> i) & 1)
  return r
}
const LIT_CODE = new Uint16Array(288)
const LIT_LEN = new Uint8Array(288)
for (let n = 0; n < 288; n++) {
  const [base, len, first] = n < 144 ? [0x30, 8, 0] : n < 256 ? [0x190, 9, 144] : n < 280 ? [0, 7, 256] : [0xc0, 8, 280]
  LIT_CODE[n] = reverse(base + n - first, len)
  LIT_LEN[n] = len
}
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
const LEN_SYM = new Uint8Array(259)
for (let s = 0; s < 29; s++) for (let l = LEN_BASE[s]!; l < (LEN_BASE[s + 1] ?? 259); l++) LEN_SYM[l] = s
LEN_SYM[258] = 28
const DIST_SYM = new Uint8Array(32769)
for (let s = 0; s < 30; s++) for (let d = DIST_BASE[s]!; d < (DIST_BASE[s + 1] ?? 32769); d++) DIST_SYM[d] = s
const DIST_CODE = Uint8Array.from({ length: 30 }, (_, s) => reverse(s, 5))

let out = new Uint8Array(0)
let pos = 0
let bitBuf = 0
let bitCount = 0

function bits(value: number, count: number) {
  bitBuf |= value << bitCount
  bitCount += count
  while (bitCount >= 8) {
    out[pos++] = bitBuf & 255
    bitBuf >>>= 8
    bitCount -= 8
  }
}

function matchLen(data: Uint8Array, at: number, i: number, max: number): number {
  let l = 0
  while (l < max && data[at + l] === data[i + l]) l++
  return l
}

const HASH_BITS = 15
const head = new Int32Array(1 << HASH_BITS)

/** One fixed-Huffman deflate block over `data[0..len)`. */
function deflate(data: Uint8Array, len: number) {
  head.fill(-1)
  bits(1, 1) // the last block
  bits(1, 2) // fixed codes
  let i = 0
  while (i < len) {
    let best = 0
    let dist = 0
    if (i + 3 <= len) {
      const h = ((data[i]! << 10) ^ (data[i + 1]! << 5) ^ data[i + 2]!) & ((1 << HASH_BITS) - 1)
      const cand = head[h]!
      head[h] = i
      // The pixel just left is the likeliest match in pixel art; then the hashed one.
      const max = Math.min(258, len - i)
      if (i >= 3) {
        best = matchLen(data, i - 3, i, max)
        dist = 3
      }
      if (cand >= 0 && cand < i - 3 && i - cand <= 32768) {
        const l = matchLen(data, cand, i, max)
        if (l > best) { best = l; dist = i - cand }
      }
    }
    if (best >= 3) {
      const ls = LEN_SYM[best]!
      bits(LIT_CODE[257 + ls]!, LIT_LEN[257 + ls]!)
      if (LEN_EXTRA[ls]) bits(best - LEN_BASE[ls]!, LEN_EXTRA[ls]!)
      const ds = DIST_SYM[dist]!
      bits(DIST_CODE[ds]!, 5)
      if (DIST_EXTRA[ds]) bits(dist - DIST_BASE[ds]!, DIST_EXTRA[ds]!)
      // Index a few of the skipped positions so later runs still find them.
      const end = i + best
      for (let j = i + 1; j < end && j + 3 <= len; j += best > 32 ? 8 : 1) head[((data[j]! << 10) ^ (data[j + 1]! << 5) ^ data[j + 2]!) & ((1 << HASH_BITS) - 1)] = j
      i = end
    } else {
      bits(LIT_CODE[data[i]!]!, LIT_LEN[data[i]!]!)
      i++
    }
  }
  bits(LIT_CODE[256]!, LIT_LEN[256]!)
  if (bitCount > 0) bits(0, 8 - bitCount)
}

let raw = new Uint8Array(0)

function chunk(type: string, start: number) {
  // The length was reserved at `start`; the type follows, then the data up to `pos`.
  const len = pos - start - 8
  out[start] = len >>> 24; out[start + 1] = (len >>> 16) & 255; out[start + 2] = (len >>> 8) & 255; out[start + 3] = len & 255
  for (let k = 0; k < 4; k++) out[start + 4 + k] = type.charCodeAt(k)
  const c = crc32(out, start + 4, pos)
  out[pos++] = c >>> 24; out[pos++] = (c >>> 16) & 255; out[pos++] = (c >>> 8) & 255; out[pos++] = c & 255
}

/** RGBA pixels to a whole PNG file (RGB, the alpha dropped). The returned bytes are reused by the next call. */
export function encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 3 + 1
  const rawLen = stride * height
  if (raw.length < rawLen) raw = new Uint8Array(rawLen)
  // Each row filtered Sub (less the pixel to the left) or Up (less the pixel above),
  // whichever leaves it closer to zero on a sample of every fourth pixel.
  for (let y = 0; y < height; y++) {
    const r = y * stride
    let sub = 0
    let up = 0
    for (let x = 0; x < width * 4; x += 16) {
      const s = y * width * 4 + x
      for (let c = 0; c < 3; c++) {
        const v = rgba[s + c]!
        const a = x ? rgba[s + c - 4]! : 0
        const b = y ? rgba[s + c - width * 4]! : 0
        sub += Math.abs(((v - a + 128) & 255) - 128)
        up += Math.abs(((v - b + 128) & 255) - 128)
      }
    }
    const isUp = y > 0 && up < sub
    raw[r] = isUp ? 2 : 1
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4
      const d = r + 1 + x * 3
      const o = isUp ? s - width * 4 : s - 4
      const has = isUp || x > 0
      raw[d] = (rgba[s]! - (has ? rgba[o]! : 0)) & 255
      raw[d + 1] = (rgba[s + 1]! - (has ? rgba[o + 1]! : 0)) & 255
      raw[d + 2] = (rgba[s + 2]! - (has ? rgba[o + 2]! : 0)) & 255
    }
  }
  return writePng(raw, rawLen, width, height, 2)
}

function writePng(raw: Uint8Array, rawLen: number, width: number, height: number, colorType: number, palette?: Uint8Array): Uint8Array {
  const cap = rawLen + (rawLen >> 2) + 1024
  if (out.length < cap) out = new Uint8Array(cap)
  pos = 0
  bitBuf = 0
  bitCount = 0
  for (const b of [137, 80, 78, 71, 13, 10, 26, 10]) out[pos++] = b
  let start = pos
  pos += 8
  const ihdr = [width >>> 24, (width >>> 16) & 255, (width >>> 8) & 255, width & 255, height >>> 24, (height >>> 16) & 255, (height >>> 8) & 255, height & 255, 8, colorType, 0, 0, 0]
  for (const b of ihdr) out[pos++] = b
  chunk('IHDR', start)
  if (palette) {
    start = pos
    pos += 8
    out.set(palette, pos)
    pos += palette.length
    chunk('PLTE', start)
  }
  start = pos
  pos += 8
  out[pos++] = 0x78
  out[pos++] = 0x01
  deflate(raw, rawLen)
  const ad = adler32(raw, rawLen)
  out[pos++] = ad >>> 24; out[pos++] = (ad >>> 16) & 255; out[pos++] = (ad >>> 8) & 255; out[pos++] = ad & 255
  chunk('IDAT', start)
  start = pos
  pos += 8
  chunk('IEND', start)
  return out.subarray(0, pos)
}

// ---------- 256 colours: a third of the bytes ----------

const hist = new Uint32Array(32768)
const sumR = new Float64Array(32768)
const sumG = new Float64Array(32768)
const sumB = new Float64Array(32768)
const lut = new Uint8Array(32768)
let indexRaw = new Uint8Array(0)
const lutGen = new Int32Array(32768)
let gen = 0
let paletteGen = -1
let paletteAge = 0
let lastPalette: Uint8Array | null = null

function nearest(palette: Uint8Array, r: number, g: number, b: number): number {
  let best = 0
  let bd = Infinity
  for (let k = 0; k < palette.length; k += 3) {
    const d = (palette[k]! - r) ** 2 + (palette[k + 1]! - g) ** 2 + (palette[k + 2]! - b) ** 2
    if (d < bd) { bd = d; best = k / 3 }
  }
  return best
}

type Box = { cells: number[]; count: number; score: number; axis: number }

function boxOf(cells: number[]): Box {
  let count = 0
  const lo = [31, 31, 31]
  const hi = [0, 0, 0]
  for (const c of cells) {
    count += hist[c]!
    const ch = [c >> 10, (c >> 5) & 31, c & 31]
    for (let k = 0; k < 3; k++) {
      if (ch[k]! < lo[k]!) lo[k] = ch[k]!
      if (ch[k]! > hi[k]!) hi[k] = ch[k]!
    }
  }
  const range = [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!]
  const axis = range[1]! >= range[0]! && range[1]! >= range[2]! ? 1 : range[0]! >= range[2]! ? 0 : 2
  return { cells, count, score: cells.length > 1 ? Math.max(...range) * Math.sqrt(count) : -1, axis }
}

/**
 * The frame cut to its 256 likeliest colours (median cut over 15-bit buckets,
 * each colour the mean of what fell in it) and written as an indexed PNG.
 */
function buildPalette(rgba: Uint8Array, n: number) {
  hist.fill(0)
  sumR.fill(0)
  sumG.fill(0)
  sumB.fill(0)
  for (let i = 0, p = 0; p < n; p++, i += 4) {
    const r = rgba[i]!
    const g = rgba[i + 1]!
    const b = rgba[i + 2]!
    const c = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    hist[c]!++
    sumR[c] = sumR[c]! + r
    sumG[c] = sumG[c]! + g
    sumB[c] = sumB[c]! + b
  }
  const used: number[] = []
  for (let c = 0; c < 32768; c++) if (hist[c]) used.push(c)
  const boxes: Box[] = [boxOf(used)]
  while (boxes.length < 256) {
    let best = -1
    for (let i = 0; i < boxes.length; i++) if (boxes[i]!.score > 0 && (best < 0 || boxes[i]!.score > boxes[best]!.score)) best = i
    if (best < 0) break
    const box = boxes[best]!
    const shift = box.axis === 0 ? 10 : box.axis === 1 ? 5 : 0
    box.cells.sort((a, b) => ((a >> shift) & 31) - ((b >> shift) & 31))
    let acc = 0
    let cut = 1
    for (let i = 0; i < box.cells.length - 1; i++) {
      acc += hist[box.cells[i]!]!
      if (acc >= box.count / 2) { cut = i + 1; break }
    }
    boxes[best] = boxOf(box.cells.slice(0, cut))
    boxes.push(boxOf(box.cells.slice(cut)))
  }
  const palette = new Uint8Array(boxes.length * 3)
  paletteGen = ++gen
  paletteAge = 0
  boxes.forEach((box, k) => {
    let r = 0
    let g = 0
    let b = 0
    for (const c of box.cells) {
      lut[c] = k
      lutGen[c] = paletteGen
      r += sumR[c]!
      g += sumG[c]!
      b += sumB[c]!
    }
    palette[k * 3] = Math.round(r / box.count)
    palette[k * 3 + 1] = Math.round(g / box.count)
    palette[k * 3 + 2] = Math.round(b / box.count)
  })
  lastPalette = palette
}

export function encodeIndexedPng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height
  // The last palette serves while the picture keeps to its colours: a frame is much like the one
  // before. Colours it never saw get their nearest entry; too many of them, or every 16 frames, and
  // the palette is cut afresh.
  let isFresh = !lastPalette || ++paletteAge >= 16
  if (!isFresh) {
    gen++
    let novel = 0
    for (let i = 0; i < n * 4; i += 4) {
      const c = ((rgba[i]! >> 3) << 10) | ((rgba[i + 1]! >> 3) << 5) | (rgba[i + 2]! >> 3)
      if (lutGen[c] === paletteGen) continue
      if (lutGen[c] !== gen) {
        lutGen[c] = gen
        novel++
        if (novel > 96) break
      }
    }
    if (novel > 96) isFresh = true
    else {
      // Give each unseen colour its nearest entry, then mark it as the palette's own.
      for (let i = 0; i < n * 4; i += 4) {
        const c = ((rgba[i]! >> 3) << 10) | ((rgba[i + 1]! >> 3) << 5) | (rgba[i + 2]! >> 3)
        if (lutGen[c] === paletteGen) continue
        lut[c] = nearest(lastPalette!, rgba[i]!, rgba[i + 1]!, rgba[i + 2]!)
        lutGen[c] = paletteGen
      }
    }
  }
  if (isFresh) buildPalette(rgba, n)
  const palette = lastPalette!
  const stride = width + 1
  const rawLen = stride * height
  if (indexRaw.length < rawLen) indexRaw = new Uint8Array(rawLen)
  const prevRow = new Uint8Array(width)
  // Each row as is, or as the difference from the row above when that row repeats it more.
  for (let y = 0; y < height; y++) {
    const r = y * stride
    let same = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const c = lut[((rgba[i]! >> 3) << 10) | ((rgba[i + 1]! >> 3) << 5) | (rgba[i + 2]! >> 3)]!
      indexRaw[r + 1 + x] = c
      if (y > 0 && prevRow[x] === c) same++
    }
    const isUp = same > width * 0.6
    indexRaw[r] = isUp ? 2 : 0
    for (let x = 0; x < width; x++) {
      const c = indexRaw[r + 1 + x]!
      if (isUp) indexRaw[r + 1 + x] = (c - prevRow[x]!) & 255
      prevRow[x] = c
    }
  }
  return writePng(indexRaw, rawLen, width, height, 3, palette)
}
