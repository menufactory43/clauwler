// helper/src/main.ts
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeSync } from "node:fs";
import { join } from "node:path";

// hooks/png.ts
var CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
  return c >>> 0;
});
function crc32(bytes, start, end) {
  let c = 4294967295;
  for (let i = start; i < end; i++) c = CRC[(c ^ bytes[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function adler32(bytes, len) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < len; ) {
    const end = Math.min(len, i + 5552);
    for (; i < end; i++) {
      a += bytes[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return (b << 16 | a) >>> 0;
}
var reverse = (code, len) => {
  let r = 0;
  for (let i = 0; i < len; i++) r = r << 1 | code >> i & 1;
  return r;
};
var LIT_CODE = new Uint16Array(288);
var LIT_LEN = new Uint8Array(288);
for (let n = 0; n < 288; n++) {
  const [base, len, first] = n < 144 ? [48, 8, 0] : n < 256 ? [400, 9, 144] : n < 280 ? [0, 7, 256] : [192, 8, 280];
  LIT_CODE[n] = reverse(base + n - first, len);
  LIT_LEN[n] = len;
}
var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
var LEN_SYM = new Uint8Array(259);
for (let s = 0; s < 29; s++) for (let l = LEN_BASE[s]; l < (LEN_BASE[s + 1] ?? 259); l++) LEN_SYM[l] = s;
LEN_SYM[258] = 28;
var DIST_SYM = new Uint8Array(32769);
for (let s = 0; s < 30; s++) for (let d = DIST_BASE[s]; d < (DIST_BASE[s + 1] ?? 32769); d++) DIST_SYM[d] = s;
var DIST_CODE = Uint8Array.from({ length: 30 }, (_, s) => reverse(s, 5));
var out = new Uint8Array(0);
var pos = 0;
var bitBuf = 0;
var bitCount = 0;
function bits(value, count) {
  bitBuf |= value << bitCount;
  bitCount += count;
  while (bitCount >= 8) {
    out[pos++] = bitBuf & 255;
    bitBuf >>>= 8;
    bitCount -= 8;
  }
}
function matchLen(data, at, i, max) {
  let l = 0;
  while (l < max && data[at + l] === data[i + l]) l++;
  return l;
}
var HASH_BITS = 15;
var head = new Int32Array(1 << HASH_BITS);
function deflate(data, len) {
  head.fill(-1);
  bits(1, 1);
  bits(1, 2);
  let i = 0;
  while (i < len) {
    let best = 0;
    let dist = 0;
    if (i + 3 <= len) {
      const h = (data[i] << 10 ^ data[i + 1] << 5 ^ data[i + 2]) & (1 << HASH_BITS) - 1;
      const cand = head[h];
      head[h] = i;
      const max = Math.min(258, len - i);
      if (i >= 3) {
        best = matchLen(data, i - 3, i, max);
        dist = 3;
      }
      if (cand >= 0 && cand < i - 3 && i - cand <= 32768) {
        const l = matchLen(data, cand, i, max);
        if (l > best) {
          best = l;
          dist = i - cand;
        }
      }
    }
    if (best >= 3) {
      const ls = LEN_SYM[best];
      bits(LIT_CODE[257 + ls], LIT_LEN[257 + ls]);
      if (LEN_EXTRA[ls]) bits(best - LEN_BASE[ls], LEN_EXTRA[ls]);
      const ds = DIST_SYM[dist];
      bits(DIST_CODE[ds], 5);
      if (DIST_EXTRA[ds]) bits(dist - DIST_BASE[ds], DIST_EXTRA[ds]);
      const end = i + best;
      for (let j = i + 1; j < end && j + 3 <= len; j += best > 32 ? 8 : 1) head[(data[j] << 10 ^ data[j + 1] << 5 ^ data[j + 2]) & (1 << HASH_BITS) - 1] = j;
      i = end;
    } else {
      bits(LIT_CODE[data[i]], LIT_LEN[data[i]]);
      i++;
    }
  }
  bits(LIT_CODE[256], LIT_LEN[256]);
  if (bitCount > 0) bits(0, 8 - bitCount);
}
var raw = new Uint8Array(0);
function chunk(type, start) {
  const len = pos - start - 8;
  out[start] = len >>> 24;
  out[start + 1] = len >>> 16 & 255;
  out[start + 2] = len >>> 8 & 255;
  out[start + 3] = len & 255;
  for (let k = 0; k < 4; k++) out[start + 4 + k] = type.charCodeAt(k);
  const c = crc32(out, start + 4, pos);
  out[pos++] = c >>> 24;
  out[pos++] = c >>> 16 & 255;
  out[pos++] = c >>> 8 & 255;
  out[pos++] = c & 255;
}
function writePng(raw2, rawLen, width, height, colorType, palette) {
  const cap = rawLen + (rawLen >> 2) + 1024;
  if (out.length < cap) out = new Uint8Array(cap);
  pos = 0;
  bitBuf = 0;
  bitCount = 0;
  for (const b of [137, 80, 78, 71, 13, 10, 26, 10]) out[pos++] = b;
  let start = pos;
  pos += 8;
  const ihdr = [width >>> 24, width >>> 16 & 255, width >>> 8 & 255, width & 255, height >>> 24, height >>> 16 & 255, height >>> 8 & 255, height & 255, 8, colorType, 0, 0, 0];
  for (const b of ihdr) out[pos++] = b;
  chunk("IHDR", start);
  if (palette) {
    start = pos;
    pos += 8;
    out.set(palette, pos);
    pos += palette.length;
    chunk("PLTE", start);
  }
  start = pos;
  pos += 8;
  out[pos++] = 120;
  out[pos++] = 1;
  deflate(raw2, rawLen);
  const ad = adler32(raw2, rawLen);
  out[pos++] = ad >>> 24;
  out[pos++] = ad >>> 16 & 255;
  out[pos++] = ad >>> 8 & 255;
  out[pos++] = ad & 255;
  chunk("IDAT", start);
  start = pos;
  pos += 8;
  chunk("IEND", start);
  return out.subarray(0, pos);
}
var hist = new Uint32Array(32768);
var sumR = new Float64Array(32768);
var sumG = new Float64Array(32768);
var sumB = new Float64Array(32768);
var lut = new Uint8Array(32768);
var indexRaw = new Uint8Array(0);
var lutGen = new Int32Array(32768);
var gen = 0;
var paletteGen = -1;
var paletteAge = 0;
var lastPalette = null;
function nearest(palette, r, g, b) {
  let best = 0;
  let bd = Infinity;
  for (let k = 0; k < palette.length; k += 3) {
    const d = (palette[k] - r) ** 2 + (palette[k + 1] - g) ** 2 + (palette[k + 2] - b) ** 2;
    if (d < bd) {
      bd = d;
      best = k / 3;
    }
  }
  return best;
}
function boxOf(cells) {
  let count = 0;
  const lo = [31, 31, 31];
  const hi = [0, 0, 0];
  for (const c of cells) {
    count += hist[c];
    const ch = [c >> 10, c >> 5 & 31, c & 31];
    for (let k = 0; k < 3; k++) {
      if (ch[k] < lo[k]) lo[k] = ch[k];
      if (ch[k] > hi[k]) hi[k] = ch[k];
    }
  }
  const range = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const axis = range[1] >= range[0] && range[1] >= range[2] ? 1 : range[0] >= range[2] ? 0 : 2;
  return { cells, count, score: cells.length > 1 ? Math.max(...range) * Math.sqrt(count) : -1, axis };
}
function buildPalette(rgba, n) {
  hist.fill(0);
  sumR.fill(0);
  sumG.fill(0);
  sumB.fill(0);
  for (let i = 0, p = 0; p < n; p++, i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const c = r >> 3 << 10 | g >> 3 << 5 | b >> 3;
    hist[c]++;
    sumR[c] = sumR[c] + r;
    sumG[c] = sumG[c] + g;
    sumB[c] = sumB[c] + b;
  }
  const used = [];
  for (let c = 0; c < 32768; c++) if (hist[c]) used.push(c);
  const boxes = [boxOf(used)];
  while (boxes.length < 256) {
    let best = -1;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].score > 0 && (best < 0 || boxes[i].score > boxes[best].score)) best = i;
    if (best < 0) break;
    const box = boxes[best];
    const shift = box.axis === 0 ? 10 : box.axis === 1 ? 5 : 0;
    box.cells.sort((a, b) => (a >> shift & 31) - (b >> shift & 31));
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.cells.length - 1; i++) {
      acc += hist[box.cells[i]];
      if (acc >= box.count / 2) {
        cut = i + 1;
        break;
      }
    }
    boxes[best] = boxOf(box.cells.slice(0, cut));
    boxes.push(boxOf(box.cells.slice(cut)));
  }
  const palette = new Uint8Array(boxes.length * 3);
  paletteGen = ++gen;
  paletteAge = 0;
  boxes.forEach((box, k) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const c of box.cells) {
      lut[c] = k;
      lutGen[c] = paletteGen;
      r += sumR[c];
      g += sumG[c];
      b += sumB[c];
    }
    palette[k * 3] = Math.round(r / box.count);
    palette[k * 3 + 1] = Math.round(g / box.count);
    palette[k * 3 + 2] = Math.round(b / box.count);
  });
  lastPalette = palette;
}
function encodeIndexedPng(rgba, width, height) {
  const n = width * height;
  let isFresh = !lastPalette || ++paletteAge >= 16;
  if (!isFresh) {
    gen++;
    let novel = 0;
    for (let i = 0; i < n * 4; i += 4) {
      const c = rgba[i] >> 3 << 10 | rgba[i + 1] >> 3 << 5 | rgba[i + 2] >> 3;
      if (lutGen[c] === paletteGen) continue;
      if (lutGen[c] !== gen) {
        lutGen[c] = gen;
        novel++;
        if (novel > 96) break;
      }
    }
    if (novel > 96) isFresh = true;
    else {
      for (let i = 0; i < n * 4; i += 4) {
        const c = rgba[i] >> 3 << 10 | rgba[i + 1] >> 3 << 5 | rgba[i + 2] >> 3;
        if (lutGen[c] === paletteGen) continue;
        lut[c] = nearest(lastPalette, rgba[i], rgba[i + 1], rgba[i + 2]);
        lutGen[c] = paletteGen;
      }
    }
  }
  if (isFresh) buildPalette(rgba, n);
  const palette = lastPalette;
  const stride = width + 1;
  const rawLen = stride * height;
  if (indexRaw.length < rawLen) indexRaw = new Uint8Array(rawLen);
  const prevRow = new Uint8Array(width);
  for (let y = 0; y < height; y++) {
    const r = y * stride;
    let same = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const c = lut[rgba[i] >> 3 << 10 | rgba[i + 1] >> 3 << 5 | rgba[i + 2] >> 3];
      indexRaw[r + 1 + x] = c;
      if (y > 0 && prevRow[x] === c) same++;
    }
    const isUp = same > width * 0.6;
    indexRaw[r] = isUp ? 2 : 0;
    for (let x = 0; x < width; x++) {
      const c = indexRaw[r + 1 + x];
      if (isUp) indexRaw[r + 1 + x] = c - prevRow[x] & 255;
      prevRow[x] = c;
    }
  }
  return writePng(indexRaw, rawLen, width, height, 3, palette);
}

// hooks/art.ts
var P = {
  k: [20, 12, 28],
  p: [68, 36, 52],
  n: [48, 52, 109],
  g: [78, 74, 78],
  b: [133, 76, 48],
  e: [52, 101, 36],
  r: [208, 70, 72],
  o: [117, 113, 97],
  u: [89, 125, 206],
  a: [210, 125, 44],
  s: [133, 149, 161],
  G: [109, 170, 44],
  t: [210, 170, 153],
  c: [109, 194, 202],
  y: [218, 212, 94],
  w: [222, 238, 214]
};
var sprite = (rows) => ({ w: rows[0]?.length ?? 0, h: rows.length, rows });
var HERO = [
  sprite([
    "...kkkk...",
    "..kyGyGk..",
    ".kttttttk.",
    ".ktkttktk.",
    ".kttttttk.",
    "..krrrrk..",
    ".krwwwrrk.",
    "kkrwwwwrkk",
    ".krwwwwrk.",
    "..knnnnk..",
    "..ks..sk..",
    "..kk..kk.."
  ]),
  sprite([
    "...kkkk...",
    "..kyGyGk..",
    ".kttttttk.",
    ".ktkttktk.",
    ".kttttttk.",
    "..krrrrk..",
    ".krwwwrrk.",
    "kkrwwwwrkk",
    ".krwwwwrk.",
    "..knnnnk..",
    "...ks.sk..",
    "...kk.kk.."
  ])
];
var RAT = sprite([
  ".....kk..",
  "..kkkssk.",
  ".kssssssk",
  "ksrsssssk",
  ".kssssskk",
  "..k.k.k.."
]);
var GOBLIN = sprite([
  "..kkkk..",
  ".kGGGGk.",
  "kGrGGrGk",
  ".kGGGGk.",
  "..kbbk..",
  ".kbbbbk.",
  "kGkbbkGk",
  "..kbbk..",
  "..k..k.."
]);
var SLUG = sprite([
  "...kkk...",
  "..kyyyk..",
  ".kykykyk.",
  "kyyyyyyyk",
  "kayayayak",
  ".kkkkkkk."
]);
var SKELETON = sprite([
  "..kkkk..",
  ".kwwwwk.",
  ".kwkkwk.",
  ".kwwwwk.",
  "..kwwk..",
  ".kwkkwk.",
  "kwkwwkwk",
  "..kwwk..",
  ".kwkkwk.",
  ".kk..kk."
]);
var LARVA = sprite([
  ".kkkk.",
  "kppppk",
  "kpcpck",
  ".kkkk."
]);
var BUG = sprite([
  ".k.k.",
  "krrrk",
  "kryrk",
  ".k.k."
]);
var LINTER = sprite([
  "...kk...",
  "..kuuk..",
  ".kuuuuk.",
  "kuukkuuk",
  "kukykyuk",
  ".kuuuuk.",
  "kunuunuk",
  "kunnnnuk",
  "kyuyuyuk",
  ".kkkkkk."
]);
var FORKER = sprite([
  "y.y.......",
  ".y...kkk..",
  ".b..kpppk.",
  ".b.kpcpcpk",
  ".b.kppppk.",
  ".bkpnppnpk",
  "kbpnnppnpk",
  ".bkpnppnk.",
  ".b.kpnnpk.",
  ".b.kppppk.",
  "..kkkkkkk."
]);
var TURRET = sprite([
  "...kkkk...",
  "..ksssSk..",
  ".ksrwrsSk.",
  "kssssssSSk",
  "kgsSssSsgk",
  "kggggggggk",
  "kSgSgSgSgk",
  "kggggggggk",
  ".kkkkkkkk."
]);
var MINER = sprite([
  "..kkkk..",
  ".kaaaak.",
  "kaywwyak",
  ".ktkktk.",
  ".kbrrbk.",
  "kbbrrbbk",
  ".kbbbbk.",
  ".kbkkbk.",
  ".kk..kk."
]);
var BURROWER = sprite([
  "..kkkkk..",
  ".kqqqqqk.",
  "kqkwkwkqk",
  "kqRRRRRqk",
  "kqkwkwkqk",
  ".kqqtqqk.",
  "..kqtqk..",
  ".kbbbbbk.",
  "kbBbBbBbk"
]);
var MONOLITH = sprite([
  "....kkkk....",
  "..kkuuuukk..",
  ".kuwuuuuuuk.",
  "kuwuuuuuuunk",
  "kuukwuukwunk",
  "kuukkuukkunk",
  "kuuuuuuuuunk",
  "kunuuuuuunnk",
  ".knnnnnnnnk.",
  "..kkkkkkkk.."
]);
var MICRO = sprite([
  ".kkkk.",
  "kwccck",
  "kckcck",
  "kcccck",
  ".kkkk."
]);
var SENTINEL = sprite([
  "...rr...",
  "..krrk..",
  ".kssssk.",
  ".kskkSk.",
  ".kssssk.",
  "kSssssSk",
  "ksWsssSk",
  "ksssssSk",
  ".kSnnSk.",
  ".ks..sk.",
  ".kk..kk."
]);
var REVIEWER = sprite([
  "..kkkk..",
  ".kttttk.",
  ".ktkktk.",
  "..kttk..",
  ".kGGGGk.",
  "kGGGGwGk",
  "kGwGwGGk",
  "kGGwGGGk",
  ".kGGGGk.",
  ".kk..kk."
]);
var LEAK = sprite([
  "....y...",
  "...kak..",
  "..kqqqk.",
  ".kqwqqqk",
  "kqwqqqqk",
  "kqkqqkRk",
  "kqqqqRRk",
  ".kqqRRk.",
  "..kkkk.."
]);
var SNIPER = sprite([
  "..kkkk..",
  ".kooook.",
  "kokrkgok",
  "kooooogk",
  ".kgoogk.",
  "kgoooogk",
  "kooyoogk",
  "kgoooogk",
  ".kogggk.",
  ".kk..kk."
]);
var FAMILIAR = sprite([
  ".kk.kk.",
  "kcckcck",
  "kcwccwk",
  ".kcccck",
  "..kkkk."
]);
var CHEST = sprite([
  ".kkkkkk.",
  "kbbbbbbk",
  "kkkyykkk",
  "kbbyybbk",
  "kbbbbbbk",
  ".kkkkkk."
]);
var ICONS = {
  boon: sprite(["..y..", ".yyy.", "yyyyy", ".yyy.", "..y.."]),
  eclats: sprite(["..c..", ".ccc.", "ccwcc", ".ccc.", "..c.."]),
  heal: sprite([".r.r.", "rrrrr", "rrrrr", ".rrr.", "..r.."]),
  vigor: sprite([".a.a.", "aaaaa", "aawaa", ".aaa.", "..a.."]),
  boss: sprite([".www.", "wkwkw", "wwwww", ".w.w.", "....."]),
  heart: sprite([".r.r.", "rrrrr", ".rrr.", "..r.."]),
  shard: sprite([".c.", "cwc", ".c."]),
  /** An item, not a boon: a gem on a gold chain. */
  item: sprite([".y.y.", "..y..", ".uuu.", "ucwcu", ".unu.", "..u.."])
};
var BIOME_TONES = [
  { floor: [[44, 30, 48], [52, 36, 58]], crack: [30, 20, 34], wall: [68, 36, 52], wallTop: [117, 70, 90], pillar: [88, 52, 74] },
  { floor: [[50, 34, 26], [58, 40, 30]], crack: [96, 40, 20], wall: [90, 40, 30], wallTop: [160, 80, 44], pillar: [110, 56, 36] },
  { floor: [[30, 54, 50], [36, 62, 58]], crack: [24, 40, 38], wall: [36, 70, 60], wallTop: [109, 170, 140], pillar: [60, 100, 90] }
];
var FONT_ROWS = {
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "110101101101101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101110011",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "110001010100111",
  "3": "110001010001110",
  "4": "101101111001001",
  "5": "111100110001110",
  "6": "011100111101111",
  "7": "111001010010010",
  "8": "111101111101111",
  "9": "111101111001110",
  " ": "000000000000000",
  ".": "000000000000010",
  "!": "010010010000010",
  "?": "110001010000010",
  ":": "000010000010000",
  "-": "000000111000000",
  "+": "000010111010000",
  "/": "001001010100100",
  "%": "101001010100101",
  "'": "010010000000000",
  ">": "100010001010100",
  "<": "001010100010001",
  "(": "010100100100010",
  ")": "010001001001010",
  ",": "000000000010100"
};
var ACCENTS = {
  \u00C0: "A",
  \u00C2: "A",
  \u00C4: "A",
  \u00C7: "C",
  \u00C9: "E",
  \u00C8: "E",
  \u00CA: "E",
  \u00CB: "E",
  \u00CE: "I",
  \u00CF: "I",
  \u00D4: "O",
  \u00D6: "O",
  \u00D9: "U",
  \u00DB: "U",
  \u00DC: "U",
  \u0152: "OE",
  \u00C6: "AE",
  "\u2019": "'",
  "\xAB": "<",
  "\xBB": ">",
  "\u2014": "-",
  "\u2013": "-"
};
function fold(text2) {
  let out2 = "";
  for (const ch of text2.toUpperCase()) out2 += ACCENTS[ch] ?? (FONT_ROWS[ch] ? ch : " ");
  return out2;
}
function glyph(ch) {
  return FONT_ROWS[ch];
}
Object.assign(P, {
  R: [140, 36, 48],
  q: [238, 112, 92],
  T: [166, 116, 100],
  W: [164, 176, 170],
  Y: [164, 132, 42],
  E: [34, 70, 30],
  S: [86, 98, 118],
  B: [86, 48, 34],
  N: [30, 32, 72],
  h: [246, 214, 132]
});
function fineOf(rows) {
  return rows.map((row) => [...row]);
}
function scale2x(src) {
  const h = src.length;
  const w = src[0]?.length ?? 0;
  const at = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? "." : src[y][x];
  const out2 = Array.from({ length: h * 2 }, () => new Array(w * 2).fill("."));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = at(x, y);
    const a = at(x, y - 1);
    const b = at(x + 1, y);
    const c = at(x - 1, y);
    const d = at(x, y + 1);
    out2[y * 2][x * 2] = c === a && c !== d && a !== b ? a : p;
    out2[y * 2][x * 2 + 1] = a === b && a !== c && b !== d ? b : p;
    out2[y * 2 + 1][x * 2] = d === c && d !== b && c !== a ? c : p;
    out2[y * 2 + 1][x * 2 + 1] = b === d && b !== a && d !== c ? d : p;
  }
  return out2;
}
function shade(grid, isLit) {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const at = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? "." : grid[y][x];
  const isEdge = (c) => c === "." || c === "k";
  const ch = [];
  const light = new Int8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = at(x, y);
    let l = 0;
    if (c === "k") {
      const touchesOut = at(x - 1, y) === "." || at(x + 1, y) === "." || at(x, y - 1) === "." || at(x, y + 1) === ".";
      const inner = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].find((n) => !isEdge(n));
      if (touchesOut && inner) {
        c = inner;
        l = -3;
      }
    } else if (c !== "." && isLit) {
      if (isEdge(at(x - 1, y)) || isEdge(at(x, y - 1))) l = 1;
      if (isEdge(at(x + 1, y)) || isEdge(at(x, y + 1))) l = -2;
      else if (isEdge(at(x + 2, y + 1)) || isEdge(at(x + 1, y + 2))) l = -1;
    }
    ch.push(c);
    light[y * w + x] = l;
  }
  return { w, h, ch, light };
}
function refine(s) {
  return shade(scale2x(fineOf(s.rows)), true);
}
function drawn(rows) {
  return shade(fineOf(rows), false);
}
function lit(c, l) {
  if (l === 0) return c;
  if (l > 0) return [Math.min(245, c[0] * 1.16 + 14), Math.min(245, c[1] * 1.12 + 10), Math.min(245, c[2] * 1.04 + 4)];
  const k = l === -1 ? 0.84 : l === -2 ? 0.68 : 0.45;
  return [c[0] * k * 0.92, c[1] * k * 0.96, Math.min(255, c[2] * k + 6)];
}
var HERO_TOP = [
  "......kkkkkkkk......",
  ".....kGyGhyGyGk.....",
  "....kBbBbbbbBbBk....",
  "....kbttttttttbk....",
  "....kqtttttttTTk....",
  "....ktwkttttwkTk....",
  "....kttttttttTTk....",
  ".....kTttrrtTTk.....",
  "......kkTTTTkk......",
  "....kRrrwwwwrrRk....",
  "...kRrqwwwwwwrrRk...",
  "..kRrqwwwwwwWWrrRk..",
  "..kRtkwwwwwwWWkTRk..",
  "..kRtkyhyyyyYYkTRk..",
  "..kRrkwwwwwwWWkrRk..",
  "..kRRkwwwwwWWWkRRk..",
  "...kRkWwwwwwWWkRk...",
  "....kknnnnnnNNkk....",
  ".....knnnkknnNk....."
];
var HERO_FINE = [
  drawn([
    ...HERO_TOP,
    ".....knNk..knNk.....",
    ".....ksSk..ksSk.....",
    "....kssSk..ksSSk....",
    "....kkkkk..kkkkk...."
  ]),
  drawn([
    ...HERO_TOP,
    "....knNk....knNk....",
    "....ksSk....ksSk....",
    "...kssSk....ksSSk...",
    "...kkkkk....kkkkk..."
  ])
];
var GUARDIAN_FINE = [
  // Le Merge Conflict: HEAD in blue, incoming in orange, zipped down the middle by its markers.
  [
    drawn([
      "........k............................k........",
      ".......kuk..........................kak.......",
      "........kck........................kayk.......",
      "........kuck........kkkkkk........kayk........",
      "........kuuck....kkkuckwyykkk....kayak........",
      ".........kuuck..kuccccwkyyaabk..kayak.........",
      ".........kuuuckkcccccckwyyaaabkkayaak.........",
      "..........kuukcccccccuwkyaaaabbkyaak..........",
      "...........kkkukkcccuckwyyaabbkkkkk...........",
      ".............kckkkkkcuwkyaakkkkkk.............",
      ".............kucukkkkkkwakkkkkBBk.............",
      ".............kuuwwwckkwkakkhyaBBk.............",
      ".............kucwwNNuukwyhhRRaaBk.............",
      ".............kuuccNNuuwkayyRRaBBk.............",
      ".............kuuucuuuukwbbaaaBBBk.............",
      "..........kk.knuuuuuunwkbBBBBBBBk.kk..........",
      "........kkuukkknnwkwkwkwkwkwkwBkkkyykk........",
      ".......kcuuuucccnkkkkkkkkkkkkkaabhhyyak.......",
      "......kcuuuucccccNNNNNkwBBBBBaaabbhhhyak......",
      ".....kuuuuncccccccccNNwkBByaaaaaabbhhyyak.....",
      "....kuuunnccccccccccuckwyyayaaaabbbbhhyyak....",
      "...kcuuunucccccccccucuwkyayaaaababbBBhhyyak...",
      "..kcuuuuncucccccucucuukwayaaaaaabbbbBhhhyyak..",
      ".kcuuuunuucucucucuuuuuwkyaaaaaabbbbBBBhhhyaBk.",
      ".kcuuunnuuucucuucnuuuukwaaaabhbbbbBBBBhhyyaak.",
      "kucuuunNuuuuuuucnuuuuuwkaaaaabhbbBBBBBhhhyyaBk",
      "kccuuunNuuuuuucnuuuuuukwaaaabbbhBBBBBByhhyaaBk",
      "kcccuunNuuuuucnuuuuuuuwkaaabbbbbhBBBBByhhhyabk",
      "kcucuunkuuuuuucnuuuuuukwbabbbbbhBBBBBBkhyhyabk",
      "kccuuuukkuuuuuucnuuuuuwkabbbbbhBBBBBBkkhhyyaak",
      "cccuuwnnkuuuuuuucnuunukwbbbbbhBBBBBBBkhhhwyabb",
      "cuuuwunNkkuuuuuuununnnwkbbbBBBBBBBBBkkhyyywabB",
      "uuuwunNNk.knnununnnnnnkwBbBBBBBBBBBk.kyyaaawBB",
      "uuunwNNNk..kkkkkkkkkkkkkkkkkkkkkkkk..kaaabwBBB",
      "knnnNwNk....kkWWkkWWkkWwkkWWkkWWkk....kbbwBBBk",
      ".kNNNNk....kcccNNNNNNNwkBBBBBBBaaBk....kBBBBk.",
      "..kkkk.....kucuuuNNNNNkwBBBBByaabBk.....kkkk..",
      "...........kuuuuunnNkkwkkkyyyaabbBk...........",
      "...........kuuuunnNNk....kaaaabbBBk...........",
      "............knnnnNNk......kbbbbBBk............",
      ".............kNNNNk........kBBBBk.............",
      "..............kkkk..........kkkk.............."
    ]),
    drawn([
      "........k............................k........",
      ".......kuk..........................kak.......",
      "........kck........................kayk.......",
      "........kuck........kkkkkk........kayk........",
      "........kuuck....kkkuRqhyykkk....kayak........",
      ".........kuuck..kuccccqrRyaabk..kayak.........",
      ".........kuuuckkcccccchryyaaabkkayaak.........",
      "..........kuukcccccccuqhyaaaabbkyaak..........",
      "...........kkkukkcccuRqryyaabbkkkkk...........",
      ".............kckkkkkcuhrRaakkkkkk.............",
      ".............kucukkkkkqhakkkkkBBk.............",
      ".............kuuwwwckkqrakkhyaBBk.............",
      ".............kucwwrruuhryhhRRaaBk.............",
      ".............kuuccrruuqhRyyRRaBBk.............",
      ".............kuuucuuuuqrbbaaaBBBk.............",
      "..........kk.knuuuuuunhrbBBBBBBBk.kk..........",
      "........kkuukkknnwkwkwkwkwkwkwBkkkyykk........",
      ".......kcuuuucccnkkkkkkkkkkkkkaabhhyyak.......",
      "......kcuuuucccccNRkRkRkRkRkRaaabbhhhyak......",
      ".....kuuuuncccccccccNNqhBByaaaaaabbhhyyak.....",
      "....kuuunnccccccccccuRqryyayaaaabbbbhhyyak....",
      "...kcuuunucccccccccucuhrRayaaaababbBBhhyyak...",
      "..kcuuuuncucccccucucuuqhayaaaaaabbbbBhhhyyak..",
      ".kcuuuunuucucucucuuuuuqryaaaaaabbbbBBBhhhyaBk.",
      ".kcuuunnuuucucuucnuuuRhraaaabhbbbbBBBBhhyyaak.",
      "kucuuunNuuuuuuucnuuuuuqhRaaaabhbbBBBBBhhhyyaBk",
      "kccuuunNuuuuuucnuuuuuuqraaaabbbhBBBBBByhhyaaBk",
      "kcccuunNuuuuucnuuuuuuuhraaabbbbbhBBBBByhhhyabk",
      "kcucuunkuuuuuucnuuuuuRqhbabbbbbhBBBBBBkhyhyabk",
      "kccuuuukkuuuuuucnuuuuuqrRbbbbbhBBBBBBkkhhyyaak",
      "cccuuwnnkuuuuuuucnuunuhrbbbbbhBBBBBBBkhhhwyabb",
      "cuuuwunNkkuuuuuuununnnqhbbbBBBBBBBBBkkhyyywabB",
      "uuuwunNNk.knnununnnnnRqrBbBBBBBBBBBk.kyyaaawBB",
      "uuunwNNNk..kkkkkkkkkkkkkkkkkkkkkkkk..kaaabwBBB",
      "knnnNwNk....kkWWkkWWkkWWkkWWkkWWkk....kbbwBBBk",
      ".kNNNNk....kcccNNNNNNNqrBBBBBBBaaBk....kBBBBk.",
      "..kkkk.....kucuuuNNNNRhrBBBBByaabBk.....kkkk..",
      "...........kuuuuunnNkkqhRkyyyaabbBk...........",
      "...........kuuuunnNNk....kaaaabbBBk...........",
      "............knnnnNNk......kbbbbBBk............",
      ".............kNNNNk........kBBBBk.............",
      "..............kkkk..........kkkk.............."
    ])
  ],
  // Le Démon de la Prod: horns, bat wings, a server rack for a heart.
  [
    drawn([
      "..........kwSk..................kwSk..........",
      "..........ksSk..................ksSk..........",
      "..........ksSk........aya.......kSSk..........",
      "..........ksSSk........aya.....kWSSk..........",
      "...........kSSSk.....ayhya....kwsSk...........",
      "...........kSSSSkk..ayhhhya.kkwWSSk...........",
      "...k.......kSSSSSskaayhhhyaawwWsSSk......kk...",
      "..kBk.......kSSSSSSSqqqrrrwwwWsSSk......kpBk..",
      "..kpBk.......kSSSSSSqqrrrrWwWsSSk......kpBk...",
      "...kpBkk......kSSSSSqrqrrrWssSSk......kpBk....",
      "...kRpBBk......kSSkkrqrrrrSkkSk.....kkBBpk....",
      "...kpppBBk.....kqrqkkkrrrkkkRpk....kpBBppk....",
      "...kppppBBk....krrrrrkkrkkRRppk...kpBBpppk....",
      "....kpppRpBk...krrrrhyrrryhRppk..kpBRpppk.....",
      "....kppRpppBkk.krrrrrrrrRRRpppk.kpBRppppk.....",
      "....kpRpppppBBkkrrrrrrrRRRppppkkBBRpppppk.....",
      "...kpRppppppRBBkkrrrRRRRpppppkpBBRppppppRk....",
      "..kpRppppppRppBBkRRkwkkkkkwkppBBRppppppRppk...",
      ".kpRppppppRpppppBqppwpppppwprBpRppppppRppppk..",
      "kpRppppppRppppppqqqqpppppprrrrRppppppRppppppk.",
      "pRppppppRppqrrrqqqqqqqrrrrrrrrRqqqrpRppppppRpk",
      "BBBkkkpRpprrrRRRqqqqqrqrrrrrrrqqqrrrpppkkkkBBB",
      "kkkBBBBBBqrrrRppqqqqrqrrrrrrrrrqqqqrrBBBBBBkkk",
      "...kkRpprrrrRpppqswssssssssSSSrrqqqrrrppkkk...",
      "...kRppqrrrRppppqwsGsGsyssSsSSrrrqqqrrrRpk....",
      "..kRppqrrrrpppprqskkkkkkkkkkkSRrrrqqqrrRppk...",
      "..kppprrrrRppprqrsssssssSsSSSSRRrrrqqqrrppk...",
      ".kppkqqrrRppprrrrssrsGsysSSSSgRppRrrqqrrRppk..",
      ".kBBBqrrrRpprrrrrskkkkkkkkkkkgpppprrqqrrrBBBk.",
      "..kkqrrrRppkrrrrrssssSsSSSSgggppppkrqqqrrpkk..",
      "...kqqrrppkkrrrrrssGSGSySSggggppppkkrqqqrRk...",
      "...kqrrrRpkkrrrrrskkkkkkkkkkkgppppkkrrqrrRk...",
      "...kqqrrpk..krrrrsssSSSSggggggpppk..kqqqrrk...",
      "..krqrrRpk..kRrrrRrRRRRRRppppppppk..krqrrRpk..",
      "..krrrRRpk...kRRRRRRRRRRppppppppk...krrrRRpk..",
      "...kRRppk....kqRRRRRRpRppppppppRk....kRRppk...",
      "....kppk....kqqqpRpppppppppppprRpk....kppk....",
      "....wkk.w...krqrrpppppppppppprrRpk....wkk.w...",
      "......w.....krrrrrRppppppprrrrRppk......w.....",
      "............krrrrRRppkkkkrrrrRRppk............",
      ".............kRRRRppk....kRRRRppk.............",
      ".............kgggkkkk....kgggkkkk.............",
      "..............kkkkkkk.....kkkkkkk.............",
      ".............................................."
    ]),
    drawn([
      "..........kwSk.........aya......kwSk..........",
      "..........ksSk.......ayyya......ksSk..........",
      "..........ksSk.......ayhhhya....kSSk..........",
      "..........ksSSk.....ayhhhya....kWSSk..........",
      "...........kSSSk...aayhhhyaa..kwsSk...........",
      "...........kSSSSkkaayyhhhyyaakwWSSk...........",
      "...k.......kSSSSSsaayyhhhyyaawWsSSk......kk...",
      "..kBk.......kSSSSaayyhhhhhyyaasSSk......kpBk..",
      "..kpBk.......kSSSSSSqqrrrrWwWsSSk......kpBk...",
      "...kpBkk......kSSSSSqrqrrrWssSSk......kpBk....",
      "...kRpBBk......kSSkkrqrrrrSkkSk.....kkBBpk....",
      "...kpppBBk.....kqrqkkkrrrkkkRpk....kpBBppk....",
      "...kppppBBk....krrrrrkkrkkRRppk...kpBBpppk....",
      "....kpppRpBk...krrrrwhrrrhwRppk..kpBRpppk.....",
      "....kppRpppBkk.krrrrrrrrRRRpppk.kpBRppppk.....",
      "....kpRppappBBkkrrrrrrrRRRppppkkBBRppappk.....",
      "...kpRpppappRBBkkrrrRRRRpppppkpBBRpppappRk....",
      "..kpRpppyyyRppBBkRRkwkkkkkwkppBBRpppyyyRppk...",
      ".kpRppppyhypppppBqppwpppppwprBpRppppyhyppppk..",
      "kpRppppyyhyyppppqqqqpppppprrrrRppppyyhyyppppk.",
      "pRppppppRppqrrrqqqqqqqrrrrrrrrRqqqrpRppppppRpk",
      "BBBkkkpRpprrrRRRqqqqqrqrrrrrrrqqqrrrpppkkkkBBB",
      "kkkBBBBBBqrrrRppqqqqrqrrrrrrrrrqqqqrrBBBBBBkkk",
      "...kkRpprrrrRpppqswssssssssSSSrrqqqrrrppkkk...",
      "...kRppqrrrRppppqwsrsqsrssSsSSrrrqqqrrrRpk....",
      "..kRppqrrrrpppprqskkkkkkkkkkkSRrrrqqqrrRppk...",
      "..kppprrrrRppprqrsssssssSsSSSSRRrrrqqqrrppk...",
      ".kppkqqrrRppprrrrssrsqsrsSSSSgRppRrrqqrrRppk..",
      ".kBBBqrrrRpprrrrrskkkkkkkkkkkgpppprrqqrrrBBBk.",
      "..kkqrrrRppkrrrrrssssSsSSSSgggppppkrqqqrrpkk..",
      "...kqqrrppkkrrrrrssrSqSrSSggggppppkkrqqqrRk...",
      "...kqrrrRpkkrrrrrskkkkkkkkkkkgppppkkrrqrrRk...",
      "...kqqrrpk..krrrrsssSSSSggggggpppk..kqqqrrk...",
      "..krqrrRpk..kRrrrRrRRRRRRppppppppk..krqrrRpk..",
      "..krrrRRpk...kRRRRRRRRRRppppppppk...krrrRRpk..",
      "...kRRppk....kqRRRRRRpRppppppppRk....kRRppk...",
      "....kppk....kqqqpRpppppppppppprRpk....kppk....",
      "....wkk.w...krqrrpppppppppppprrRpk....wkk.w...",
      "......w.....krrrrrRppppppprrrrRppk......w.....",
      "............krrrrRRppkkkkrrrrRRppk............",
      ".............kRRRRppk....kRRRRppk.............",
      ".............kgggkkkk....kgggkkkk.............",
      "..............kkkkkkk.....kkkkkkk.............",
      ".............................................."
    ])
  ],
  // L'Hydre des Dépendances: a coil of necks, packages stuck in its hide; five heads once angry.
  [
    drawn([
      "....................................................",
      "....................................................",
      "....................................................",
      ".........................kk.........................",
      ".......................kkGGkk.......................",
      "......................kyyGGeek......................",
      ".....................kyyyGGeeEk.....................",
      "....................kGyGGyryyGek....................",
      "....................keGGeeGyGGekk...................",
      ".........kk..........keeeEGGeeEEk........kk.........",
      ".......kkGGkk.........kEEEEkkkkkk......kkGGkk.......",
      "......kyyGGeek........keEEEEwkwk......kyyGGeek......",
      ".....kyyyGGeeEk.......keEEEEk........kyyyGGeeEk.....",
      "....kyyGeGryEEEk......kEEEEEk.......kGyGGyryyGek....",
      "...kykGeEEeEEEEk......kEEEEEk.......keGGeeGyGGekk...",
      "...kGeeEEEEEEEk.......kEEEEEk........keeeEGGeeEEk...",
      "...kEkkkkkEEEk.......keEEEEEk.........kEEEEkkkkkk...",
      "....kkwkwEEEEk.......keEEEEEk.........keEEEEwkwk....",
      ".......kEEEEEk.......keEEEEEk.........keEEEEk.......",
      ".......kEEEEEk.......keEEEEEk.........kEEEEEk.......",
      ".......kEEEEEEk......keEEEEEk........keeEEEEk.......",
      ".......keEEEEEk......kEEEEEEk........keEEEEEk.......",
      "........kEEEEEEk.....keEEEEEk.......kGeEEEEk........",
      "........kEEEEEEk.....kEEEEEEk.......keEEEEEk........",
      ".........kEEEEEEk....kEEEEEEkk.....keeEEEEk.........",
      ".........kEEEEEEEk..kkyyyGGGGekk..kGeEEEEEk.........",
      "..........kEEEEEEEkkyyyyyyGGeeeekkGeeEEEEk..........",
      "..........kEEEEEEEyyyyyyyGGGGeeEEEGeEEEEEk..........",
      "...........kEEEyyGGyyyGyGGGGeeeEEEEeEEEEk...........",
      "............kyyyyGGGyGGGGeeeeeEEEEEeeEEk............",
      "...........kyyyyyGGGGGeGeeeeEEEEEEEaaaaEk...........",
      "..........kyyyyyyeeeeeeeeeeEEEEEEEEaybBEEk..........",
      ".........kGyyyaaaaEeeeEeEEEEEEEEEEeabbBEEEk.........",
      "........kGGGyGaybByGEEEEEEEEEEEEeeeaBBBEEEEk........",
      "........kGGGGGabbBGGGGEEEEEEEEeeEeEEEEEEEEEk........",
      "........keGGGGaBBBGGGeGeeeeeeeeEEEEEEEEEEEEk........",
      "........keeGeGeGeGeGeeeeeeeeEeaaaaEEEEEEEEEk........",
      ".........keeeeeEeeEeeEeeEeeEEEaybBEEEEEEEEk.........",
      "..........keeeeeeeeeeaaaaEEEEEabbBEEEEEEEk..........",
      "...........kEEEEeEeEEaybBEEEEEaBBBEEEEEEk...........",
      "............kEEEEEEEEabbBEEEEEEEEEEEEEEk............",
      ".............kkEEEEEEaBBBEEEEEEEEEEEEkk.............",
      "...............kkkEEEEEEEEEEEEEEEEkkk...............",
      "..................kkkkkkkkkkkkkkkk.................."
    ]),
    drawn([
      "....................................................",
      "....................................................",
      "....................................................",
      ".........................kk.........................",
      ".......................kkGGkk.......................",
      "......................kyyGGeek......................",
      ".....................kyyyGGeeEk.....................",
      "....................kGyGGqwyyGek....................",
      "....................keGGeeGyGGekk...................",
      ".........kk..........keeeEGGeeEEk........kk.........",
      ".......kkGGkk.........kEEEEkkkkkk......kkGGkk.......",
      "......kyyGGeek........keEEEEwkwk......kyyGGeek......",
      ".....kyyyGGeeEk.......keEEEEk........kyyyGGeeEk.....",
      "....kyyGeGwqEEEk......kEEEEEk.......kGyGGqwyyGek....",
      "...kykGeEEeEEEEk......kEEEEEk.......keGGeeGyGGekk...",
      "...kGeeEEEEEEEk.......kEEEEEk........keeeEGGeeEEk...",
      "...kEkkkkkEEEk.......keEEEEEk.........kEEEEkkkkkk...",
      "....kkwkwEEEEk.......keEEEEEk.........keEEEEwkwk....",
      "...kk..kEEEEEk.......keEEEEEk.........keEEEEk..kk...",
      ".kkGGkkkEEEEEk.......keEEEEEk.........kEEEEEkkkGGkk.",
      "kyyyGGekEEEEEEk......keEEEEEk........keeEEEEkyyyGGek",
      "yyyGGeeEeEEEEEk......kEEEEEEk........keEEEEEyyyGGeeE",
      "GGeGwqEEEEEEEEEk.....keEEEEEk.......kGeEEEEGGyGqwyyG",
      "GeeEeEEEEEEEEEEk.....kEEEEEEk.......keEEEEEeGeGeyyyG",
      "eeEEEEEEkkEEEEEEk....kEEEEEEkk.....keeEEEEkkeeeeeGee",
      "kkkkEEEk.kEEEEEEEk..kkyyyGGGGekk..kGeEEEEEk.kEEEEkkk",
      "wkwEEEEk..kEEEEEEEkkyyyyyyGGeeeekkGeeEEEEk..keEEEEwk",
      ".kEEEEEEk.kEEEEEEEyyyyyyyGGGGeeEEEGeEEEEEk.kGeEEEEk.",
      ".kEEEEEEEk.kEEEyyGGyyyGyGGGGeeeEEEEeEEEEk.kyeEEEEEk.",
      "..kEEEEEEEk.kyyyyGGGyGGGGeeeeeEEEEEeeEEk.kyGEEEEEk..",
      "..kEEEEEEEEkyyyyyGGGGGeGeeeeEEEEEEEaaaaEkyGeEEEEEk..",
      "...kEEEEEEEyyyyyyeeeeeeeeeeEEEEEEEEaybBEEGeEEEEEk...",
      "....kEEEEEGyyyaaaaEeeeEeEEEEEEEEEEeabbBEEEEEEEEk....",
      ".....kEEEGGGyGaybByGEEEEEEEEEEEEeeeaBBBEEEEEEEk.....",
      "......kEEGGGGGabbBGGGGEEEEEEEEeeEeEEEEEEEEEEEk......",
      ".......kEeGGGGaBBBGGGeGeeeeeeeeEEEEEEEEEEEEEk.......",
      "........keeGeGeGeGeGeeeeeeeeEeaaaaEEEEEEEEEk........",
      ".........keeeeeEeeEeeEeeEeeEEEaybBEEEEEEEEk.........",
      "..........keeeeeeeeeeaaaaEEEEEabbBEEEEEEEk..........",
      "...........kEEEEeEeEEaybBEEEEEaBBBEEEEEEk...........",
      "............kEEEEEEEEabbBEEEEEEEEEEEEEEk............",
      ".............kkEEEEEEaBBBEEEEEEEEEEEEkk.............",
      "...............kkkEEEEEEEEEEEEEEEEkkk...............",
      "..................kkkkkkkkkkkkkkkk.................."
    ])
  ]
];
var FINE = {
  rat: refine(RAT),
  goblin: refine(GOBLIN),
  slug: refine(SLUG),
  skeleton: refine(SKELETON),
  larva: refine(LARVA),
  bug: refine(BUG),
  linter: refine(LINTER),
  forker: refine(FORKER),
  turret: refine(TURRET),
  miner: refine(MINER),
  burrower: refine(BURROWER),
  monolith: refine(MONOLITH),
  micro: refine(MICRO),
  sentinel: refine(SENTINEL),
  reviewer: refine(REVIEWER),
  leak: refine(LEAK),
  sniper: refine(SNIPER),
  familiar: refine(FAMILIAR),
  chest: refine(CHEST),
  icons: Object.fromEntries(Object.entries(ICONS).map(([k, s]) => [k, refine(s)]))
};

// hooks/i18n.ts
var lang = "fr";
var tr = (fr, en) => lang === "en" ? en : fr;
var Pair = class {
  constructor(fr, en) {
    this.fr = fr;
    this.en = en;
  }
  fr;
  en;
  toString() {
    return tr(this.fr, this.en);
  }
};
var L = (fr, en) => new Pair(fr, en);
var asText = (v) => v instanceof Pair ? v.toString() : v;
function localize(o) {
  for (const key of Object.keys(o)) {
    const v = o[key];
    if (v instanceof Pair) {
      Object.defineProperty(o, key, { get: () => v.toString(), enumerable: true, configurable: true });
    } else if (Array.isArray(v) && v.some((x) => x instanceof Pair)) {
      Object.defineProperty(o, key, { get: () => v.map(asText), enumerable: true, configurable: true });
    }
  }
  return o;
}
function localizeAll(list) {
  for (const one of list) localize(one);
  return list;
}
var pct = (v) => `${Math.round(v * 100)}%`;
var num = (v) => Number.isInteger(v) ? `${v}` : lang === "en" ? v.toFixed(1) : v.toFixed(1).replace(".", ",");

// hooks/data.ts
var SRCS = ["attack", "special", "cast", "dash"];
var CLASSES = {
  artificier: localize({ label: L("Artificier", "Artificer"), stack: "Swift", perk: L("+1 sort", "+1 cast"), apply: (s) => {
    s.castAmmo += 1;
  } }),
  forgeron: localize({ label: L("Forgeron", "Smith"), stack: "Rust", perk: L("+10 PV, \xE9pines 3", "+10 HP, thorns 3"), apply: (s) => {
    s.maxHp += 10;
    s.thorns += 3;
  } }),
  illusionniste: localize({ label: L("Illusionniste", "Illusionist"), stack: "TypeScript", perk: L("10% esquive", "10% dodge"), apply: (s) => {
    s.dodge += 0.1;
  } }),
  alchimiste: localize({ label: L("Alchimiste", "Alchemist"), stack: "Python", perk: L("+2 PV par victime", "+2 HP per kill"), apply: (s) => {
    s.lifesteal += 2;
  } }),
  rodeur: localize({ label: L("R\xF4deur", "Ranger"), stack: "Go", perk: L("+10% d\xE9g\xE2ts", "+10% damage"), apply: (s) => {
    s.dmg += 0.1;
  } }),
  vagabond: localize({ label: L("Vagabond", "Wanderer"), stack: L("divers", "mixed"), perk: L("+5% critique", "+5% crit"), apply: (s) => {
    s.crit += 0.05;
  } })
};
var WEAPONS = localizeAll([
  { id: "epee", name: "Stack Trace", title: L("\xC9p\xE9e", "Sword"), attack: L("combo de 3 entailles, la 3e plus lourde", "3-slash combo, the 3rd one heavier"), special: L("onde de choc autour de toi", "shockwave all around you"), cost: 0 },
  { id: "lance", name: L("Pointeur", "Pointer"), title: L("Lance", "Spear"), attack: L("estoc longue port\xE9e", "long-reach thrust"), special: L("lancer per\xE7ant qui revient", "piercing throw that comes back"), cost: 30 },
  { id: "arc", name: "Ping", title: L("Arc", "Bow"), attack: L("fl\xE8che rapide", "quick arrow"), special: L("salve de 5 fl\xE8ches", "volley of 5 arrows"), cost: 50 },
  { id: "bouclier", name: "Firewall", title: L("Bouclier", "Shield"), attack: L("coup de bouclier qui repousse", "shield bash that knocks back"), special: L("lancer qui rebondit entre les ennemis ; le dash charge", "throw that bounces between foes; the dash charges"), cost: 80 }
]);
var ASPECTS = localizeAll([
  { id: "epee-kernel", weapon: "epee", name: L("Aspect du Kernel", "Aspect of the Kernel"), desc: L("entailles +50% mais 20% plus lentes ; chaque coup \xE9tourdit 0,3 s", "slashes +50% but 20% slower; every blow stuns 0.3 s"), cost: 40, apply: (s) => {
    s.attackMult += 0.5;
    s.attackSpeed -= 0.2;
    s.onHit.attack.stun += 0.3;
  } },
  { id: "epee-thread", weapon: "epee", name: L("Aspect du Thread", "Aspect of the Thread"), desc: L("frappe 35% plus vite, attaque \u221215%, chaque coup empoisonne (1/s)", "strikes 35% faster, attack \u221215%, every blow poisons (1/s)"), cost: 70, apply: (s) => {
    s.attackSpeed += 0.35;
    s.attackMult -= 0.15;
    s.onHit.attack.poison += 1;
  } },
  { id: "lance-null", weapon: "lance", name: L("Aspect du Pointeur Nul", "Aspect of the Null Pointer"), desc: L("sp\xE9cial +40%, la lance foudroie 2 ennemis de plus", "special +40%, the spear zaps 2 more foes"), cost: 50, apply: (s) => {
    s.specialMult += 0.4;
    s.onHit.special.chain += 2;
  } },
  { id: "lance-smart", weapon: "lance", name: L("Aspect du Pointeur Malin", "Aspect of the Smart Pointer"), desc: L("l'estoc marque 3 s et gagne +20% critique", "the thrust marks for 3 s and gains +20% crit"), cost: 80, apply: (s) => {
    s.onHit.attack.mark += 3;
    s.attackCrit += 0.2;
  } },
  { id: "arc-multicast", weapon: "arc", name: L("Aspect Multicast", "Multicast Aspect"), desc: L("chaque tir part en 3 fl\xE8ches, attaque \u221230%", "every shot leaves as 3 arrows, attack \u221230%"), cost: 60, apply: (s) => {
    s.extraShots += 2;
    s.attackMult -= 0.3;
  } },
  { id: "arc-traceroute", weapon: "arc", name: L("Aspect Traceroute", "Traceroute Aspect"), desc: L("fl\xE8ches per\xE7antes \xE0 t\xEAte chercheuse, attaque \u221210%", "piercing homing arrows, attack \u221210%"), cost: 90, apply: (s) => {
    s.pierce = true;
    s.homing += 4;
    s.attackMult -= 0.1;
  } },
  { id: "bouclier-actif", weapon: "bouclier", name: L("Aspect du Pare-feu Actif", "Aspect of the Active Firewall"), desc: L("armure 20%, \xE9pines +8, frappe 10% plus lentement", "armor 20%, thorns +8, strikes 10% slower"), cost: 70, apply: (s) => {
    s.armor += 0.2;
    s.thorns += 8;
    s.attackSpeed -= 0.1;
  } },
  { id: "bouclier-proxy", weapon: "bouclier", name: L("Aspect du Proxy Inverse", "Aspect of the Reverse Proxy"), desc: L("le bouclier lanc\xE9 rebondit 3 fois de plus et ralentit de 40%", "the thrown shield bounces 3 more times and slows by 40%"), cost: 100, apply: (s) => {
    s.shieldBounce += 3;
    s.onHit.special.chill += 0.4;
  } }
]);
var G = {
  grep: new Pair("Grep l'\u0152il", "Grep the Eye"),
  sudo: new Pair("Sudo le Tout-Puissant", "Sudo the Almighty"),
  fork: new Pair("Fork le Multiple", "Fork the Many"),
  rebase: new Pair("Rebase le Temporel", "Rebase the Timeless"),
  lint: new Pair("Lint la Rigoureuse", "Lint the Strict"),
  cache: new Pair("Cache la M\xE9moire", "Cache the Keeper"),
  commit: new Pair("Commit le Scell\xE9", "Commit the Sealed"),
  pipe: new Pair("Pipe le Fluide", "Pipe the Flowing")
};
var GODS = localize({ ...G });
var GOD_SIGNS = {
  grep: new Pair("marque et critique", "mark and crit"),
  sudo: new Pair("br\xFBlure et puissance", "burn and power"),
  fork: new Pair("tirs multiples et familiers", "multishot and familiars"),
  rebase: new Pair("ralenti, gel et esquive", "slow, freeze and dodge"),
  lint: new Pair("poison et \xE9pines", "poison and thorns"),
  cache: new Pair("soins et bouclier", "heals and shield"),
  commit: new Pair("PV, armure et \xE9tourdissement", "HP, armor and stun"),
  pipe: new Pair("\xE9clairs en cha\xEEne et vitesse", "chain lightning and speed")
};
var god = (p) => p;
var duoGod = (a, b) => L(`${a.fr} \u2715 ${b.fr}`, `${a.en} \u2715 ${b.en}`);
var grep = god(G.grep);
var sudo = god(G.sudo);
var fork = god(G.fork);
var rebase = god(G.rebase);
var lint = god(G.lint);
var cache = god(G.cache);
var commit = god(G.commit);
var pipe = god(G.pipe);
var GOD_BOONS = localizeAll([
  // Grep: the mark (marked foes take +30% damage) and crits.
  { id: "grep-attack", god: grep, slot: "attack", name: L("Attaque per\xE7ante", "Piercing Attack"), base: 0.3, desc: (v) => tr(`attaque +${pct(v)}, +15% critique, marque 2 s`, `attack +${pct(v)}, +15% crit, marks for 2 s`), apply: (s, v) => {
    s.attackMult += v;
    s.attackCrit += 0.15;
    s.onHit.attack.mark += 2;
  } },
  { id: "grep-special", god: grep, slot: "special", name: L("Sp\xE9cial traqueur", "Tracker Special"), base: 0.4, desc: (v) => tr(`sp\xE9cial +${pct(v)}, marque 4 s`, `special +${pct(v)}, marks for 4 s`), apply: (s, v) => {
    s.specialMult += v;
    s.onHit.special.mark += 4;
  } },
  { id: "grep-cast", god: grep, slot: "cast", name: L("Regard cibl\xE9", "Targeted Gaze"), base: 0.5, desc: (v) => tr(`sort +${pct(v)}, toujours critique sur cible bless\xE9e, marque 4 s`, `cast +${pct(v)}, always crits wounded targets, marks for 4 s`), apply: (s, v) => {
    s.castMult += v;
    s.castWoundCrit = true;
    s.onHit.cast.mark += 4;
  } },
  { id: "grep-dash", god: grep, slot: "dash", name: L("Dash de recherche", "Search Dash"), base: 0.8, desc: (v) => tr(`apr\xE8s un dash, la prochaine attaque fait +${pct(v)}`, `after a dash, the next attack deals +${pct(v)}`), apply: (s, v) => {
    s.dashAttackBuff += v;
  } },
  { id: "grep-crit", god: grep, slot: "passive", name: L("Regex gourmande", "Greedy Regex"), base: 0.06, desc: (v) => tr(`+${pct(v)} critique`, `+${pct(v)} crit`), apply: (s, v) => {
    s.crit += v;
  } },
  { id: "grep-mark", god: grep, slot: "passive", name: L("\u0152il du lynx", "Lynx Eye"), base: 0.2, desc: (v) => tr(`les ennemis marqu\xE9s subissent +${pct(v)} de plus`, `marked foes take +${pct(v)} more`), apply: (s, v) => {
    s.markBonus += v;
  } },
  { id: "grep-fresh", god: grep, slot: "passive", name: L("Premier match", "First Match"), base: 0.5, desc: (v) => tr(`+${pct(v)} d\xE9g\xE2ts sur les ennemis intacts`, `+${pct(v)} damage to unhurt foes`), apply: (s, v) => {
    s.freshDmg += v;
  } },
  // Sudo: burn and raw power.
  { id: "sudo-attack", god: sudo, slot: "attack", name: L("Frappe root", "Root Strike"), base: 0.2, desc: (v) => tr(`attaque +${pct(v)}, repousse fort`, `attack +${pct(v)}, heavy knockback`), apply: (s, v) => {
    s.attackMult += v;
    s.attackKnock += 1;
  } },
  { id: "sudo-burn", god: sudo, slot: "attack", name: L("Attaque incendiaire", "Incendiary Attack"), base: 3, desc: (v) => tr(`l'attaque br\xFBle (${num(v)}/s pendant 3 s), +10%`, `the attack burns (${num(v)}/s for 3 s), +10%`), apply: (s, v) => {
    s.onHit.attack.burn += v;
    s.attackMult += 0.1;
  } },
  { id: "sudo-special", god: sudo, slot: "special", name: L("Sp\xE9cial privil\xE9gi\xE9", "Privileged Special"), base: 0.6, desc: (v) => tr(`sp\xE9cial +${pct(v)}`, `special +${pct(v)}`), apply: (s, v) => {
    s.specialMult += v;
  } },
  { id: "sudo-cast", god: sudo, slot: "cast", name: L("Sort incendiaire", "Incendiary Cast"), base: 6, desc: (v) => tr(`le sort br\xFBle (${num(v)}/s), +20%`, `the cast burns (${num(v)}/s), +20%`), apply: (s, v) => {
    s.onHit.cast.burn += v;
    s.castMult += 0.2;
  } },
  { id: "sudo-dash", god: sudo, slot: "dash", name: L("Dash br\xFBlant", "Scorching Dash"), base: 10, desc: (v) => tr(`onde de feu \xE0 l'arriv\xE9e (${num(v)} d\xE9g\xE2ts) qui br\xFBle`, `wave of fire on landing (${num(v)} damage) that burns`), apply: (s, v) => {
    s.dashNova += v;
    s.onHit.dash.burn += 4;
  } },
  { id: "sudo-boss", god: sudo, slot: "passive", name: L("Privil\xE8ges \xE9lev\xE9s", "Elevated Privileges"), base: 0.25, desc: (v) => tr(`+${pct(v)} d\xE9g\xE2ts aux gardiens`, `+${pct(v)} damage to guardians`), apply: (s, v) => {
    s.bossDmg += v;
  } },
  { id: "sudo-kill", god: sudo, slot: "passive", name: "kill -9", base: 0.12, desc: (v) => tr(`ex\xE9cute les ennemis sous ${pct(v)} de PV`, `executes foes under ${pct(v)} HP`), apply: (s, v) => {
    s.execute += v;
  } },
  // Fork: more shots, more bodies.
  { id: "fork-attack", god: fork, slot: "attack", name: L("Attaque dupliqu\xE9e", "Duplicated Attack"), base: 1, desc: (v) => tr(`chaque attaque tire ${num(v)} projectile${v > 1 ? "s" : ""} en plus`, `every attack fires ${num(v)} more projectile${v > 1 ? "s" : ""}`), apply: (s, v) => {
    s.extraShots += v;
  } },
  { id: "fork-special", god: fork, slot: "special", name: L("Sp\xE9cial en \xE9cho", "Echo Special"), base: 0.2, desc: (v) => tr(`le sp\xE9cial se r\xE9p\xE8te, +${pct(v)}`, `the special repeats, +${pct(v)}`), apply: (s, v) => {
    s.specialEcho = true;
    s.specialMult += v;
  } },
  { id: "fork-cast", god: fork, slot: "cast", name: L("Sort fork\xE9", "Forked Cast"), base: 0.2, desc: (v) => tr(`le sort part en 3, +${pct(v)}`, `the cast splits in 3, +${pct(v)}`), apply: (s, v) => {
    s.castSplit = true;
    s.castMult += v;
  } },
  { id: "fork-dash", god: fork, slot: "dash", name: L("Dash fork\xE9", "Forked Dash"), base: 1, desc: (v) => tr(`+${num(v)} charge${v > 1 ? "s" : ""} de dash`, `+${num(v)} dash charge${v > 1 ? "s" : ""}`), apply: (s, v) => {
    s.dashCharges += v;
  } },
  { id: "fork-child", god: fork, slot: "passive", name: L("Processus enfant", "Child Process"), base: 1, desc: (v) => tr(`${num(v)} familier${v > 1 ? "s" : ""} t'accompagne${v > 1 ? "nt" : ""} dans chaque salle`, `${num(v)} familiar${v > 1 ? "s" : ""} join${v > 1 ? "" : "s"} you in every room`), apply: (s, v) => {
    s.summons += v;
  } },
  { id: "fork-bomb", god: fork, slot: "passive", name: "Fork bomb", base: 0.15, desc: (v) => tr(`${pct(v)} de chance qu'une victime devienne un familier`, `${pct(v)} chance a kill becomes a familiar`), apply: (s, v) => {
    s.killSummon += v;
  } },
  // Rebase: time slows, freezes, slips away.
  { id: "rebase-attack", god: rebase, slot: "attack", name: L("Attaque r\xE9troactive", "Retroactive Attack"), base: 0.3, desc: (v) => tr(`l'attaque ralentit de ${pct(v)}, +10%`, `the attack slows by ${pct(v)}, +10%`), apply: (s, v) => {
    s.onHit.attack.chill += v;
    s.attackMult += 0.1;
  } },
  { id: "rebase-special", god: rebase, slot: "special", name: L("Sp\xE9cial fig\xE9", "Frozen Special"), base: 0.25, desc: (v) => tr(`le sp\xE9cial ralentit de 50% et g\xE8le ${pct(v)} du temps`, `the special slows by 50% and freezes ${pct(v)} of the time`), apply: (s, v) => {
    s.onHit.special.chill += 0.5;
    s.onHit.special.freeze += v;
  } },
  { id: "rebase-cast", god: rebase, slot: "cast", name: L("Sort de stase", "Stasis Cast"), base: 0.6, desc: (v) => tr(`le sort g\xE8le (${pct(v)} de chance), +15%`, `the cast freezes (${pct(v)} chance), +15%`), apply: (s, v) => {
    s.onHit.cast.freeze += v;
    s.castMult += 0.15;
  } },
  { id: "rebase-dash", god: rebase, slot: "dash", name: L("Dash temporel", "Time Dash"), base: 12, desc: (v) => tr(`dash plus court \xE0 recharger, onde de ${num(v)} d\xE9g\xE2ts`, `dash recharges faster, ${num(v)}-damage wave`), apply: (s, v) => {
    s.dashCd *= 0.6;
    s.dashIframes += 0.1;
    s.dashNova += v;
    s.onHit.dash.chill += 0.3;
  } },
  { id: "rebase-passive", god: rebase, slot: "passive", name: L("Esquive temporelle", "Temporal Dodge"), base: 0.12, desc: (v) => tr(`+${pct(v)} esquive`, `+${pct(v)} dodge`), apply: (s, v) => {
    s.dodge += v;
  } },
  { id: "rebase-slow", god: rebase, slot: "passive", name: "Bisect", base: 0.3, desc: (v) => tr(`+${pct(v)} d\xE9g\xE2ts aux ennemis ralentis`, `+${pct(v)} damage to slowed foes`), apply: (s, v) => {
    s.chillDmg += v;
  } },
  // Lint: poison that stacks, thorns.
  { id: "lint-attack", god: lint, slot: "attack", name: L("Attaque toxique", "Toxic Attack"), base: 2, desc: (v) => tr(`l'attaque empoisonne (${num(v)}/s, cumulable \xD75)`, `the attack poisons (${num(v)}/s, stacks \xD75)`), apply: (s, v) => {
    s.onHit.attack.poison += v;
  } },
  { id: "lint-special", god: lint, slot: "special", name: L("Sp\xE9cial strict", "Strict Special"), base: 4, desc: (v) => tr(`le sp\xE9cial empoisonne (${num(v)}/s), +15%`, `the special poisons (${num(v)}/s), +15%`), apply: (s, v) => {
    s.onHit.special.poison += v;
    s.specialMult += 0.15;
  } },
  { id: "lint-cast", god: lint, slot: "cast", name: L("Sort de diagnostic", "Diagnostic Cast"), base: 5, desc: (v) => tr(`le sort empoisonne (${num(v)}/s), +20%`, `the cast poisons (${num(v)}/s), +20%`), apply: (s, v) => {
    s.onHit.cast.poison += v;
    s.castMult += 0.2;
  } },
  { id: "lint-dash", god: lint, slot: "dash", name: L("Dash \xE9pineux", "Thorny Dash"), base: 8, desc: (v) => tr(`le dash laisse des piques (${num(v)} d\xE9g\xE2ts)`, `the dash leaves spikes (${num(v)} damage)`), apply: (s, v) => {
    s.dashTrail += v;
  } },
  { id: "lint-passive", god: lint, slot: "passive", name: L("\xC9pines de style", "Style Thorns"), base: 6, desc: (v) => tr(`renvoie ${num(v)} d\xE9g\xE2ts au contact`, `deals ${num(v)} damage back on contact`), apply: (s, v) => {
    s.thorns += v;
  } },
  { id: "lint-strict", god: lint, slot: "passive", name: L("Mode strict", "Strict Mode"), base: 0.4, desc: (v) => tr(`poison +${pct(v)}`, `poison +${pct(v)}`), apply: (s, v) => {
    s.poisonMult += v;
  } },
  // Cache: heals and shields.
  { id: "cache-attack", god: cache, slot: "attack", name: L("Attaque m\xE9moris\xE9e", "Memoized Attack"), base: 0.5, desc: (v) => tr(`l'attaque soigne de ${num(v)} PV par touche, +10%`, `the attack heals ${num(v)} HP per hit, +10%`), apply: (s, v) => {
    s.hitHeal += v;
    s.attackMult += 0.1;
  } },
  { id: "cache-special", god: cache, slot: "special", name: L("Sp\xE9cial persistant", "Persistent Special"), base: 2, desc: (v) => tr(`chaque touche du sp\xE9cial donne ${num(v)} de bouclier, +15%`, `every special hit gives ${num(v)} shield, +15%`), apply: (s, v) => {
    s.shieldOnHit += v;
    s.specialMult += 0.15;
  } },
  { id: "cache-cast", god: cache, slot: "cast", name: L("Sort en cache", "Cached Cast"), base: 3, desc: (v) => tr(`le sort soigne de ${num(v)} par touche`, `the cast heals ${num(v)} per hit`), apply: (s, v) => {
    s.castHeal += v;
  } },
  { id: "cache-dash", god: cache, slot: "dash", name: L("Dash en cache", "Cached Dash"), base: 4, desc: (v) => tr(`chaque dash donne ${num(v)} de bouclier`, `every dash gives ${num(v)} shield`), apply: (s, v) => {
    s.dashShield += v;
  } },
  { id: "cache-passive", god: cache, slot: "passive", name: L("R\xE9cup\xE9ration", "Recovery"), base: 4, desc: (v) => tr(`+${num(v)} PV par victime`, `+${num(v)} HP per kill`), apply: (s, v) => {
    s.lifesteal += v;
  } },
  { id: "cache-shield", god: cache, slot: "passive", name: L("Cache chaud", "Warm Cache"), base: 10, desc: (v) => tr(`bouclier de ${num(v)} au d\xE9but de chaque salle, se recharge lentement`, `${num(v)} shield at the start of every room, slowly recharges`), apply: (s, v) => {
    s.shield += v;
    s.shieldRegen += 1;
  } },
  // Commit: health, armour, stun.
  { id: "commit-attack", god: commit, slot: "attack", name: L("Frappe atomique", "Atomic Strike"), base: 0.2, desc: (v) => tr(`attaque +${pct(v)}, critiques +50%`, `attack +${pct(v)}, crits +50%`), apply: (s, v) => {
    s.attackMult += v;
    s.critDmg += 0.5;
  } },
  { id: "commit-special", god: commit, slot: "special", name: L("Sp\xE9cial scell\xE9", "Sealed Special"), base: 0.3, desc: (v) => tr(`sp\xE9cial +${pct(v)}, \xE9tourdit`, `special +${pct(v)}, stuns`), apply: (s, v) => {
    s.specialMult += v;
    s.specialStun += 0.8;
    s.onHit.special.stun += 0.8;
  } },
  { id: "commit-cast", god: commit, slot: "cast", name: L("Sort sign\xE9", "Signed Cast"), base: 0.4, desc: (v) => tr(`sort +${pct(v)}, \xE9tourdit 1 s`, `cast +${pct(v)}, stuns for 1 s`), apply: (s, v) => {
    s.castMult += v;
    s.onHit.cast.stun += 1;
  } },
  { id: "commit-dash", god: commit, slot: "dash", name: L("Dash scell\xE9", "Sealed Dash"), base: 6, desc: (v) => tr(`onde \xE0 l'arriv\xE9e (${num(v)} d\xE9g\xE2ts) qui \xE9tourdit 0,8 s`, `wave on landing (${num(v)} damage) that stuns for 0.8 s`), apply: (s, v) => {
    s.dashNova += v;
    s.onHit.dash.stun += 0.8;
  } },
  { id: "commit-passive", god: commit, slot: "passive", name: "Constitution", base: 20, desc: (v) => tr(`+${num(v)} PV max`, `+${num(v)} max HP`), apply: (s, v) => {
    s.maxHp += v;
  } },
  { id: "commit-armor", god: commit, slot: "passive", name: L("Armure sign\xE9e", "Signed Armor"), base: 0.12, desc: (v) => tr(`r\xE9duit les d\xE9g\xE2ts subis de ${pct(v)}`, `cuts damage taken by ${pct(v)}`), apply: (s, v) => {
    s.armor += v;
  } },
  { id: "commit-rollback", god: commit, slot: "passive", name: "Rollback", base: 1, desc: () => tr("+1 D\xE9fi de la mort pour cette descente", "+1 Death Defiance for this run"), apply: () => {
  }, onPick: (run) => {
    run.defiance += 1;
  } },
  // Pipe: lightning that jumps, speed.
  { id: "pipe-attack", god: pipe, slot: "attack", name: L("Attaque pipelin\xE9e", "Pipelined Attack"), base: 0.2, desc: (v) => tr(`frappe ${pct(v)} plus vite, un \xE9clair saute \xE0 un voisin`, `strikes ${pct(v)} faster, lightning jumps to a neighbour`), apply: (s, v) => {
    s.attackSpeed += v;
    s.onHit.attack.chain += 1;
  } },
  { id: "pipe-special", god: pipe, slot: "special", name: L("Sp\xE9cial en tube", "Piped Special"), base: 2, desc: (v) => tr(`le sp\xE9cial lance un \xE9clair qui saute ${num(v)} fois`, `the special casts lightning that jumps ${num(v)} times`), apply: (s, v) => {
    s.onHit.special.chain += v;
  } },
  { id: "pipe-cast", god: pipe, slot: "cast", name: L("Flux continu", "Continuous Stream"), base: 0.5, desc: (v) => tr(`+1 sort, sort +${pct(v)}`, `+1 cast, cast +${pct(v)}`), apply: (s, v) => {
    s.castAmmo += 1;
    s.castMult += v;
  } },
  { id: "pipe-dash", god: pipe, slot: "dash", name: L("Dash \xE9lectrique", "Electric Dash"), base: 3, desc: (v) => tr(`le dash foudroie ${num(v)} ennemis proches`, `the dash zaps ${num(v)} nearby foes`), apply: (s, v) => {
    s.dashZap += v;
    s.dashCd *= 0.85;
  } },
  { id: "pipe-passive", god: pipe, slot: "passive", name: L("D\xE9bit", "Throughput"), base: 0.1, desc: (v) => tr(`+${pct(v)} d\xE9g\xE2ts`, `+${pct(v)} damage`), apply: (s, v) => {
    s.dmg += v;
  } },
  { id: "pipe-tee", god: pipe, slot: "passive", name: "tee", base: 0.25, desc: (v) => tr(`\xE9clairs +${pct(v)} et +1 saut`, `lightning +${pct(v)} and +1 jump`), apply: (s, v) => {
    s.chainDmg += v;
    s.chainBonus += 1;
  } }
]);
var DUO_BOONS = localizeAll([
  { id: "duo-grep-sudo", god: duoGod(G.grep, G.sudo), duo: [grep, sudo], slot: "passive", name: L("\u0152il de root", "Root Eye"), base: 0.25, desc: (v) => tr(`ce qui br\xFBle est marqu\xE9 ; marque +${pct(v)}`, `whatever burns is marked; mark +${pct(v)}`), apply: (s, v) => {
    s.burnMarks = true;
    s.markBonus += v;
  } },
  { id: "duo-sudo-lint", god: duoGod(G.sudo, G.lint), duo: [sudo, lint], slot: "passive", name: L("Fum\xE9es toxiques", "Toxic Fumes"), base: 0.2, desc: (v) => tr(`br\xFBl\xE9 et empoisonn\xE9 \xE0 la fois : les deux font double ; br\xFBlure +${pct(v)}`, `burned and poisoned at once: both deal double; burn +${pct(v)}`), apply: (s, v) => {
    s.toxicFire = true;
    s.burnMult += v;
  } },
  { id: "duo-rebase-commit", god: duoGod(G.rebase, G.commit), duo: [rebase, commit], slot: "passive", name: L("Gel du d\xE9p\xF4t", "Repo Freeze"), base: 0.2, desc: (v) => tr(`chaque coup sur un ennemi ralenti a ${pct(v)} de chance de le geler`, `every hit on a slowed foe has a ${pct(v)} chance to freeze it`), apply: (s, v) => {
    s.chillFreeze += v;
  } },
  { id: "duo-fork-pipe", god: duoGod(G.fork, G.pipe), duo: [fork, pipe], slot: "passive", name: L("\xC9clairs parall\xE8les", "Parallel Lightning"), base: 2, desc: (v) => tr(`les \xE9clairs sautent ${num(v)} fois de plus, l'attaque en lance un`, `lightning jumps ${num(v)} more times, the attack casts one`), apply: (s, v) => {
    s.chainBonus += v;
    s.onHit.attack.chain += 1;
  } },
  { id: "duo-cache-commit", god: duoGod(G.cache, G.commit), duo: [cache, commit], slot: "passive", name: L("Sauvegarde incr\xE9mentale", "Incremental Backup"), base: 10, desc: (v) => tr(`les soins en trop deviennent bouclier ; bouclier +${num(v)}`, `overhealing turns into shield; shield +${num(v)}`), apply: (s, v) => {
    s.healToShield = true;
    s.shield += v;
  } },
  { id: "duo-grep-fork", god: duoGod(G.grep, G.fork), duo: [grep, fork], slot: "passive", name: L("Recherche parall\xE8le", "Parallel Search"), base: 1, desc: (v) => tr(`+${num(v)} projectile par attaque, tous \xE0 t\xEAte chercheuse et marquants`, `+${num(v)} projectile per attack, all homing and marking`), apply: (s, v) => {
    s.extraShots += v;
    s.homing += 3;
    s.onHit.attack.mark += 1.5;
  } },
  { id: "duo-lint-rebase", god: duoGod(G.lint, G.rebase), duo: [lint, rebase], slot: "passive", name: L("R\xE9gression lente", "Slow Regression"), base: 0.3, desc: (v) => tr(`le poison ralentit de ${pct(v)} et se propage \xE0 la mort`, `poison slows by ${pct(v)} and spreads on death`), apply: (s, v) => {
    s.poisonChill += v;
    s.poisonSpread = true;
  } },
  { id: "duo-pipe-sudo", god: duoGod(G.pipe, G.sudo), duo: [pipe, sudo], slot: "passive", name: L("Surtension", "Power Surge"), base: 6, desc: (v) => tr(`les \xE9clairs br\xFBlent (${num(v)}/s), +1 saut`, `lightning burns (${num(v)}/s), +1 jump`), apply: (s, v) => {
    s.chainBurn += v;
    s.chainBonus += 1;
  } },
  { id: "duo-fork-cache", god: duoGod(G.fork, G.cache), duo: [fork, cache], slot: "passive", name: L("Processus orphelins", "Orphan Processes"), base: 1, desc: (v) => tr(`+${num(v)} familier par salle, +3 PV par victime`, `+${num(v)} familiar per room, +3 HP per kill`), apply: (s, v) => {
    s.summons += v;
    s.lifesteal += 3;
  } },
  { id: "duo-rebase-grep", god: duoGod(G.rebase, G.grep), duo: [rebase, grep], slot: "passive", name: "git bisect", base: 0.25, desc: (v) => tr(`marquer ralentit de 30% ; +${pct(v)} d\xE9g\xE2ts aux ralentis`, `marking slows by 30%; +${pct(v)} damage to slowed foes`), apply: (s, v) => {
    s.markChill += 0.3;
    s.chillDmg += v;
  } },
  { id: "duo-commit-lint", god: duoGod(G.commit, G.lint), duo: [commit, lint], slot: "passive", name: "Hook pre-commit", base: 4, desc: (v) => tr(`bless\xE9, tu empoisonnes tout autour (${num(v)}/s) ; \xE9pines \xD72`, `when hurt, you poison all around (${num(v)}/s); thorns \xD72`), apply: (s, v) => {
    s.hurtPoison += v;
    s.thorns *= 2;
  } },
  { id: "duo-pipe-rebase", god: duoGod(G.pipe, G.rebase), duo: [pipe, rebase], slot: "passive", name: L("Flux tendu", "Just in Time"), base: 0.15, desc: (v) => tr(`chaque victime recharge le dash ; frappe ${pct(v)} plus vite`, `every kill recharges the dash; strikes ${pct(v)} faster`), apply: (s, v) => {
    s.dashOnKill = true;
    s.attackSpeed += v;
  } },
  { id: "duo-sudo-commit", god: duoGod(G.sudo, G.commit), duo: [sudo, commit], slot: "passive", name: L("Force majeure", "Force Majeure"), base: 0.08, desc: (v) => tr(`ex\xE9cute ${pct(v)} plus haut ; les critiques font +50%`, `executes ${pct(v)} higher; crits deal +50%`), apply: (s, v) => {
    s.execute += v;
    s.critDmg += 0.5;
  } }
]);
var ITEMS = localizeAll([
  { id: "i-double", name: L("Double tir", "Double Shot"), desc: L("chaque attaque tire un projectile de plus", "every attack fires one more projectile"), apply: (s) => {
    s.extraShots += 1;
  } },
  { id: "i-homing", name: L("T\xEAte chercheuse", "Homing Head"), desc: L("les projectiles suivent les ennemis", "projectiles follow foes"), apply: (s) => {
    s.homing += 4;
  } },
  { id: "i-big", name: L("Gros fichier", "Big File"), desc: L("projectiles plus gros, +10% d\xE9g\xE2ts", "bigger projectiles, +10% damage"), apply: (s) => {
    s.projSize += 1;
    s.dmg += 0.1;
  } },
  { id: "i-pierce", name: "--force", desc: L("les fl\xE8ches et les sorts transpercent", "arrows and casts pierce"), apply: (s) => {
    s.pierce = true;
    s.castMult += 0.1;
  } },
  { id: "i-ricochet", name: L("Rebond r\xE9seau", "Network Bounce"), desc: L("les projectiles rebondissent vers un autre ennemi", "projectiles bounce to another foe"), apply: (s) => {
    s.ricochet += 1;
  } },
  { id: "i-orbital", name: L("Daemon orbital", "Orbital Daemon"), desc: L("une lame tourne autour de toi", "a blade circles around you"), apply: (s) => {
    s.orbitals += 1;
  } },
  { id: "i-explode", name: "rm -rf", desc: L("les ennemis explosent en mourant (10 d\xE9g\xE2ts)", "foes explode when they die (10 damage)"), apply: (s) => {
    s.explodeOnKill += 10;
  } },
  { id: "i-dash", name: L("Second souffle", "Second Wind"), desc: L("+1 charge de dash", "+1 dash charge"), apply: (s) => {
    s.dashCharges += 1;
  } },
  { id: "i-freeze", name: L("Gla\xE7on", "Ice Cube"), desc: L("chaque coup a 8% de chance de geler", "every hit has an 8% chance to freeze"), apply: (s) => {
    for (const src of SRCS) s.onHit[src].freeze += 0.08;
  } },
  { id: "i-burn", name: L("Allumette", "Matchstick"), desc: L("tous tes coups br\xFBlent (2/s)", "all your hits burn (2/s)"), apply: (s) => {
    for (const src of SRCS) s.onHit[src].burn += 2;
  } },
  { id: "i-poison", name: L("Seringue", "Syringe"), desc: L("tous tes coups empoisonnent (1/s)", "all your hits poison (1/s)"), apply: (s) => {
    for (const src of SRCS) s.onHit[src].poison += 1;
  } },
  { id: "i-chain", name: L("Bobine Tesla", "Tesla Coil"), desc: L("attaque et sort lancent un \xE9clair", "attack and cast throw lightning"), apply: (s) => {
    s.onHit.attack.chain += 1;
    s.onHit.cast.chain += 1;
  } },
  { id: "i-crit", name: L("Tr\xE8fle", "Clover"), desc: L("+8% critique", "+8% crit"), apply: (s) => {
    s.crit += 0.08;
  } },
  { id: "i-critdmg", name: L("Loupe", "Magnifier"), desc: L("critiques +60%", "crits +60%"), apply: (s) => {
    s.critDmg += 0.6;
  } },
  { id: "i-heart", name: L("C\u0153ur de rechange", "Spare Heart"), desc: L("+15 PV max", "+15 max HP"), apply: (s) => {
    s.maxHp += 15;
  } },
  { id: "i-armor", name: L("Casque", "Helmet"), desc: L("r\xE9duit les d\xE9g\xE2ts subis de 10%", "cuts damage taken by 10%"), apply: (s) => {
    s.armor += 0.1;
  } },
  { id: "i-shield", name: L("Bouclier d'\xE9nergie", "Energy Shield"), desc: L("bouclier de 8 \xE0 chaque salle, se recharge", "8 shield every room, recharges"), apply: (s) => {
    s.shield += 8;
    s.shieldRegen += 0.5;
  } },
  { id: "i-speed", name: L("Caf\xE9", "Coffee"), desc: L("frappe 15% plus vite", "strikes 15% faster"), apply: (s) => {
    s.attackSpeed += 0.15;
  } },
  { id: "i-vamp", name: L("Dent de vampire", "Vampire Fang"), desc: L("+2 PV par victime", "+2 HP per kill"), apply: (s) => {
    s.lifesteal += 2;
  } },
  { id: "i-familiar", name: L("Petit d\xE9mon", "Little Demon"), desc: L("un familier de plus dans chaque salle", "one more familiar in every room"), apply: (s) => {
    s.summons += 1;
  } },
  { id: "i-greed", name: L("Tirelire", "Piggy Bank"), desc: L("+1 \xE9clat par victime, +15 \xE9clats tout de suite", "+1 shard per kill, +15 shards right now"), apply: (s) => {
    s.killShards += 1;
  }, onPick: (run) => {
    run.eclats += 15;
  } },
  { id: "i-regen", name: L("Bandage", "Bandage"), desc: L("+5 PV \xE0 chaque salle nettoy\xE9e", "+5 HP for every room cleared"), apply: (s) => {
    s.roomHeal += 5;
  } },
  { id: "i-boss", name: L("Tueur de gardiens", "Guardian Slayer"), desc: L("+25% d\xE9g\xE2ts aux gardiens", "+25% damage to guardians"), apply: (s) => {
    s.bossDmg += 0.25;
  } },
  { id: "i-glass", name: L("Canon de verre", "Glass Cannon"), desc: L("+40% d\xE9g\xE2ts, \u221215 PV max", "+40% damage, \u221215 max HP"), apply: (s) => {
    s.dmg += 0.4;
    s.maxHp -= 15;
  } },
  { id: "i-mark", name: L("Lunette", "Scope"), desc: L("tous tes coups marquent 2 s", "all your hits mark for 2 s"), apply: (s) => {
    for (const src of SRCS) s.onHit[src].mark += 2;
  } },
  { id: "i-panic", name: L("Mode panique", "Panic Mode"), desc: L("+50% d\xE9g\xE2ts sous 35% de PV", "+50% damage under 35% HP"), apply: (s) => {
    s.lowHpDmg += 0.5;
  } },
  { id: "i-ammo", name: L("Munitions", "Ammo"), desc: L("+1 sort", "+1 cast"), apply: (s) => {
    s.castAmmo += 1;
  } },
  { id: "i-nova", name: L("Retour de flamme", "Backfire"), desc: L("bless\xE9, tu repousses une onde de 15 d\xE9g\xE2ts", "when hurt, you push out a 15-damage wave"), apply: (s) => {
    s.hurtNova += 15;
  } },
  { id: "i-luck", name: L("Patte de lapin", "Rabbit's Foot"), desc: L("bienfaits plus rares, \u221215% en boutique", "rarer boons, \u221215% in the shop"), apply: (s) => {
    s.luck += 0.15;
    s.shopDiscount += 0.15;
  } }
].map((item) => ({
  // `name` and `desc` are still two-language here: the table is localized once mapped.
  id: item.id,
  god: L("Tr\xE9sor", "Treasure"),
  slot: "item",
  name: item.name,
  base: 1,
  isItem: true,
  desc: () => String(item.desc),
  apply: (s) => item.apply(s),
  onPick: item.onPick
})));
var BOONS = [...GOD_BOONS, ...DUO_BOONS, ...ITEMS];
var SLOT_LABEL = localize({
  attack: L("Attaque", "Attack"),
  special: L("Sp\xE9cial", "Special"),
  cast: L("Sort", "Cast"),
  dash: "Dash",
  passive: L("Passif", "Passive"),
  item: L("Objet", "Item")
});
var RARITY = localizeAll([
  { label: L("Commun", "Common"), mult: 1 },
  { label: "Rare", mult: 1.5 },
  { label: L("\xC9pique", "Epic"), mult: 2 },
  { label: L("H\xE9ro\xEFque", "Heroic"), mult: 2.5 },
  { label: "Duo", mult: 1 },
  { label: L("Objet", "Item"), mult: 1 }
]);
var MIRROR = localizeAll([
  { id: "vigueur", name: L("Vigueur", "Vigor"), desc: L("+8 PV max par rang", "+8 max HP per rank"), costs: [10, 20, 35, 55, 80] },
  { id: "force", name: L("Force", "Strength"), desc: L("+8% d\xE9g\xE2ts par rang", "+8% damage per rank"), costs: [25, 50, 90] },
  { id: "chance", name: L("Chance", "Luck"), desc: L("+5% critique par rang", "+5% crit per rank"), costs: [15, 30, 50] },
  { id: "defi", name: L("D\xE9fi de la mort", "Death Defiance"), desc: L("revient \xE0 50% PV une fois par rang", "back at 50% HP once per rank"), costs: [60, 120] },
  { id: "fortune", name: "Fortune", desc: L("+20% \xE9clats par rang", "+20% shards per rank"), costs: [20, 40, 70] },
  { id: "eclaireur", name: L("\xC9claireur", "Scout"), desc: L("commence avec un bienfait", "start with a boon"), costs: [40] }
]);
var ERROR_NAMES = [
  [/\bTypeError\b/, "TypeError", L("le Spectre Ind\xE9fini", "the Undefined Specter")],
  [/\bReferenceError\b/, "ReferenceError", L("le Fant\xF4me Non D\xE9clar\xE9", "the Undeclared Ghost")],
  [/\bSyntaxError\b/, "SyntaxError", L("la Chim\xE8re Mal Ferm\xE9e", "the Unclosed Chimera")],
  [/\berror TS\d+/, "TSError", L("le Golem Mal Typ\xE9", "the Mistyped Golem")],
  [/\bENOENT\b|No such file or directory/, "ENOENT", L("le Chemin Perdu", "the Lost Path")],
  [/\bEADDRINUSE\b/, "EADDRINUSE", L("le Squatteur de Port", "the Port Squatter")],
  [/\bECONNREFUSED\b/, "ECONNREFUSED", L("la Porte Close", "the Closed Door")],
  [/\bEACCES\b|Permission denied/, "EACCES", L("le Gardien Jaloux", "the Jealous Warden")],
  [/command not found/, "CommandNotFound", L("l'\xC9cho Sans Commande", "the Commandless Echo")],
  [/Traceback \(most recent call last\)/, "Traceback", L("le Serpent Trac\xE9", "the Traced Serpent")],
  [/\bpanicked at\b|\bpanic:/, "Panic", L("la Rouille Hurlante", "the Howling Rust")],
  [/Segmentation fault/, "Segfault", L("le D\xE9chireur de M\xE9moire", "the Memory Ripper")],
  [/timed? ?out\b|Timeout/i, "Timeout", L("la Liche du D\xE9lai", "the Timeout Lich")],
  [/\bFAIL\b|failed\b.*\btests?\b|\btests? failed/i, "TestFail", L("le Juge Rouge", "the Red Judge")],
  [/CONFLICT|merge conflict/i, "Conflict", L("le Merge Maudit", "the Cursed Merge")],
  [/error:/i, "Error", L("la B\xEAte Anonyme", "the Nameless Beast")]
].map((entry) => localize(entry));
var ERROR_EPITHETS = localize([
  L("la Goule Asynchrone", "the Async Ghoul"),
  L("le Rongeur de Pile", "the Stack Gnawer"),
  L("l'Ombre du Cache", "the Cache Shade"),
  L("la Larve Nulle", "the Null Larva"),
  L("le D\xE9mon du Build", "the Build Demon"),
  L("l'\xC2me Non Typ\xE9e", "the Untyped Soul"),
  L("le Ver de D\xE9pendance", "the Dependency Worm")
]);
var BOSSES = localize([
  L("Le Merge Conflict", "The Merge Conflict"),
  L("Le D\xE9mon de la Prod", "The Prod Demon"),
  L("L'Hydre des D\xE9pendances", "The Dependency Hydra")
]);
var DEFAULT_BIOMES = localize([
  L("Les Racines du D\xE9p\xF4t", "The Roots of the Repo"),
  L("Les Abysses de node_modules", "The Depths of node_modules"),
  L("Le C\u0153ur du Monolithe", "The Heart of the Monolith")
]);
var DEFAULT_CHAMBERS = localize([
  L("Salle des Logs", "Hall of Logs"),
  L("Couloir des Imports", "Corridor of Imports"),
  L("Crypte des Tests", "Crypt of Tests"),
  L("Archives du Changelog", "Changelog Archives"),
  L("Puits du Cache", "Cache Well"),
  L("Galerie des Types", "Gallery of Types"),
  L("Forge du Build", "Build Forge"),
  L("Chapelle du Linter", "Linter Chapel")
]);

// hooks/sim.ts
var FW = 160;
var FH = 100;
var ROOM = { x0: 8, y0: 18, x1: 152, y1: 94 };
var MID_Y = Math.round((ROOM.y0 + ROOM.y1) / 2);
var ENEMY = {
  rat: { hp: 16, r: 4, speed: 46, dmg: 5, range: 16, windup: 0.42, act: 0.14, recover: 0.55, level: 1, keep: 0, cd: 0.3 },
  goblin: { hp: 26, r: 4, speed: 34, dmg: 8, range: 13, windup: 0.5, act: 0.2, recover: 0.6, level: 2, keep: 0, cd: 0.4 },
  slug: { hp: 20, r: 4, speed: 20, dmg: 6, range: 64, windup: 0.6, act: 0.1, recover: 1.2, level: 2, keep: 40, cd: 0.8 },
  skeleton: { hp: 32, r: 4, speed: 30, dmg: 10, range: 60, windup: 0.65, act: 0.42, recover: 0.8, level: 3, keep: 0, cd: 0.8 },
  larva: { hp: 8, r: 3, speed: 55, dmg: 3, range: 12, windup: 0.34, act: 0.12, recover: 0.45, level: 1, keep: 0, cd: 0.2 },
  bug: { hp: 4, r: 2, speed: 58, dmg: 2, range: 10, windup: 0.32, act: 0.1, recover: 0.5, level: 0, keep: 0, cd: 0.3 },
  linter: { hp: 24, r: 4, speed: 24, dmg: 5, range: 72, windup: 0.65, act: 0.1, recover: 1.5, level: 2, keep: 50, cd: 1 },
  forker: { hp: 30, r: 4, speed: 22, dmg: 0, range: 130, windup: 0.9, act: 0.1, recover: 3.2, level: 3, keep: 60, cd: 1 },
  turret: { hp: 44, r: 5, speed: 0, dmg: 6, range: 400, windup: 0.7, act: 0.1, recover: 1.4, level: 3, keep: 0, cd: 1.4 },
  miner: { hp: 24, r: 4, speed: 34, dmg: 9, range: 400, windup: 0.4, act: 0.1, recover: 2.2, level: 2, keep: 38, cd: 1 },
  burrower: { hp: 28, r: 4, speed: 38, dmg: 9, range: 0, windup: 0.75, act: 0.1, recover: 1.5, level: 3, keep: 0, cd: 1.2 },
  monolith: { hp: 46, r: 6, speed: 18, dmg: 9, range: 16, windup: 0.65, act: 0.15, recover: 0.9, level: 3, keep: 0, cd: 0.5 },
  micro: { hp: 12, r: 3, speed: 44, dmg: 4, range: 13, windup: 0.36, act: 0.12, recover: 0.5, level: 1, keep: 0, cd: 0.4 },
  sentinel: { hp: 38, r: 5, speed: 24, dmg: 9, range: 15, windup: 0.55, act: 0.2, recover: 0.8, level: 3, keep: 0, cd: 0.6 },
  reviewer: { hp: 22, r: 4, speed: 26, dmg: 4, range: 12, windup: 0.9, act: 0.1, recover: 2.8, level: 2, keep: 52, cd: 1.5 },
  leak: { hp: 14, r: 4, speed: 40, dmg: 12, range: 15, windup: 0.75, act: 0.1, recover: 0.1, level: 2, keep: 0, cd: 0 },
  sniper: { hp: 20, r: 4, speed: 28, dmg: 10, range: 130, windup: 1, act: 0.1, recover: 1.6, level: 3, keep: 72, cd: 1.2 },
  boss: { hp: 280, r: 9, speed: 26, dmg: 12, range: 0, windup: 0.8, act: 0.6, recover: 1.2, level: 10, keep: 36, cd: 1 }
};
var NAMES = localize({
  rat: L("Rat de node_modules", "node_modules Rat"),
  goblin: L("Gobelin TODO", "TODO Goblin"),
  slug: L("Warning Rampant", "Crawling Warning"),
  skeleton: L("Squelette Legacy", "Legacy Skeleton"),
  larva: L("Larve", "Larva"),
  bug: "Bug",
  linter: L("Pr\xEAcheur du Lint", "Lint Preacher"),
  forker: L("N\xE9cromant du Fork", "Fork Necromancer"),
  turret: L("Tourelle CI", "CI Turret"),
  miner: L("Poseur de Breakpoints", "Breakpoint Layer"),
  burrower: L("Ver de Cache", "Cache Worm"),
  monolith: L("Monolithe Gluant", "Sticky Monolith"),
  micro: "Microservice",
  sentinel: L("Sentinelle CORS", "CORS Sentinel"),
  reviewer: L("Relecteur LGTM", "LGTM Reviewer"),
  leak: L("Fuite M\xE9moire", "Memory Leak"),
  sniper: L("Profileur Embusqu\xE9", "Lurking Profiler"),
  boss: L("Gardien", "Guardian")
});
var AFFIX_LABEL = localize({ rapide: L("rapide", "swift"), volatile: L("volatile", "volatile"), scinde: L("scind\xE9", "splitting"), blinde: L("blind\xE9", "armored") });
var GUARDIANS = localizeAll([
  // Le Merge Conflict: lanes and crossings, HEAD against incoming.
  { p1: ["cross", "burst", "charge", "fan"], p2: ["rows", "spiral", "charge", "cross", "summon", "burst", "cols"], adds: "micro", addName: L("Hunk orphelin", "Orphan Hunk"), addCount: 3, roar: L("Le conflit s\u2019envenime !", "The conflict festers!"), isBurning: false },
  // Le Démon de la Prod: incidents raining down, the floor on fire.
  { p1: ["fan", "rain", "slam", "burst"], p2: ["rain", "spiral", "fan", "summon", "slam", "rain"], adds: "leak", addName: L("Incident", "Incident"), addCount: 2, roar: L("La prod est en feu !", "Prod is on fire!"), isBurning: true },
  // L'Hydre des Dépendances: heads that aim, a swarm of transitive deps.
  { p1: ["snipe", "burst", "summon", "cols"], p2: ["grid", "snipe", "spiral", "summon", "rain", "snipe"], adds: "bug", addName: L("D\xE9pendance transitive", "Transitive Dependency"), addCount: 5, roar: L("Deux t\xEAtes repoussent !", "Two heads grow back!"), isBurning: false }
]);
var roomCount = Math.floor(Math.random() * 1e6);
function blocked(live, x, y, r) {
  if (x - r < ROOM.x0 || x + r > ROOM.x1 || y - r < ROOM.y0 || y + r > ROOM.y1) return true;
  return live.pillars.some((p) => x + r > p.x && x - r < p.x + p.w && y + r > p.y && y - r < p.y + p.h);
}
function rayToWall(live, x, y, dx, dy, max = 220) {
  for (let d = 4; d < max; d += 2) if (blocked(live, x + dx * d, y + dy * d, 0.5)) return d;
  return max;
}

// hooks/render.ts
var FRAME_TOP = 10;
var frameSize = (res) => res > 1 ? { width: FW * res, height: (FH - FRAME_TOP) * res } : { width: FW, height: FH };
var S = 1;
var RW = FW;
var RH = FH;
function dot(b, xi, yi, c, a = 1) {
  if (xi < 0 || yi < 0 || xi >= RW || yi >= RH) return;
  const i = (yi * RW + xi) * 4;
  if (a >= 1) {
    b.px[i] = c[0];
    b.px[i + 1] = c[1];
    b.px[i + 2] = c[2];
  } else if (a > 0) {
    b.px[i] = b.px[i] + (c[0] - b.px[i]) * a;
    b.px[i + 1] = b.px[i + 1] + (c[1] - b.px[i + 1]) * a;
    b.px[i + 2] = b.px[i + 2] + (c[2] - b.px[i + 2]) * a;
  }
}
var fx0 = (b, x) => Math.round((x + b.ox) * S);
var fy0 = (b, y) => Math.round((y + b.oy) * S);
function put(b, x, y, c, a = 1) {
  const xi = fx0(b, x);
  const yi = fy0(b, y);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) dot(b, xi + i, yi + j, c, a);
}
function fput(b, x, y, c, a = 1) {
  dot(b, Math.round((x + b.ox) * S), Math.round((y + b.oy) * S), c, a);
}
function rect(b, x, y, w, h, c, a = 1) {
  const x0 = fx0(b, x);
  const y0 = fy0(b, y);
  const x1 = Math.round((x + w + b.ox) * S);
  const y1 = Math.round((y + h + b.oy) * S);
  for (let j = Math.max(0, y0); j < Math.min(RH, y1); j++) for (let i = Math.max(0, x0); i < Math.min(RW, x1); i++) dot(b, i, j, c, a);
}
function disc(b, cx, cy, r, c, a = 1) {
  const R = r * S + (S > 1 ? 0.5 : 0);
  const x = (cx + b.ox) * S;
  const y = (cy + b.oy) * S;
  for (let j = Math.floor(-R); j <= Math.ceil(R); j++) for (let i = Math.floor(-R); i <= Math.ceil(R); i++) if (i * i + j * j <= R * R) dot(b, Math.round(x + i), Math.round(y + j), c, a);
}
function ball(b, cx, cy, r, c, a = 1) {
  if (S === 1) return disc(b, cx, cy, r, c, a);
  const R = r * S + 0.5;
  const x = (cx + b.ox) * S;
  const y = (cy + b.oy) * S;
  for (let j = Math.floor(-R); j <= Math.ceil(R); j++) for (let i = Math.floor(-R); i <= Math.ceil(R); i++) {
    const d = i * i + j * j;
    if (d > R * R) continue;
    const l = (i + j) / (R * 1.4);
    const k = d > (R - 1.2) ** 2 ? 0.55 : 1 - l * 0.35;
    const hi = (i + R * 0.4) ** 2 + (j + R * 0.4) ** 2 < (R * 0.22) ** 2;
    dot(b, Math.round(x + i), Math.round(y + j), hi ? [Math.min(245, c[0] + 90), Math.min(245, c[1] + 90), Math.min(245, c[2] + 80)] : [c[0] * k, c[1] * k, Math.min(255, c[2] * k + (k < 0.8 ? 8 : 0))], a);
  }
}
function circle(b, cx, cy, r, c, a = 1) {
  const steps = Math.max(12, Math.round(r * 7 * S));
  for (let i = 0; i < steps; i++) {
    const t = i / steps * Math.PI * 2;
    fput(b, cx + Math.cos(t) * r, cy + Math.sin(t) * r, c, a);
  }
}
function line(b, x0, y0, x1, y1, c, a = 1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * S));
  for (let i = 0; i <= n; i++) fput(b, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c, a);
}
function shadow(b, cx, cy, rx, ry, a = 0.4) {
  if (S === 1) return rect(b, cx - rx, cy, rx * 2, 1, P.k, a);
  const X = (cx + b.ox) * S;
  const Y = (cy + b.oy) * S;
  const RX = rx * S;
  const RY = ry * S;
  for (let j = Math.floor(-RY); j <= Math.ceil(RY); j++) for (let i = Math.floor(-RX); i <= Math.ceil(RX); i++) {
    const d = (i / RX) ** 2 + (j / RY) ** 2;
    if (d < 1) dot(b, Math.round(X + i), Math.round(Y + j), P.k, a * (1 - d * d));
  }
}
function blit(b, s, cx, by, opts = {}) {
  const x0 = Math.round(cx - s.w / 2);
  const y0 = Math.round(by - s.h);
  for (let y = 0; y < s.h; y++) {
    const row = s.rows[y] ?? "";
    for (let x = 0; x < s.w; x++) {
      let ch = row[opts.flip ? s.w - 1 - x : x] ?? ".";
      if (ch === ".") continue;
      if (opts.swap?.[ch]) ch = opts.swap[ch];
      const c = opts.tint && ch !== "k" ? opts.tint : P[ch];
      if (c) put(b, x0 + x, y0 + y, c, opts.alpha ?? 1);
    }
  }
}
function blitFine(b, s, cx, by, opts = {}) {
  const sx = opts.sx ?? 1;
  const sy = opts.sy ?? 1;
  const W = Math.max(1, Math.round(s.w * sx));
  const H = Math.max(1, Math.round(s.h * sy));
  const x0 = Math.round((cx + b.ox) * S - W / 2);
  const y0 = Math.round((by + b.oy) * S - H);
  const mul = opts.mul;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(s.h - 1, Math.floor(y / sy));
    for (let x = 0; x < W; x++) {
      const fx = Math.min(s.w - 1, Math.floor(x / sx));
      const k = fy * s.w + (opts.flip ? s.w - 1 - fx : fx);
      let ch = s.ch[k];
      if (ch === ".") continue;
      if (opts.swap?.[ch]) ch = opts.swap[ch];
      const base = opts.tint && ch !== "k" ? opts.tint : P[ch];
      if (!base) continue;
      let c = lit(base, s.light[k]);
      if (mul) c = [Math.min(245, c[0] * mul[0]), Math.min(245, c[1] * mul[1]), Math.min(245, c[2] * mul[2])];
      dot(b, x0 + x, y0 + y, c, opts.alpha ?? 1);
    }
  }
}
function sprite2(b, coarse, fine, cx, by, opts = {}) {
  if (S > 1 && fine) blitFine(b, fine, cx, by, opts);
  else blit(b, coarse, cx, by, opts);
}
var scale = 1;
var VW = FW;
var VH = FH;
var hasWorldText = true;
var worldScale = () => S > 1 ? 1 / S : scale;
function text(b, raw2, x, y, c, shadow2 = true) {
  const s = fold(raw2);
  let cx = Math.round(x);
  for (const ch of s) {
    const g = glyph(ch);
    if (g) {
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
        if (g[j * 3 + i] !== "1") continue;
        if (shadow2) rect(b, cx + (i + 1) * scale, y + (j + 1) * scale, scale, scale, P.k);
        rect(b, cx + i * scale, y + j * scale, scale, scale, c);
      }
    }
    cx += 4 * scale;
  }
}
var textWidth = (raw2) => (fold(raw2).length * 4 - 1) * scale;
function centered(b, raw2, y, c) {
  text(b, raw2, Math.round((VW - textWidth(raw2)) / 2), y, c);
}
function wrapLines(raw2) {
  const lines = [];
  let line2 = "";
  for (const word of fold(raw2).split(" ").filter(Boolean)) {
    const next = line2 ? `${line2} ${word}` : word;
    if (textWidth(next) > VW - 4 && line2) {
      lines.push(line2);
      line2 = word;
    } else line2 = next;
  }
  if (line2) lines.push(line2);
  return lines;
}
function banner(b, raw2, mid, c, alpha) {
  const lines = wrapLines(raw2);
  const h = lines.length * 7;
  const top = Math.round(mid - h / 2);
  rect(b, 0, top - 3, VW, h + 5, P.k, alpha);
  lines.forEach((line2, i) => centered(b, line2, top + i * 7, c));
}
function tileNoise(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2246822519 | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function drawRoom(b, live) {
  const tone = BIOME_TONES[Math.min(live.biome, BIOME_TONES.length - 1)];
  for (let ty = ROOM.y0; ty < ROOM.y1 + 2; ty += 8) {
    for (let tx = ROOM.x0 - 2; tx < ROOM.x1 + 2; tx += 8) {
      const n = tileNoise(tx, ty, live.biome * 31 + live.depth);
      const base = tone.floor[(tx / 8 + ty / 8) % 2 === 0 ? 0 : 1];
      rect(b, tx, ty, 8, 8, base);
      put(b, tx, ty, tone.crack);
      if (n < 0.25) line(b, tx + 2, ty + 2 + Math.floor(n * 16), tx + 5, ty + 5, tone.crack);
      if (n > 0.92) put(b, tx + 4, ty + 3, tone.wallTop, 0.5);
    }
  }
  rect(b, 0, 10, FW, ROOM.y0 - 10, tone.wall);
  rect(b, 0, 10, FW, 1, tone.wallTop);
  for (let x = 0; x < FW; x += 6) rect(b, x, 12 + x / 6 % 2, 1, ROOM.y0 - 13, tone.crack, 0.6);
  rect(b, 0, ROOM.y0 - 1, FW, 1, P.k, 0.6);
  rect(b, 0, 10, ROOM.x0, FH - 10, tone.wall);
  rect(b, ROOM.x1, 10, FW - ROOM.x1, FH - 10, tone.wall);
  rect(b, ROOM.x0 - 1, ROOM.y0, 1, ROOM.y1 - ROOM.y0, tone.wallTop, 0.5);
  rect(b, ROOM.x1, ROOM.y0, 1, ROOM.y1 - ROOM.y0, P.k, 0.5);
  rect(b, 0, ROOM.y1, FW, FH - ROOM.y1, tone.wall);
  rect(b, 0, ROOM.y1, FW, 1, tone.wallTop, 0.6);
  drawDoors(b, live);
  for (const p of live.pillars) {
    rect(b, p.x + 2, p.y + p.h, p.w, 3, P.k, 0.35);
    rect(b, p.x, p.y - 4, p.w, p.h + 4, tone.pillar);
    rect(b, p.x, p.y - 4, p.w, 2, tone.wallTop);
    rect(b, p.x + p.w - 2, p.y - 2, 2, p.h + 2, tone.wall);
  }
}
var staticFor = null;
var staticRes = 0;
var staticCleared = false;
var staticPx = new Uint8Array(0);
var mix = (c, k, add = 0) => [Math.max(0, Math.min(245, c[0] * k + add)), Math.max(0, Math.min(245, c[1] * k + add)), Math.max(0, Math.min(245, c[2] * k + add))];
function paintStatic(live) {
  const tone = BIOME_TONES[Math.min(live.biome, BIOME_TONES.length - 1)];
  const seed = live.biome * 31 + live.depth * 7 + (live.doors[0]?.to ?? 0) * 13;
  const b = { px: staticPx, ox: 0, oy: -FRAME_TOP };
  staticPx.fill(255);
  const moss = live.biome === 1 ? [150, 70, 30] : live.biome === 2 ? [70, 140, 110] : [70, 110, 60];
  for (let y = 0; y < RH; y++) {
    const wy = y / S + FRAME_TOP;
    for (let x = 0; x < RW; x++) {
      const wx = x / S;
      const inFloor = wx >= ROOM.x0 && wx < ROOM.x1 && wy >= ROOM.y0 && wy < ROOM.y1;
      let c;
      if (inFloor) {
        const row = Math.floor((wy - ROOM.y0) / 8);
        const sx = wx - ROOM.x0 + row % 2 * 4;
        const col = Math.floor(sx / 8);
        const lx = Math.floor(sx % 8 * S);
        const ly = Math.floor((wy - ROOM.y0) % 8 * S);
        const T = 8 * S;
        const n = tileNoise(col, row, seed);
        const base = tone.floor[(col + row) % 2];
        let k = 0.9 + n * 0.22;
        if (lx === 0 || ly === 0) k = 0.55;
        else if (lx === 1 || ly === 1) k += 0.14;
        else if (lx === T - 1 || ly === T - 1) k -= 0.16;
        k += (tileNoise(Math.floor(wx), Math.floor(wy), seed + 5) - 0.5) * 0.1;
        c = mix(base, k);
        const cn = tileNoise(col * 3 + 1, row * 5 + 2, seed);
        if (cn < 0.22 && Math.abs(ly - (T * 0.3 + lx * (cn * 3 - 0.3))) < 0.7 && lx > 2 && lx < T - 3) c = mix(tone.crack, 0.9);
        if (cn > 0.85 && lx + ly < T * 0.5 && tileNoise(x, y, seed + 9) < 0.5) c = mix(moss, 0.55 + tileNoise(x, y, seed) * 0.3);
        const edge = Math.min(wx - ROOM.x0, ROOM.x1 - wx, (wy - ROOM.y0) * 0.7, ROOM.y1 - wy);
        if (edge < 6) c = mix(c, 0.55 + 0.45 * (edge / 6));
      } else if (wy < 10) {
        c = [14, 9, 20];
      } else {
        const isFace = wy < ROOM.y0 && wx >= ROOM.x0 - 1 && wx < ROOM.x1 + 1;
        const by = Math.floor(wy / 5);
        const bxw = wx + by % 2 * 5;
        const bx = Math.floor(bxw / 10);
        const lx = Math.floor(bxw % 10 * S);
        const ly = Math.floor(wy % 5 * S);
        const n = tileNoise(bx, by, seed + 3);
        let k = (isFace ? 1 : 0.62) * (0.88 + n * 0.24);
        if (lx === 0 || ly === 0) k *= 0.5;
        else if (ly === 1) k *= 1.18;
        else if (ly === 5 * S - 1) k *= 0.8;
        k += (tileNoise(Math.floor(wx), Math.floor(wy), seed + 11) - 0.5) * 0.08;
        c = mix(isFace ? tone.wall : mix(tone.wall, 0.9), k);
        if (wy >= 10 && wy < 11) c = tone.wallTop;
      }
      dot(b, x, y, c);
    }
  }
  rect(b, ROOM.x0, ROOM.y0 - 1, ROOM.x1 - ROOM.x0, 1, P.k, 0.5);
  rect(b, ROOM.x0 - 1, ROOM.y0, 0.5, ROOM.y1 - ROOM.y0, tone.wallTop, 0.6);
  rect(b, ROOM.x1, ROOM.y0, 0.5, ROOM.y1 - ROOM.y0, P.k, 0.6);
  rect(b, ROOM.x0, ROOM.y1, ROOM.x1 - ROOM.x0, 0.5, tone.wallTop, 0.5);
  for (const p of live.pillars) {
    shadow(b, p.x + p.w / 2 + 3, p.y + p.h, p.w / 2 + 3, 3, 0.5);
    const x0 = Math.round(p.x * S);
    const x1 = Math.round((p.x + p.w) * S);
    const y0 = Math.round((p.y - 4 - FRAME_TOP) * S);
    const y1 = Math.round((p.y + p.h - FRAME_TOP) * S);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0 - 1);
      const isCap = y < y0 + 3 * S;
      const k = isCap ? 1.25 - u * 0.3 : 1.15 - Math.abs(u - 0.3) * 0.9 + (tileNoise(x >> 1, y >> 1, seed) - 0.5) * 0.08;
      let c = mix(isCap ? tone.wallTop : tone.pillar, k);
      if (!isCap && (y - y0) % (4 * S) === 0) c = mix(c, 0.75);
      if (x === x0 || x === x1 - 1 || y === y1 - 1) c = mix(c, 0.5);
      dot(b, x, y, c);
    }
  }
}
function drawStatic(b, live) {
  if (staticFor !== roomKeyOf(live) || staticRes !== S || staticPx.length !== RW * RH * 4) {
    if (staticPx.length !== RW * RH * 4) staticPx = new Uint8Array(RW * RH * 4);
    staticFor = roomKeyOf(live);
    staticRes = S;
    staticCleared = live.isCleared;
    paintStatic(live);
    if (!live.isCleared) drawDoors({ px: staticPx, ox: 0, oy: -FRAME_TOP }, live);
  }
  const dx = Math.round(b.ox * S);
  const dy = Math.round((b.oy + FRAME_TOP) * S);
  if (dx === 0 && dy === 0) {
    b.px.set(staticPx.subarray(0, RW * RH * 4));
    return;
  }
  for (let y = 0; y < RH; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= RH) continue;
    const sx0 = Math.max(0, -dx);
    const sx1 = Math.min(RW, RW - dx);
    b.px.set(staticPx.subarray((sy * RW + sx0) * 4, (sy * RW + sx1) * 4), (y * RW + sx0 + dx) * 4);
  }
}
function torches(live) {
  const north = live.doors.find((d) => d.side === "n");
  return [36, 124].map((x) => north && Math.abs(north.x - x) < 14 ? x + (x < 80 ? -16 : 16) : x);
}
function drawTorches(b, live) {
  for (const [i, x] of torches(live).entries()) {
    const y = ROOM.y0 - 3;
    rect(b, x - 0.5, y - 1, 1, 4, P.B);
    rect(b, x - 2, y - 2, 4, 1.5, P.g);
    rect(b, x - 2, y - 2, 4, 0.5, P.s);
    const f = Math.sin(live.t * 13 + i * 2) + Math.sin(live.t * 7.3 + i);
    const sway = f > 0.6 ? 1 : f < -0.6 ? -1 : 0;
    const H = (5 + (f > 0.2 ? 1 : 0)) * S;
    const bx = Math.round((x + b.ox) * S);
    const by = Math.round((y - 2 + b.oy) * S);
    for (let j = -H - 4; j < 4; j++) for (let k = -8; k <= 8; k++) {
      const d = k * k / 64 + (j + H / 2) ** 2 / (H / 2 + 6) ** 2;
      if (d < 1) dot(b, bx + k, by + j, P.a, 0.18 * (1 - d));
    }
    for (let j = 0; j < H; j++) {
      const u = j / H;
      const w = Math.max(1, Math.round((1 - u) * 3.2 + (u < 0.3 ? u * 4 : 0)));
      const off = Math.round(sway * u * u * 2);
      for (let k = -w; k <= w; k++) {
        const edge = Math.abs(k) / (w + 0.01);
        const c = u < 0.45 && edge < 0.4 ? P.w : u < 0.7 && edge < 0.7 ? P.y : edge < 0.9 && u < 0.85 ? P.a : P.r;
        dot(b, bx + k + off, by - j, c);
      }
    }
  }
}
var lightBuf = new Float32Array(0);
var ambBuf = new Float32Array(0);
var ambKey = "";
function addLight(buf, L2, ox, oy, LW, LH) {
  const lightBuf2 = buf;
  const cx = L2.x + ox;
  const cy = L2.y + oy;
  const R = L2.r;
  const x0 = Math.max(0, Math.floor(cx - R));
  const x1 = Math.min(LW - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R));
  const y1 = Math.min(LH - 1, Math.ceil(cy + R));
  const inv = 1 / (R * R);
  for (let y = y0; y <= y1; y++) {
    const dy2 = (y + 0.5 - cy) ** 2;
    for (let x = x0; x <= x1; x++) {
      const d = ((x + 0.5 - cx) ** 2 + dy2) * inv;
      if (d >= 1) continue;
      const f = (1 - d) * (1 - d) * L2.i;
      const k = (y * LW + x) * 3;
      lightBuf2[k] = lightBuf2[k] + f * L2.c[0];
      lightBuf2[k + 1] = lightBuf2[k + 1] + f * L2.c[1];
      lightBuf2[k + 2] = lightBuf2[k + 2] + f * L2.c[2];
    }
  }
}
function applyLight(b, live, lights) {
  const LW = Math.ceil(RW / S);
  const LH = Math.ceil(RH / S);
  const n = LW * LH * 3;
  const key = `${live.biome}:${LW}x${LH}:${roomId(live)}:${live.isCleared}`;
  if (ambKey !== key) {
    ambKey = key;
    if (ambBuf.length !== n) {
      ambBuf = new Float32Array(n);
      lightBuf = new Float32Array(n);
    }
    const amb = live.biome === 1 ? [0.42, 0.32, 0.3] : live.biome === 2 ? [0.28, 0.38, 0.4] : [0.32, 0.3, 0.42];
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const dx = x / LW - 0.5;
      const dy = y / LH - 0.55;
      const v = 1 - (dx * dx + dy * dy) * 1.6;
      const k = (y * LW + x) * 3;
      ambBuf[k] = amb[0] * v;
      ambBuf[k + 1] = amb[1] * v;
      ambBuf[k + 2] = amb[2] * v;
    }
    for (const L2 of fixedLights(live)) addLight(ambBuf, L2, 0, -FRAME_TOP, LW, LH);
  }
  lightBuf.set(ambBuf);
  for (const L2 of lights) addLight(lightBuf, L2, b.ox, b.oy, LW, LH);
  const px = new Uint8ClampedArray(b.px.buffer, b.px.byteOffset, RW * RH * 4);
  for (let ly = 0; ly < LH; ly++) for (let lx = 0; lx < LW; lx++) {
    const k = (ly * LW + lx) * 3;
    const fr = Math.min(1.7, lightBuf[k]) * 16 + 0.5 | 0;
    const fg = Math.min(1.7, lightBuf[k + 1]) * 16 + 0.5 | 0;
    const fb = Math.min(1.7, lightBuf[k + 2]) * 16 + 0.5 | 0;
    for (let j = 0; j < S; j++) {
      const y = ly * S + j;
      if (y >= RH) break;
      let i = (y * RW + lx * S) * 4;
      for (let q = 0; q < S; q++, i += 4) {
        px[i] = px[i] * fr >> 4;
        px[i + 1] = px[i + 1] * fg >> 4;
        px[i + 2] = px[i + 2] * fb >> 4;
      }
    }
  }
}
var KIND_GLOW = { treasure: [1, 0.9, 0.4], shop: [0.4, 0.9, 1], boss: [1, 0.35, 0.3], session: [1, 0.6, 0.25] };
function fixedLights(live) {
  const lights = [];
  for (const x of torches(live)) lights.push({ x, y: ROOM.y0 - 4, r: 58, c: [1.25, 0.66, 0.26], i: 0.88 });
  if (live.isCleared) for (const d of live.doors) lights.push({ x: d.x, y: d.y, r: 22, c: KIND_GLOW[d.kind] ?? [0.8, 0.7, 0.6], i: 0.7 });
  return lights;
}
var roomIds = /* @__PURE__ */ new WeakMap();
var nextRoomId = 1;
var roomId = (live) => live.roomKey ?? roomIds.get(live) ?? (roomIds.set(live, nextRoomId), nextRoomId++);
var roomKeyOf = (live) => live.roomKey ?? live;
function lightsOf(live) {
  const lights = [];
  const p = live.player;
  lights.push({ x: p.x, y: p.y - 5, r: 70, c: [1, 0.9, 0.78], i: 1 });
  for (const pr of live.projs) {
    if (pr.kind === "bolt") lights.push({ x: pr.x, y: pr.y, r: 14, c: [0.4, 0.9, 1.2], i: 0.9 });
    else if (pr.kind === "orb") lights.push({ x: pr.x, y: pr.y, r: 12, c: [1.2, 0.4, 0.3], i: 0.8 });
    else if (pr.kind === "spit") lights.push({ x: pr.x, y: pr.y, r: 9, c: [0.5, 1, 0.3], i: 0.6 });
  }
  for (const item of live.pickups) {
    const c = item.kind === "portal" ? [0.4, 0.6, 1.2] : item.kind === "shard" || item.kind === "bolt" ? [0.4, 1, 1.1] : item.kind === "heart" || item.kind === "shopHeart" ? [1.1, 0.4, 0.4] : [1.1, 0.95, 0.5];
    lights.push({ x: item.x, y: item.y - 3, r: item.kind === "stairs" || item.kind === "altar" ? 30 : 16, c, i: 0.7 });
  }
  for (const e of live.enemies) {
    if (e.type === "boss") lights.push({ x: e.x, y: e.y - e.r, r: 34, c: e.kind === "nemesis" ? [1, 0.4, 1] : [1, 0.45, 0.4], i: 0.55 });
    else if (e.kind === "error") lights.push({ x: e.x, y: e.y - 4, r: 14, c: [1.1, 0.6, 0.2], i: 0.6 });
  }
  for (const s of live.strikes ?? []) if (s.zone > 0) lights.push({ x: s.x, y: s.y, r: s.r + 8, c: [1.2, 0.6, 0.25], i: 0.6 });
  for (const fx of live.fx) {
    if (fx.kind === "ring" && fx.r) lights.push({ x: fx.x, y: fx.y, r: fx.r + 10, c: [fx.color[0] / 200, fx.color[1] / 200, fx.color[2] / 200], i: fx.ttl / fx.max });
  }
  return lights;
}
function fineDoor(b, live, side, x, y, w, h, kind, isOpen, stone) {
  const x0 = fx0(b, x - 1.5);
  const y0 = fy0(b, y - 1.5);
  const x1 = Math.round((x + w + 1.5 + b.ox) * S);
  const y1 = Math.round((y + h + 1.5 + b.oy) * S);
  const ix0 = fx0(b, x);
  const iy0 = fy0(b, y);
  const ix1 = Math.round((x + w + b.ox) * S);
  const iy1 = Math.round((y + h + b.oy) * S);
  const frame2 = mix(kind, 0.55);
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
    const inside = i >= ix0 && i < ix1 && j >= iy0 && j < iy1;
    if (!inside) {
      const k = i < x0 + 1 || j < y0 + 1 ? 1.35 : i >= x1 - 1 || j >= y1 - 1 ? 0.6 : 1;
      dot(b, i, j, mix(i < ix0 - 1 || j < iy0 - 1 || i > ix1 || j > iy1 ? mix(stone, 0.8) : frame2, k));
      continue;
    }
    const u = side === "n" ? 1 - (j - iy0) / (iy1 - iy0) : side === "s" ? (j - iy0) / (iy1 - iy0) : side === "w" ? 1 - (i - ix0) / (ix1 - ix0) : (i - ix0) / (ix1 - ix0);
    let c = mix([30, 20, 34], 1 - u * 0.7);
    if (isOpen) {
      const pulse = 0.55 + 0.2 * Math.sin(live.t * 4 + u * 3);
      c = mix(kind, (1 - u) * pulse + 0.15);
    } else {
      const across = side === "n" || side === "s" ? i - ix0 : j - iy0;
      const along = side === "n" || side === "s" ? j - iy0 : i - ix0;
      const span = side === "n" || side === "s" ? iy1 - iy0 : ix1 - ix0;
      const bar = across % 6;
      if (bar === 2 || bar === 3) c = bar === 2 ? P.s : P.S;
      if (Math.abs(along - Math.round(span * 0.35)) < 1.5) c = across % 6 === 2 ? P.w : P.g;
    }
    dot(b, i, j, c);
  }
}
function drawDoors(b, live) {
  const tone = BIOME_TONES[Math.min(live.biome, BIOME_TONES.length - 1)];
  for (const door of live.doors) {
    const isOpen = live.isCleared;
    const kindColor = door.kind === "treasure" ? P.y : door.kind === "shop" ? P.c : door.kind === "boss" ? P.r : door.kind === "session" ? P.a : tone.wallTop;
    const vertical = door.side === "n" || door.side === "s";
    const [x, y, w, h] = door.side === "n" ? [door.x - 6, 11, 12, ROOM.y0 - 11] : door.side === "s" ? [door.x - 6, ROOM.y1, 12, FH - ROOM.y1] : door.side === "w" ? [0, door.y - 2, ROOM.x0, 12] : [ROOM.x1, door.y - 2, FW - ROOM.x1, 12];
    if (S > 1) {
      fineDoor(b, live, door.side, x, y, w, h, kindColor, isOpen, tone.wallTop);
    } else {
      rect(b, x - 1, y - 1, w + 2, h + 2, kindColor);
      rect(b, x, y, w, h, P.k);
      if (!isOpen) {
        for (let i = 1; i < (vertical ? w : h); i += 3) {
          if (vertical) rect(b, x + i, y, 1, h, P.g);
          else rect(b, x, y + i, w, 1, P.g);
        }
      } else {
        const glow = 0.2 + 0.12 * Math.sin(live.t * 4);
        rect(b, x, y, w, h, kindColor, glow);
      }
    }
    const iconKey = door.kind === "treasure" ? "boon" : door.kind === "shop" ? "eclats" : door.kind === "boss" ? "boss" : door.kind === "session" ? "vigor" : void 0;
    const icon = iconKey ? ICONS[iconKey] : void 0;
    if (icon && iconKey) {
      const ix = door.side === "w" ? ROOM.x0 / 2 : door.side === "e" ? (ROOM.x1 + FW) / 2 : door.x;
      const iy = door.side === "n" ? ROOM.y0 - 2 : door.side === "s" ? FH - 1 : door.y + 8;
      sprite2(b, icon, FINE.icons[iconKey], ix, iy);
    }
  }
}
var COARSE = {
  rat: RAT,
  goblin: GOBLIN,
  slug: SLUG,
  skeleton: SKELETON,
  larva: LARVA,
  bug: BUG,
  linter: LINTER,
  forker: FORKER,
  turret: TURRET,
  miner: MINER,
  burrower: BURROWER,
  monolith: MONOLITH,
  micro: MICRO,
  sentinel: SENTINEL,
  reviewer: REVIEWER,
  leak: LEAK,
  sniper: SNIPER
};
function enemySprite(type) {
  return type === "boss" ? LARVA : COARSE[type];
}
function enemyFine(type) {
  return FINE[type] ?? FINE.larva;
}
var ELITE_MUL = [1.35, 0.82, 0.42];
var NEMESIS_MUL = [1.1, 0.62, 1.35];
var norm2 = (x, y) => {
  const d = Math.hypot(x, y);
  return d < 1e-6 ? [0, 0] : [x / d, y / d];
};
function windupOf(e) {
  if (e.state !== "windup") return 0;
  return Math.max(0, Math.min(1, 1 - e.t / Math.max(0.01, e.tMax ?? ENEMY[e.type].windup)));
}
function oval(b, cx, cy, rx, ry, c, a = 1) {
  const X = (cx + b.ox) * S;
  const Y = (cy + b.oy) * S;
  const RX = rx * S;
  const RY = ry * S;
  for (let j = Math.floor(-RY); j <= Math.ceil(RY); j++) for (let i = Math.floor(-RX); i <= Math.ceil(RX); i++) {
    if ((i / RX) ** 2 + (j / RY) ** 2 <= 1) dot(b, Math.round(X + i), Math.round(Y + j), c, a);
  }
}
function drawEnemy(b, live, e) {
  if (e.type === "burrower" && e.hidden) {
    drawMound(b, live, e);
    return;
  }
  if (e.state === "spawn") {
    const k = 1 - Math.max(0, e.t) / 0.7;
    disc(b, e.x, e.y, Math.max(1, Math.round(6 * k)), P.k, 0.7);
    circle(b, e.x, e.y, 7 - k * 3, e.kind === "error" ? P.a : P.p, 0.9);
    return;
  }
  shadow(b, e.x, e.y, e.r + 1, 1.6, 0.45);
  if (e.type === "boss") {
    drawBoss(b, live, e);
    return;
  }
  const prog = windupOf(e);
  const [ax, ay] = norm2(e.aimX - e.x, e.aimY - e.y);
  let ox = 0;
  let oy = 0;
  let sx = 1;
  let sy = 1;
  if (e.state === "windup") {
    ox = -ax * prog * 1.2 + (Math.floor(live.t * 30) % 2 ? 0.5 : -0.5) * prog;
    oy = -ay * prog * 0.6;
    sx = 1 + 0.14 * prog;
    sy = 1 - 0.12 * prog;
    if (e.type === "leak") {
      sx += 0.3 * prog;
      sy += 0.35 * prog;
    }
  } else if (e.state === "act") {
    sx = 0.86;
    sy = 1.14;
  }
  const q = e.squash ?? 0;
  sx *= 1 + 0.3 * q;
  sy *= 1 - 0.24 * q;
  const blink = e.state === "windup" && prog > 0.35 && Math.floor(live.t * 14) % 2 === 0;
  const tint = e.flash > 0 ? P.w : blink ? e.type === "leak" ? P.q : P.y : void 0;
  const bob = S > 1 && e.state === "chase" ? Math.round(Math.abs(Math.sin(live.t * 10 + e.id)) * S) / S : 0;
  const isBehind = e.type === "sentinel" && Math.sin(e.faceA ?? 0) < -0.2;
  if (isBehind) drawShield(b, e);
  sprite2(b, enemySprite(e.type), enemyFine(e.type), e.x + ox, e.y + 0.5 - bob + oy, { flip: live.player.x < e.x, tint, sx, sy, mul: e.kind === "error" ? ELITE_MUL : void 0 });
  if (e.type === "sentinel" && !isBehind) drawShield(b, e);
  if ((e.buff ?? 0) > 0) {
    for (let i = 0; i < 3; i++) {
      const u = (live.t * 1.5 + i / 3) % 1;
      fput(b, e.x - 3 + i * 3, e.y - 2 - u * 8, P.G, 1 - u);
    }
  }
  const h = enemySprite(e.type).h;
  if (e.hp < e.maxHp || e.kind === "error") {
    const w = e.kind === "error" ? 14 : Math.max(8, e.r * 2);
    const y = e.y - h - 3;
    const th = S > 1 ? 1.5 : 1;
    rect(b, e.x - w / 2 - 0.5, y - 0.5, w + 1, th + 0.5, P.k);
    rect(b, e.x - w / 2, y, Math.max(0, w * e.hp / e.maxHp), th - 0.5 || 1, e.kind === "error" ? P.a : P.r);
  }
  if (e.kind === "error" && hasWorldText) {
    const old = scale;
    scale = worldScale();
    const tag = e.affix ? `${e.sig ?? ""} ${AFFIX_LABEL[e.affix]}` : e.sig ?? "";
    text(b, tag, e.x - textWidth(tag) / 2, e.y - h - 4 - 5 * scale, P.a);
    scale = old;
  }
}
function drawShield(b, e) {
  const a = e.faceA ?? 0;
  const cx = e.x + Math.cos(a) * 5;
  const cy = e.y - 4 + Math.sin(a) * 3.5;
  const px = -Math.sin(a);
  const py = Math.cos(a);
  const len = 4.5;
  for (let d = -1; d <= 1; d += 0.5) {
    const c = d < -0.4 ? P.S : d > 0.4 ? P.W : P.s;
    line(b, cx - px * len + Math.cos(a) * d * 0.6, cy - py * len - 1 + Math.sin(a) * d * 0.6, cx + px * len + Math.cos(a) * d * 0.6, cy + py * len - 1 + Math.sin(a) * d * 0.6, c);
  }
  put(b, cx, cy - 1, P.r);
  line(b, cx - px * len, cy - py * len - 1, cx + px * len, cy + py * len - 1, P.y, 0.5);
}
function drawMound(b, live, e) {
  const isMarked = e.pattern === 1;
  const k = isMarked ? 1 - Math.max(0, e.t) / Math.max(0.01, e.tMax ?? 0.75) : 0;
  const jig = isMarked ? (Math.floor(live.t * 24) % 2 ? 0.5 : -0.5) * (0.5 + k) : 0;
  const rx = isMarked ? 3.5 + k * 1.5 : 3;
  oval(b, e.x + jig, e.y, rx + 0.5, 1.8, P.B);
  oval(b, e.x + jig, e.y - 0.5, rx, 1.3, P.b);
  for (let i = 0; i < 3; i++) put(b, e.x - 2 + i * 2 + jig, e.y - 1 - (Math.floor(live.t * 8) + i) % 2, P.T);
}
function drawBoss(b, live, e) {
  const look = GUARDIAN_FINE[e.boss ?? 0] ?? GUARDIAN_FINE[0];
  const pose = look[(e.phase ?? 1) >= 2 ? 1 : 0];
  const prog = windupOf(e);
  let ox = 0;
  let sx = 1;
  let sy = 1 + Math.sin(live.t * 3) * 0.025;
  if (e.state === "windup") {
    ox = (Math.floor(live.t * 30) % 2 ? 0.5 : -0.5) * (0.4 + prog);
    sx = 1 + 0.06 * prog;
    sy *= 1 - 0.05 * prog;
  } else if (e.state === "stun") {
    ox = Math.floor(live.t * 40) % 2 ? 1 : -1;
    sx = 1.06;
    sy *= 1.06;
  } else if (e.state === "act" && e.move === "charge") {
    sx = 1.08;
    sy *= 0.94;
  }
  const q = e.squash ?? 0;
  sx *= 1 + 0.1 * q;
  sy *= 1 - 0.08 * q;
  const isInv = (e.inv ?? 0) > 0 && Math.floor(live.t * 12) % 2 === 0;
  const tint = e.flash > 0 || isInv ? P.w : void 0;
  let mul = e.kind === "nemesis" ? NEMESIS_MUL : void 0;
  if (e.state === "windup" && prog > 0.4 && Math.floor(live.t * 12) % 2 === 0) mul = mul ? [mul[0] * 1.3, mul[1] * 1.3, mul[2] * 1.3] : [1.35, 1.3, 1.2];
  const half = S > 1 ? 1 : 0.5;
  blitFine(b, pose, e.x + ox, e.y + 1.5, { sx: sx * half, sy: sy * half, tint, mul });
}
function drawPlayer(b, live) {
  const p = live.player;
  if (p.iframes > 0 && p.dashT <= 0 && p.flash <= 0 && Math.floor(live.t * 20) % 2 === 0 && p.iframes < 0.55) return;
  const frame2 = p.isMoving ? HERO[Math.floor(p.walk) % 2] : HERO[0];
  shadow(b, p.x, p.y + 0.5, 4.5, 1.6, 0.5);
  const fine = HERO_FINE[p.isMoving ? Math.floor(p.walk) % 2 : 0];
  sprite2(b, frame2, fine, p.x, p.y + 1, { flip: p.faceX < -0.1, tint: p.flash > 0 ? P.r : void 0 });
  const hx = p.x + p.faceX * 4;
  const hy = p.y - 5 + p.faceY * 3;
  const swing = p.atkT > 0;
  switch (live.weapon) {
    case "epee": {
      const L2 = swing ? 8 : 5.5;
      line(b, hx + 0.5, hy + 0.5, hx + p.faceX * L2 + 0.5, hy + p.faceY * L2 + 0.5, P.S);
      line(b, hx, hy, hx + p.faceX * L2, hy + p.faceY * L2, P.w);
      line(b, hx - p.faceY * 1.5, hy + p.faceX * 1.5, hx + p.faceY * 1.5, hy - p.faceX * 1.5, P.y);
      break;
    }
    case "lance":
      line(b, hx - p.faceX * 4, hy - p.faceY * 4, hx + p.faceX * (swing ? 14 : 8), hy + p.faceY * (swing ? 14 : 8), P.s);
      put(b, hx + p.faceX * (swing ? 14 : 8), hy + p.faceY * (swing ? 14 : 8), P.w);
      break;
    case "arc":
      for (let i = -3; i <= 3; i++) put(b, hx + p.faceX * 2 + -p.faceY * i - p.faceX * Math.abs(i) * 0.5, hy + p.faceY * 2 + p.faceX * i - p.faceY * Math.abs(i) * 0.5, P.b);
      break;
    case "bouclier":
      if (!live.projs.some((one) => one.kind === "shield")) disc(b, hx + p.faceX * 2, hy + p.faceY * 2, 3, swing ? P.w : P.s);
      break;
  }
}
function renderFrame(live, view, frame2) {
  S = live ? view.res ?? 1 : 1;
  const top = S > 1 ? FRAME_TOP : 0;
  RW = FW * S;
  RH = (FH - top) * S;
  frame2.fill(255);
  scale = view.scale;
  VW = Math.min(FW, view.vw ?? FW);
  hasWorldText = view.hasWorldText ?? true;
  const hud = view.hasPixelHud ?? true;
  VH = Math.min(FH, view.vh ?? FH);
  const b = { px: frame2, ox: 0, oy: -top };
  if (S > 1 && frame2.byteOffset % 4 === 0) {
    new Uint32Array(frame2.buffer, frame2.byteOffset, RW * RH).fill(4280028180);
  } else rect(b, 0, 0, FW, FH, P.k);
  if (!live) {
    drawSplash(b, view);
    return frame2;
  }
  const camX = Math.max(0, Math.min(FW - VW, Math.round(live.player.x - VW / 2)));
  const camY = Math.max(0, Math.min(FH - VH, Math.round(live.player.y - (hud ? VH + 10 : VH) / 2)));
  b.ox = -camX;
  b.oy = -camY - top;
  if (live.shake > 0) {
    b.ox += Math.round(Math.sin(live.t * 90) * 2 * S * Math.min(1, live.shake * 4)) / S;
    b.oy += Math.round(Math.cos(live.t * 70) * 2 * S * Math.min(1, live.shake * 4)) / S;
  }
  if (S > 1) {
    drawStatic(b, live);
    if (live.isCleared) drawDoors(b, live);
    drawTorches(b, live);
  } else drawRoom(b, live);
  for (const fx of live.fx) {
    const k = fx.ttl / fx.max;
    if (fx.kind === "tele") {
      if (fx.r) {
        disc(b, fx.x, fx.y - 2, fx.r, fx.color, 0.18 + 0.2 * (1 - k));
        circle(b, fx.x, fx.y - 2, fx.r, fx.color, 0.8);
      } else if (fx.x2 !== void 0 && fx.y2 !== void 0) {
        line(b, fx.x, fx.y - 3, fx.x + (fx.x2 - fx.x) * 1.4, fx.y - 3 + (fx.y2 - fx.y) * 1.4, fx.color, 0.4 + 0.5 * (1 - k));
      }
    } else if (fx.kind === "spike") {
      put(b, fx.x, fx.y, fx.color, k);
      put(b, fx.x, fx.y - 1, P.w, k * 0.7);
    } else if (fx.kind === "ghost") {
      sprite2(b, HERO[0], HERO_FINE[0], fx.x, fx.y + 1, { tint: fx.color, alpha: k * 0.5, flip: live.player.faceX < 0 });
    } else if (fx.kind === "stain" && fx.r) {
      oval(b, fx.x, fx.y, fx.r, fx.r * 0.45, fx.color, 0.35 * Math.min(1, fx.ttl / 2));
    }
  }
  for (const item of live.pickups) {
    const bob = Math.round(Math.sin(live.t * 4 + item.x) * 1);
    if (item.kind !== "stairs" && item.kind !== "portal") shadow(b, item.x, item.y + 1, 3.5, 1.2, 0.35);
    if (item.kind === "heart") sprite2(b, ICONS.heart, FINE.icons.heart, item.x, item.y + bob);
    else if (item.kind === "shard") sprite2(b, ICONS.eclats, FINE.icons.eclats, item.x, item.y + bob);
    else if (item.kind === "altar") {
      rect(b, item.x - 6, item.y - 3, 12, 6, P.s);
      rect(b, item.x - 6, item.y - 3, 12, 1, P.w);
      rect(b, item.x - 5, item.y + 3, 10, 2, P.g);
      sprite2(b, ICONS.item, FINE.icons.item, item.x, item.y - 6 + bob);
      circle(b, item.x, item.y - 8 + bob, 4 + Math.sin(live.t * 4) * 0.5, P.u, 0.35);
    } else if (item.kind === "shopHeart" || item.kind === "shopBoon") {
      if (S > 1) {
        rect(b, item.x - 6, item.y + 3, 1, 3, P.B);
        rect(b, item.x + 5, item.y + 3, 1, 3, P.B);
        rect(b, item.x - 7, item.y + 0.5, 14, 3, P.b);
        rect(b, item.x - 7, item.y + 0.5, 14, 0.5, P.a);
        rect(b, item.x - 7, item.y + 3, 14, 0.5, P.B);
        for (let k = -7 + 3.5; k < 7; k += 3.5) rect(b, item.x + k, item.y + 1, 0.5, 2, P.B, 0.6);
      } else rect(b, item.x - 7, item.y + 1, 14, 3, P.b);
      if (item.kind === "shopHeart") sprite2(b, ICONS.heart, FINE.icons.heart, item.x, item.y + bob);
      else if (item.tag === "shopItem") sprite2(b, ICONS.item, FINE.icons.item, item.x, item.y + bob);
      else sprite2(b, ICONS.boon, FINE.icons.boon, item.x, item.y + bob);
      if (S > 1 && hasWorldText) {
        const old = scale;
        scale = worldScale();
        const label = `${item.price ?? 0}`;
        text(b, label, item.x - textWidth(label) / 2 + 1, item.y + 4.5, live.wallet >= (item.price ?? 0) ? P.c : P.r);
        sprite2(b, ICONS.shard, FINE.icons.shard, item.x - textWidth(label) / 2 - 1.5, item.y + 7.5);
        scale = old;
      } else for (let i = 0; i < Math.min(5, Math.ceil((item.price ?? 0) / 8)); i++) put(b, item.x - 4 + i * 2, item.y + 5, P.c);
    } else if (item.kind === "stairs") {
      rect(b, item.x - 8, item.y - 6, 16, 12, P.k);
      for (let i = 0; i < 4; i++) rect(b, item.x - 7 + i, item.y - 5 + i * 3, 14 - i * 2, 1, P.g);
      circle(b, item.x, item.y, 9 + Math.floor(live.t * 3) % 2, P.y, 0.5);
    } else if (item.kind === "chest") sprite2(b, CHEST, FINE.chest, item.x, item.y + 2);
    else if (item.kind === "portal") {
      circle(b, item.x, item.y - 4, 5 + Math.sin(live.t * 6), P.u);
      circle(b, item.x, item.y - 4, 3, P.c, 0.7);
    } else {
      put(b, item.x, item.y - 1, P.c);
      put(b, item.x, item.y - 2, P.w);
      circle(b, item.x, item.y - 1, 2 + Math.floor(live.t * 6) % 2, P.c, 0.4);
    }
  }
  const bodies = [];
  for (const e of live.enemies) bodies.push({ y: e.y, draw: () => drawEnemy(b, live, e) });
  for (const ally of live.allies) bodies.push({ y: ally.y, draw: () => sprite2(b, FAMILIAR, FINE.familiar, ally.x, ally.y + Math.round(Math.sin(live.t * 8) * S) / S) });
  bodies.push({ y: live.player.y, draw: () => drawPlayer(b, live) });
  bodies.sort((a, z) => a.y - z.y);
  for (const body of bodies) body.draw();
  if (S > 1) applyLight(b, live, lightsOf(live));
  for (const s of live.strikes ?? []) drawStrike(b, live, s);
  for (const e of live.enemies) if (e.state === "windup") drawWindup(b, live, e);
  for (const pr of live.projs) {
    const [nx, ny] = [pr.vx / (Math.hypot(pr.vx, pr.vy) || 1), pr.vy / (Math.hypot(pr.vx, pr.vy) || 1)];
    switch (pr.kind) {
      case "arrow":
        line(b, pr.x - nx * 4, pr.y - ny * 4, pr.x, pr.y, P.y);
        break;
      case "spear":
        line(b, pr.x - nx * 8, pr.y - ny * 8, pr.x, pr.y, P.s);
        put(b, pr.x, pr.y, P.w);
        break;
      case "bolt":
        disc(b, pr.x, pr.y, 1.5, P.c);
        fput(b, pr.x, pr.y, P.w);
        circle(b, pr.x, pr.y, 3, P.u, 0.5);
        line(b, pr.x - nx * 5, pr.y - ny * 5, pr.x, pr.y, P.c, 0.5);
        break;
      case "shield":
        disc(b, pr.x, pr.y, 3, P.s);
        put(b, pr.x, pr.y, P.w);
        break;
      // Foes' shots: a dark rim, a hot core, so they stand out from the floor and from each other.
      case "spit":
        disc(b, pr.x, pr.y, 2.5, P.k, 0.6);
        ball(b, pr.x, pr.y, 2, P.G);
        fput(b, pr.x - 0.5, pr.y - 0.5, P.y);
        break;
      case "orb": {
        const [rim, core] = pr.tone === 1 ? [P.u, P.c] : [P.r, P.y];
        disc(b, pr.x, pr.y, 2.5, P.k, 0.6);
        ball(b, pr.x, pr.y, 2, rim);
        fput(b, pr.x, pr.y, core);
        fput(b, pr.x - 0.5, pr.y - 0.5, P.w);
        break;
      }
      case "shot":
        line(b, pr.x - nx * 6, pr.y - ny * 6, pr.x, pr.y, P.r, 0.7);
        line(b, pr.x - nx * 3, pr.y - ny * 3, pr.x, pr.y, P.w);
        disc(b, pr.x, pr.y, 1, P.q);
        break;
    }
  }
  for (const fx of live.fx) {
    const k = fx.ttl / fx.max;
    if (fx.kind === "slash" && fx.a !== void 0 && fx.r) {
      for (let t = -1.1; t <= 1.1; t += 0.08 / S) {
        const a = fx.a + t;
        const edge = 1 - Math.abs(t) / 1.1;
        for (let rr = fx.r - 3; rr <= fx.r; rr += 1 / S) fput(b, fx.x + Math.cos(a) * rr, fx.y + Math.sin(a) * rr, rr > fx.r - 0.6 ? P.w : fx.color, k * (0.35 + 0.65 * edge) * (0.4 + 0.6 * (rr - fx.r + 3) / 3));
      }
    } else if (fx.kind === "ring" && fx.r) {
      circle(b, fx.x, fx.y, fx.r * (1.1 - k * 0.3), fx.color, k);
      circle(b, fx.x, fx.y, fx.r * (1 - k * 0.3), fx.color, k * 0.6);
    } else if (fx.kind === "line" && fx.x2 !== void 0 && fx.y2 !== void 0) {
      line(b, fx.x, fx.y, fx.x2, fx.y2, fx.color, k);
    } else if (fx.kind === "spark") {
      if (S > 1) {
        fput(b, fx.x, fx.y, P.w, k);
        fput(b, fx.x + 0.5, fx.y, fx.color, k);
        fput(b, fx.x, fx.y + 0.5, fx.color, k * 0.7);
      } else put(b, fx.x, fx.y, fx.color, k);
    } else if (fx.kind === "gib") {
      const size = fx.r ?? 0.5;
      rect(b, fx.x, fx.y - (fx.z ?? 0), size, size, fx.color, Math.min(1, k * 2));
    } else if (fx.kind === "beam" && fx.x2 !== void 0 && fx.y2 !== void 0) {
      const w = fx.w ?? 2;
      fillBand(b, fx.x, fx.y, fx.x2, fx.y2, w * (0.6 + 0.4 * k), fx.color, 0.75 * k);
      fillBand(b, fx.x, fx.y, fx.x2, fx.y2, w * 0.35 * k, P.w, 0.9 * k);
    } else if (fx.kind === "num" && fx.text && hasWorldText) {
      const old = scale;
      scale = worldScale() * (fx.big ? 2 : 1);
      text(b, fx.text, fx.x - textWidth(fx.text) / 2, fx.y, k > 0.85 && fx.big ? P.w : fx.color);
      scale = old;
    }
  }
  for (const fx of live.fx) if (fx.kind === "flash") rect(b, -b.ox, -b.oy, FW, FH, fx.color, 0.45 * (fx.ttl / fx.max));
  b.ox = 0;
  b.oy = -top;
  if (live.player.flash > 0) {
    const a = Math.min(1, live.player.flash / 0.28) * 0.45;
    for (let i = 0; i < 6; i++) {
      const k = a * (1 - i / 6);
      rect(b, i, 0, 1, VH, P.r, k);
      rect(b, VW - 1 - i, 0, 1, VH, P.r, k);
      rect(b, 0, top + i, VW, 1, P.r, k);
      rect(b, 0, VH - 1 - i, VW, 1, P.r, k);
    }
  }
  if (VW < FW || VH < FH) {
    for (const e of live.enemies) {
      const x = e.x - camX;
      const y = e.y - 4 - camY;
      if (x >= 0 && x < VW && y >= (hud ? 10 : 0) && y < VH) continue;
      const mx = Math.max(1, Math.min(VW - 3, Math.round(x)));
      const my = Math.max(hud ? 11 : 1, Math.min(VH - 3, Math.round(y)));
      rect(b, mx, my, 2, 2, e.type === "boss" ? P.y : e.kind === "error" ? P.a : P.r);
    }
  }
  if (hud) drawHud(b, live, view);
  else if (live.isDead || view.isOffer || view.isPaused) rect(b, 0, 0, VW, VH, P.k, 0.55);
  return frame2;
}
function fillBand(b, x0, y0, x1, y1, w, c, a) {
  if (w <= 0 || a <= 0) return;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L2 = dx * dx + dy * dy || 1;
  const X0 = Math.max(0, Math.floor((Math.min(x0, x1) - w + b.ox) * S));
  const X1 = Math.min(RW - 1, Math.ceil((Math.max(x0, x1) + w + b.ox) * S));
  const Y0 = Math.max(0, Math.floor((Math.min(y0, y1) - w + b.oy) * S));
  const Y1 = Math.min(RH - 1, Math.ceil((Math.max(y0, y1) + w + b.oy) * S));
  for (let py = Y0; py <= Y1; py++) {
    const wy = (py + 0.5) / S - b.oy;
    for (let px = X0; px <= X1; px++) {
      const wx = (px + 0.5) / S - b.ox;
      const u = Math.max(0, Math.min(1, ((wx - x0) * dx + (wy - y0) * dy) / L2));
      if (Math.hypot(wx - x0 - dx * u, wy - y0 - dy * u) <= w) dot(b, px, py, c, a);
    }
  }
}
function strikeDepth(s, wx, wy) {
  if (s.shape === "band") {
    const dx = s.x2 - s.x;
    const dy = s.y2 - s.y;
    const L2 = dx * dx + dy * dy || 1;
    const u = ((wx - s.x) * dx + (wy - s.y) * dy) / L2;
    if (u < 0 || u > 1) return Infinity;
    return Math.hypot(wx - s.x - dx * u, wy - s.y - dy * u);
  }
  const d = Math.hypot(wx - s.x, wy - s.y);
  if (s.shape === "cone" && d > 2) {
    const a = Math.atan2(wy - s.y, wx - s.x) - s.a;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > s.half) return Infinity;
  }
  return d;
}
function drawStrike(b, live, s) {
  if (s.mine > 0) {
    disc(b, s.x, s.y, 1.5, P.g);
    if (Math.floor(live.t * (s.mine < 6.4 ? 6 : 2)) % 2 === 0) fput(b, s.x, s.y - 0.5, P.r);
    if (s.mine < 6.4) circle(b, s.x, s.y, s.r - 2, P.r, 0.18);
    return;
  }
  if (s.zone > 0) {
    disc(b, s.x, s.y, s.r, P.a, 0.14);
    const n = Math.round(s.r * s.r * 0.5);
    const f = Math.floor(live.t * 14);
    for (let i = 0; i < n; i++) {
      const a = tileNoise(i, f, 3) * Math.PI * 2;
      const r = Math.sqrt(tileNoise(i, f, 7)) * s.r;
      const h = tileNoise(i, f, 11);
      fput(b, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r * 0.8 - h, h < 0.3 ? P.y : h < 0.7 ? P.a : P.r, Math.min(1, s.zone));
    }
    return;
  }
  const prog = Math.max(0, Math.min(1, 1 - s.t / Math.max(0.01, s.max)));
  const blink = prog > 0.78 && Math.floor(live.t * 16) % 2 === 0;
  const rim = blink ? P.w : s.color;
  if (s.isLaser) {
    line(b, s.x, s.y, s.x2, s.y2, rim, 0.35 + 0.6 * prog);
    if (prog > 0.55) {
      const [nx, ny] = norm2(s.x2 - s.x, s.y2 - s.y);
      const w = s.r * (prog - 0.55) / 0.45;
      line(b, s.x - ny * w, s.y + nx * w, s.x2 - ny * w, s.y2 + nx * w, rim, 0.6);
      line(b, s.x + ny * w, s.y - nx * w, s.x2 + ny * w, s.y2 - nx * w, rim, 0.6);
    }
    return;
  }
  const isPath = s.dmg <= 0 && s.after !== "summon";
  const R = s.r;
  const inner = R * prog;
  const ext = s.shape === "band" ? [Math.min(s.x, s.x2) - R, Math.min(s.y, s.y2) - R, Math.max(s.x, s.x2) + R, Math.max(s.y, s.y2) + R] : [s.x - R, s.y - R, s.x + R, s.y + R];
  const X0 = Math.max(0, Math.floor((ext[0] + b.ox) * S));
  const X1 = Math.min(RW - 1, Math.ceil((ext[2] + b.ox) * S));
  const Y0 = Math.max(0, Math.floor((ext[1] + b.oy) * S));
  const Y1 = Math.min(RH - 1, Math.ceil((ext[3] + b.oy) * S));
  const lo = isPath ? 0.1 : 0.13;
  const hi = isPath ? 0.1 : 0.3;
  for (let py = Y0; py <= Y1; py++) {
    const wy = (py + 0.5) / S - b.oy;
    for (let px = X0; px <= X1; px++) {
      const d = strikeDepth(s, (px + 0.5) / S - b.ox, wy);
      if (d > R) continue;
      dot(b, px, py, s.color, d <= inner ? hi : lo);
    }
  }
  if (s.shape === "circle") {
    circle(b, s.x, s.y, R, rim, 0.9);
    if (s.after === "summon") for (let i = 0; i < 3; i++) {
      const a = live.t * 5 + i * Math.PI * 2 / 3;
      fput(b, s.x + Math.cos(a) * R * 0.6, s.y + Math.sin(a) * R * 0.6, P.w);
    }
  } else if (s.shape === "cone") {
    for (const side of [-1, 1]) line(b, s.x, s.y, s.x + Math.cos(s.a + side * s.half) * R, s.y + Math.sin(s.a + side * s.half) * R, rim, 0.85);
    for (let t = -s.half; t <= s.half; t += 0.6 / (R * S)) fput(b, s.x + Math.cos(s.a + t) * R, s.y + Math.sin(s.a + t) * R, rim, 0.85);
  } else {
    const [nx, ny] = norm2(s.x2 - s.x, s.y2 - s.y);
    line(b, s.x - ny * R, s.y + nx * R, s.x2 - ny * R, s.y2 + nx * R, rim, isPath ? 0.55 : 0.85);
    line(b, s.x + ny * R, s.y - nx * R, s.x2 + ny * R, s.y2 - nx * R, rim, isPath ? 0.55 : 0.85);
    if (isPath) {
      const L2 = Math.hypot(s.x2 - s.x, s.y2 - s.y);
      for (let d = live.t * 40 % 8 + 4; d < L2 * Math.min(1, prog * 1.6); d += 8) {
        const cx = s.x + nx * d;
        const cy = s.y + ny * d;
        line(b, cx - nx * 2 - ny * 2.5, cy - ny * 2 + nx * 2.5, cx, cy, rim, 0.8);
        line(b, cx - nx * 2 + ny * 2.5, cy - ny * 2 - nx * 2.5, cx, cy, rim, 0.8);
      }
    }
  }
}
function drawWindup(b, live, e) {
  const prog = windupOf(e);
  const [ax, ay] = norm2(e.aimX - e.x, e.aimY - e.y);
  const a = 0.3 + 0.6 * prog;
  const red = P.r;
  const ray = (dx, dy, len, c, alpha, y = e.y - 3) => line(b, e.x + dx * 3, y + dy * 3, e.x + dx * len, y + dy * len, c, alpha);
  switch (e.type) {
    case "rat":
    case "larva":
    case "bug":
    case "micro": {
      const len = e.type === "rat" ? 18 : 13;
      ray(ax, ay, len, red, a, e.y - 1);
      fput(b, e.x + ax * len, e.y - 1 + ay * len, P.w, a);
      break;
    }
    case "skeleton": {
      const L2 = rayToWall(live, e.x, e.y, ax, ay, 90);
      for (const side of [-1, 1]) line(b, e.x - ay * 3.5 * side, e.y + ax * 3.5 * side, e.x + ax * L2 - ay * 3.5 * side, e.y + ay * L2 + ax * 3.5 * side, red, 0.25 + 0.5 * prog);
      line(b, e.x, e.y, e.x + ax * L2 * prog, e.y + ay * L2 * prog, prog > 0.8 && Math.floor(live.t * 16) % 2 ? P.w : red, 0.8);
      break;
    }
    case "slug":
      for (let d = 4; d < 24; d += 3) fput(b, e.x + ax * d, e.y - 3 + ay * d, red, a);
      break;
    case "linter":
      for (let i = -2; i <= 2; i++) {
        const c = Math.cos(i * 0.26);
        const sn = Math.sin(i * 0.26);
        ray(ax * c - ay * sn, ax * sn + ay * c, 18, P.u, a);
      }
      break;
    case "sniper": {
      const isLocked = e.t <= 0.3;
      const L2 = rayToWall(live, e.x, e.y - 3, ax, ay, 220);
      const c = isLocked && Math.floor(live.t * 20) % 2 ? P.w : red;
      line(b, e.x, e.y - 3, e.x + ax * L2, e.y - 3 + ay * L2, c, isLocked ? 0.95 : 0.35 + 0.3 * prog);
      if (isLocked) circle(b, e.x + ax * Math.min(L2, Math.hypot(e.aimX - e.x, e.aimY - e.y)), e.y - 3 + ay * Math.min(L2, Math.hypot(e.aimX - e.x, e.aimY - e.y)), 2.5, c, 0.9);
      break;
    }
    case "turret": {
      const off = e.pattern % 2 === 0 ? 0 : Math.PI / 4;
      for (let i = 0; i < 4; i++) ray(Math.cos(off + i * Math.PI / 2), Math.sin(off + i * Math.PI / 2), 12, red, a);
      break;
    }
    case "boss": {
      const isP2 = (e.phase ?? 1) >= 2;
      if (e.move === "fan") {
        const n = isP2 ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const t = (i - (n - 1) / 2) * 0.2;
          const c = Math.cos(t);
          const sn = Math.sin(t);
          ray(ax * c - ay * sn, ax * sn + ay * c, 34, P.u, a, e.y - e.r);
        }
      } else if (e.move === "burst" || e.move === "spiral") {
        circle(b, e.x, e.y - e.r, e.r + 3 + 14 * (1 - prog), e.move === "burst" ? P.y : [170, 90, 200], a);
      }
      break;
    }
    default:
      break;
  }
}
function drawHud(b, live, view) {
  const p = live.player;
  const s = live.stats;
  const isNarrow = VW < 120;
  rect(b, 0, 0, VW, 10, P.k);
  blit(b, ICONS.heart, 5, 7);
  const w = isNarrow ? 24 : 40;
  rect(b, 9, 3, w + 2, 5, P.p);
  rect(b, 10, 4, Math.max(0, Math.round(w * p.hp / s.maxHp)), 3, p.hp / s.maxHp > 0.3 ? P.r : P.y);
  const ty = 2;
  let x = 13 + w;
  text(b, `${Math.max(0, Math.ceil(p.hp))}`, x, ty, P.w);
  x += 14;
  for (let i = 0; i < s.castAmmo; i++) {
    rect(b, x, 3, 2, 4, i < live.ammo ? P.c : P.g);
    x += 4;
  }
  rect(b, x + 1, 4, 5, 2, p.dashCd <= 0 ? P.u : P.g);
  const shards = `${view.eclats}`;
  const sx = VW - textWidth(shards) - (isNarrow ? 3 : textWidth(view.roomLabel) + 8);
  blit(b, ICONS.shard, sx - 4, 7);
  text(b, shards, sx, ty, P.c);
  if (!isNarrow) text(b, view.roomLabel, VW - textWidth(view.roomLabel) - 2, ty, P.s);
  if (p.defiance > 0) for (let i = 0; i < p.defiance; i++) put(b, 4 + i * 2, 9, P.w);
  const boss = live.enemies.find((e) => e.type === "boss");
  if (boss && boss.state !== "spawn") {
    const bw = VW - 16;
    rect(b, 8, VH - 4, bw, 3, P.k);
    rect(b, 8, VH - 4, Math.round(bw * boss.hp / boss.maxHp), 3, boss.kind === "nemesis" ? [200, 60, 160] : P.r);
    const name = boss.name.split(",")[0] ?? boss.name;
    text(b, name, (VW - textWidth(name)) / 2, VH - 11, P.w);
  }
  const mid = Math.round((VH + 10) / 2);
  const isOverlay = live.isDead || view.isOffer || view.isPaused;
  if (live.banner && !isOverlay) banner(b, live.banner.text, mid, P.y, 0.6 * Math.min(1, live.banner.ttl * 3));
  if (live.isDead) {
    rect(b, 0, 0, VW, VH, P.k, 0.6);
    centered(b, tr("TU ES TOMBE", "YOU FELL"), mid - 3, P.r);
  } else if (view.isOffer) {
    rect(b, 0, 10, VW, VH - 10, P.k, 0.55);
    centered(b, tr("BIENFAIT", "BOON"), mid - 8, P.y);
    centered(b, "1  2  3", mid, P.y);
  } else if (view.isPaused) {
    rect(b, 0, 10, VW, VH - 10, P.k, 0.55);
    centered(b, "PAUSE", mid - 8, P.w);
    banner(b, view.hint, mid + 4, P.s, 0);
  }
}
function drawSplash(b, view) {
  const tone = BIOME_TONES[0];
  for (let ty = 0; ty < VH; ty += 8) for (let tx = 0; tx < VW; tx += 8) {
    rect(b, tx, ty, 8, 8, tone.floor[(tx / 8 + ty / 8) % 2 === 0 ? 0 : 1]);
    put(b, tx, ty, tone.crack);
  }
  rect(b, 0, 0, VW, 10, tone.wall);
  rect(b, 0, 10, VW, 1, tone.wallTop);
  for (const x of [8, VW - 6]) {
    rect(b, x - 1, 12, 2, 6, P.b);
    disc(b, x, 10, 2, P.a);
    put(b, x, 9, P.y);
    disc(b, x, 12, 9, P.a, 0.12);
  }
  const hero = HERO[0];
  const big = VH >= 48;
  const s = big ? 3 : 1;
  const x0 = big ? Math.round(VW / 2 - hero.w * s / 2) : Math.round(VW / 2 + 18);
  const y0 = VH - hero.h * s - (big ? 4 : 2);
  rect(b, x0 + 1, VH - (big ? 5 : 3), hero.w * s - 2, 1, P.k, 0.4);
  for (let y = 0; y < hero.h; y++) for (let x = 0; x < hero.w; x++) {
    const ch = hero.rows[y]?.[x] ?? ".";
    const c = P[ch];
    if (ch !== "." && c) rect(b, x0 + x * s, y0 + y * s, s, s, c);
  }
  const old = scale;
  scale = big ? 2 : 1;
  centered(b, "CLAUWLER", big ? 14 : Math.round(VH / 2) - 1, P.y);
  scale = old;
  if (view.hint && big) centered(b, view.hint, 28, P.w);
}

// helper/src/main.ts
var dir = process.argv[2];
if (!dir) throw new Error("usage: engine.mjs <dir>");
mkdirSync(dir, { recursive: true });
var statePath = join(dir, "state.json");
var lastMtime = 0;
var lastGen = -1;
var lastSeen = Date.now();
var buffers = /* @__PURE__ */ new Map();
function frame(res) {
  let buf = buffers.get(res);
  if (!buf) {
    const size = frameSize(res);
    buf = new Uint8Array(size.width * size.height * 4);
    buffers.set(res, buf);
  }
  return buf;
}
function poll() {
  let mtime = 0;
  try {
    mtime = statSync(statePath).mtimeMs;
  } catch {
  }
  if (mtime && mtime !== lastMtime) {
    let msg;
    try {
      msg = JSON.parse(readFileSync(statePath, "utf8"));
    } catch {
    }
    if (msg) lastMtime = mtime;
    if (msg && msg.gen !== lastGen) {
      lastGen = msg.gen;
      lastSeen = Date.now();
      const res = msg.view.res ?? 2;
      const buf = frame(res);
      const t0 = performance.now();
      renderFrame(msg.live, msg.view, buf);
      const size = frameSize(res);
      const png = encodeIndexedPng(buf, size.width, size.height);
      const path = join(dir, `f${msg.gen % 3}.png`);
      const tmp = `${path}.tmp`;
      const fd = openSync(tmp, "w");
      writeSync(fd, png);
      closeSync(fd);
      renameSync(tmp, path);
      process.stdout.write(`F ${msg.gen} ${path} ${(performance.now() - t0).toFixed(1)}
`);
    }
  }
  if (Date.now() - lastSeen > 3e4 || process.ppid === 1) process.exit(0);
  setTimeout(poll, 2);
}
process.stdout.write(`READY ${dir}
`);
poll();
