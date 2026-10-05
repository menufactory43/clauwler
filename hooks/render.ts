import type { RGB, Sprite } from './art'
import type { Fine } from './art'
import {
  BIOME_TONES, BUG, BURROWER, CHEST, FAMILIAR, FINE, FORKER, GOBLIN, GUARDIAN_FINE, HERO, HERO_FINE, ICONS, LARVA, LEAK, LINTER,
  MICRO, MINER, MONOLITH, P, RAT, REVIEWER, SENTINEL, SKELETON, SLUG, SNIPER, TURRET, fold, glyph, lit,
} from './art'
import type { Enemy, Live, Strike } from './sim'
import { AFFIX_LABEL, ENEMY, FH, FW, ROOM, rayToWall } from './sim'
import { tr } from './i18n'

export type View = {
  biomeLabel: string
  roomLabel: string
  eclats: number
  boons: number
  isPaused: boolean
  isOffer: boolean
  hint: string
  /** Text drawn this many pixels per font pixel: 2 when the frame is shrunk into terminal cells. */
  scale: number
  /** The viewport in pixels: smaller than the room, a camera follows the champion. */
  vw?: number
  vh?: number
  /** The HUD and the words drawn in pixels; off when the pane writes them as text. */
  hasPixelHud?: boolean
  /** Damage numbers and name tags in the world. */
  hasWorldText?: boolean
  /** Fine pixels a world pixel: 2 draws the fine art, the textures and the light. */
  res?: number
}

/** World rows above the walls left out of a fine frame (the old pixel HUD's band). */
export const FRAME_TOP = 10

/** The size of a frame drawn at `res`. */
export const frameSize = (res: number) => (res > 1 ? { width: FW * res, height: (FH - FRAME_TOP) * res } : { width: FW, height: FH })

type Buf = { px: Uint8Array; ox: number; oy: number }

/** Fine pixels to a world pixel: 1 for terminal cells, 2 for a real picture. */
let S = 1
let RW = FW
let RH = FH

/** One fine pixel, at render coordinates. */
function dot(b: Buf, xi: number, yi: number, c: RGB, a = 1) {
  if (xi < 0 || yi < 0 || xi >= RW || yi >= RH) return
  const i = (yi * RW + xi) * 4
  if (a >= 1) {
    b.px[i] = c[0]; b.px[i + 1] = c[1]; b.px[i + 2] = c[2]
  } else if (a > 0) {
    b.px[i] = b.px[i]! + (c[0] - b.px[i]!) * a
    b.px[i + 1] = b.px[i + 1]! + (c[1] - b.px[i + 1]!) * a
    b.px[i + 2] = b.px[i + 2]! + (c[2] - b.px[i + 2]!) * a
  }
}

const fx0 = (b: Buf, x: number) => Math.round((x + b.ox) * S)
const fy0 = (b: Buf, y: number) => Math.round((y + b.oy) * S)

/** A world pixel: a block of fine ones. */
function put(b: Buf, x: number, y: number, c: RGB, a = 1) {
  const xi = fx0(b, x)
  const yi = fy0(b, y)
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) dot(b, xi + i, yi + j, c, a)
}

/** A single fine pixel at world coordinates: the thin strokes. */
function fput(b: Buf, x: number, y: number, c: RGB, a = 1) {
  dot(b, Math.round((x + b.ox) * S), Math.round((y + b.oy) * S), c, a)
}

function rect(b: Buf, x: number, y: number, w: number, h: number, c: RGB, a = 1) {
  const x0 = fx0(b, x)
  const y0 = fy0(b, y)
  const x1 = Math.round((x + w + b.ox) * S)
  const y1 = Math.round((y + h + b.oy) * S)
  for (let j = Math.max(0, y0); j < Math.min(RH, y1); j++) for (let i = Math.max(0, x0); i < Math.min(RW, x1); i++) dot(b, i, j, c, a)
}

function disc(b: Buf, cx: number, cy: number, r: number, c: RGB, a = 1) {
  const R = r * S + (S > 1 ? 0.5 : 0)
  const x = (cx + b.ox) * S
  const y = (cy + b.oy) * S
  for (let j = Math.floor(-R); j <= Math.ceil(R); j++) for (let i = Math.floor(-R); i <= Math.ceil(R); i++) if (i * i + j * j <= R * R) dot(b, Math.round(x + i), Math.round(y + j), c, a)
}

/** A shaded ball, lit from the top left. */
function ball(b: Buf, cx: number, cy: number, r: number, c: RGB, a = 1) {
  if (S === 1) return disc(b, cx, cy, r, c, a)
  const R = r * S + 0.5
  const x = (cx + b.ox) * S
  const y = (cy + b.oy) * S
  for (let j = Math.floor(-R); j <= Math.ceil(R); j++) for (let i = Math.floor(-R); i <= Math.ceil(R); i++) {
    const d = i * i + j * j
    if (d > R * R) continue
    const l = ((i + j) / (R * 1.4))
    const k = d > (R - 1.2) ** 2 ? 0.55 : 1 - l * 0.35
    const hi = (i + R * 0.4) ** 2 + (j + R * 0.4) ** 2 < (R * 0.22) ** 2
    dot(b, Math.round(x + i), Math.round(y + j), hi ? [Math.min(245, c[0] + 90), Math.min(245, c[1] + 90), Math.min(245, c[2] + 80)] : [c[0] * k, c[1] * k, Math.min(255, c[2] * k + (k < 0.8 ? 8 : 0))], a)
  }
}

function circle(b: Buf, cx: number, cy: number, r: number, c: RGB, a = 1) {
  const steps = Math.max(12, Math.round(r * 7 * S))
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    fput(b, cx + Math.cos(t) * r, cy + Math.sin(t) * r, c, a)
  }
}

function line(b: Buf, x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * S))
  for (let i = 0; i <= n; i++) fput(b, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, a)
}

/** A soft oval shadow on the floor. */
function shadow(b: Buf, cx: number, cy: number, rx: number, ry: number, a = 0.4) {
  if (S === 1) return rect(b, cx - rx, cy, rx * 2, 1, P.k!, a)
  const X = (cx + b.ox) * S
  const Y = (cy + b.oy) * S
  const RX = rx * S
  const RY = ry * S
  for (let j = Math.floor(-RY); j <= Math.ceil(RY); j++) for (let i = Math.floor(-RX); i <= Math.ceil(RX); i++) {
    const d = (i / RX) ** 2 + (j / RY) ** 2
    if (d < 1) dot(b, Math.round(X + i), Math.round(Y + j), P.k!, a * (1 - d * d))
  }
}

/** `sx`/`sy`: the fine sprite stretched (squash and stretch, feet held); `mul`: its colours multiplied (elites, Némésis). */
type BlitOpts = { flip?: boolean; tint?: RGB; swap?: Record<string, string>; alpha?: number; sx?: number; sy?: number; mul?: RGB }

function blit(b: Buf, s: Sprite, cx: number, by: number, opts: BlitOpts = {}) {
  const x0 = Math.round(cx - s.w / 2)
  const y0 = Math.round(by - s.h)
  for (let y = 0; y < s.h; y++) {
    const row = s.rows[y] ?? ''
    for (let x = 0; x < s.w; x++) {
      let ch = row[opts.flip ? s.w - 1 - x : x] ?? '.'
      if (ch === '.') continue
      if (opts.swap?.[ch]) ch = opts.swap[ch]!
      const c = opts.tint && ch !== 'k' ? opts.tint : P[ch]
      if (c) put(b, x0 + x, y0 + y, c, opts.alpha ?? 1)
    }
  }
}

/** A fine sprite, its feet at `by`, centred on `cx` (world coordinates). */
function blitFine(b: Buf, s: Fine, cx: number, by: number, opts: BlitOpts = {}) {
  const sx = opts.sx ?? 1
  const sy = opts.sy ?? 1
  const W = Math.max(1, Math.round(s.w * sx))
  const H = Math.max(1, Math.round(s.h * sy))
  const x0 = Math.round((cx + b.ox) * S - W / 2)
  const y0 = Math.round((by + b.oy) * S - H)
  const mul = opts.mul
  for (let y = 0; y < H; y++) {
    const fy = Math.min(s.h - 1, Math.floor(y / sy))
    for (let x = 0; x < W; x++) {
      const fx = Math.min(s.w - 1, Math.floor(x / sx))
      const k = fy * s.w + (opts.flip ? s.w - 1 - fx : fx)
      let ch = s.ch[k]!
      if (ch === '.') continue
      if (opts.swap?.[ch]) ch = opts.swap[ch]!
      const base = opts.tint && ch !== 'k' ? opts.tint : P[ch]
      if (!base) continue
      let c = lit(base, s.light[k]!)
      if (mul) c = [Math.min(245, c[0] * mul[0]), Math.min(245, c[1] * mul[1]), Math.min(245, c[2] * mul[2])]
      dot(b, x0 + x, y0 + y, c, opts.alpha ?? 1)
    }
  }
}

/** A coarse sprite, or its fine version when the frame is fine. */
function sprite(b: Buf, coarse: Sprite, fine: Fine | undefined, cx: number, by: number, opts: BlitOpts = {}) {
  if (S > 1 && fine) blitFine(b, fine, cx, by, opts)
  else blit(b, coarse, cx, by, opts)
}

let scale = 1
let VW = FW
let VH = FH
let hasWorldText = true

/** Words in the world: one fine pixel a font pixel when the frame is fine. */
const worldScale = () => (S > 1 ? 1 / S : scale)

export function text(b: Buf, raw: string, x: number, y: number, c: RGB, shadow = true) {
  const s = fold(raw)
  let cx = Math.round(x)
  for (const ch of s) {
    const g = glyph(ch)
    if (g) {
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
        if (g[j * 3 + i] !== '1') continue
        if (shadow) rect(b, cx + (i + 1) * scale, y + (j + 1) * scale, scale, scale, P.k!)
        rect(b, cx + i * scale, y + j * scale, scale, scale, c)
      }
    }
    cx += 4 * scale
  }
}

export const textWidth = (raw: string) => (fold(raw).length * 4 - 1) * scale

function centered(b: Buf, raw: string, y: number, c: RGB) {
  text(b, raw, Math.round((VW - textWidth(raw)) / 2), y, c)
}

/** Words laid in lines that fit the viewport. */
function wrapLines(raw: string): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of fold(raw).split(' ').filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (textWidth(next) > VW - 4 && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** A centred block of lines around `mid`, on a dark band. Returns nothing. */
function banner(b: Buf, raw: string, mid: number, c: RGB, alpha: number) {
  const lines = wrapLines(raw)
  const h = lines.length * 7
  const top = Math.round(mid - h / 2)
  rect(b, 0, top - 3, VW, h + 5, P.k!, alpha)
  lines.forEach((line, i) => centered(b, line, top + i * 7, c))
}

// ---------- the room ----------

function tileNoise(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function drawRoom(b: Buf, live: Live) {
  const tone = BIOME_TONES[Math.min(live.biome, BIOME_TONES.length - 1)]!
  // Floor in 8px flagstones, a crack here and there.
  for (let ty = ROOM.y0; ty < ROOM.y1 + 2; ty += 8) {
    for (let tx = ROOM.x0 - 2; tx < ROOM.x1 + 2; tx += 8) {
      const n = tileNoise(tx, ty, live.biome * 31 + live.depth)
      const base = tone.floor[(tx / 8 + ty / 8) % 2 === 0 ? 0 : 1]
      rect(b, tx, ty, 8, 8, base)
      put(b, tx, ty, tone.crack)
      if (n < 0.25) line(b, tx + 2, ty + 2 + Math.floor(n * 16), tx + 5, ty + 5, tone.crack)
      if (n > 0.92) put(b, tx + 4, ty + 3, tone.wallTop, 0.5)
    }
  }
  // Walls.
  rect(b, 0, 10, FW, ROOM.y0 - 10, tone.wall)
  rect(b, 0, 10, FW, 1, tone.wallTop)
  for (let x = 0; x < FW; x += 6) rect(b, x, 12 + ((x / 6) % 2), 1, ROOM.y0 - 13, tone.crack, 0.6)
  rect(b, 0, ROOM.y0 - 1, FW, 1, P.k!, 0.6)
  rect(b, 0, 10, ROOM.x0, FH - 10, tone.wall)
  rect(b, ROOM.x1, 10, FW - ROOM.x1, FH - 10, tone.wall)
  rect(b, ROOM.x0 - 1, ROOM.y0, 1, ROOM.y1 - ROOM.y0, tone.wallTop, 0.5)
  rect(b, ROOM.x1, ROOM.y0, 1, ROOM.y1 - ROOM.y0, P.k!, 0.5)
  rect(b, 0, ROOM.y1, FW, FH - ROOM.y1, tone.wall)
  rect(b, 0, ROOM.y1, FW, 1, tone.wallTop, 0.6)
  drawDoors(b, live)
  // Pillars, with a shadow.
  for (const p of live.pillars) {
    rect(b, p.x + 2, p.y + p.h, p.w, 3, P.k!, 0.35)
    rect(b, p.x, p.y - 4, p.w, p.h + 4, tone.pillar)
    rect(b, p.x, p.y - 4, p.w, 2, tone.wallTop)
    rect(b, p.x + p.w - 2, p.y - 2, 2, p.h + 2, tone.wall)
  }
}

// ---------- the fine room: textured once per room, lit every frame ----------

let staticFor: unknown = null
let staticRes = 0
let staticCleared = false
let staticPx = new Uint8Array(0)

const mix = (c: RGB, k: number, add = 0): RGB => [Math.max(0, Math.min(245, c[0] * k + add)), Math.max(0, Math.min(245, c[1] * k + add)), Math.max(0, Math.min(245, c[2] * k + add))]

/** The walls in bricks, the floor in bevelled flagstones with cracks and moss, the pillars round. */
function paintStatic(live: Live) {
  const tone = BIOME_TONES[Math.min(live.biome, BIOME_TONES.length - 1)]!
  const seed = live.biome * 31 + live.depth * 7 + (live.doors[0]?.to ?? 0) * 13
  const b: Buf = { px: staticPx, ox: 0, oy: -FRAME_TOP }
  staticPx.fill(255)
  const moss: RGB = live.biome === 1 ? [150, 70, 30] : live.biome === 2 ? [70, 140, 110] : [70, 110, 60]
  for (let y = 0; y < RH; y++) {
    const wy = y / S + FRAME_TOP
    for (let x = 0; x < RW; x++) {
      const wx = x / S
      const inFloor = wx >= ROOM.x0 && wx < ROOM.x1 && wy >= ROOM.y0 && wy < ROOM.y1
      let c: RGB
      if (inFloor) {
        // Flagstones of 8 world pixels, every other row shifted by half.
        const row = Math.floor((wy - ROOM.y0) / 8)
        const sx = wx - ROOM.x0 + (row % 2) * 4
        const col = Math.floor(sx / 8)
        const lx = Math.floor((sx % 8) * S)
        const ly = Math.floor((((wy - ROOM.y0) % 8)) * S)
        const T = 8 * S
        const n = tileNoise(col, row, seed)
        const base = tone.floor[(col + row) % 2]!
        let k = 0.9 + n * 0.22
        if (lx === 0 || ly === 0) k = 0.55
        else if (lx === 1 || ly === 1) k += 0.14
        else if (lx === T - 1 || ly === T - 1) k -= 0.16
        k += (tileNoise(Math.floor(wx), Math.floor(wy), seed + 5) - 0.5) * 0.1
        c = mix(base, k)
        // A crack across some stones, moss in some corners.
        const cn = tileNoise(col * 3 + 1, row * 5 + 2, seed)
        if (cn < 0.22 && Math.abs(ly - (T * 0.3 + lx * (cn * 3 - 0.3))) < 0.7 && lx > 2 && lx < T - 3) c = mix(tone.crack, 0.9)
        if (cn > 0.85 && lx + ly < T * 0.5 && tileNoise(x, y, seed + 9) < 0.5) c = mix(moss, 0.55 + tileNoise(x, y, seed) * 0.3)
        // Darker where the floor meets the walls.
        const edge = Math.min(wx - ROOM.x0, ROOM.x1 - wx, (wy - ROOM.y0) * 0.7, ROOM.y1 - wy)
        if (edge < 6) c = mix(c, 0.55 + 0.45 * (edge / 6))
      } else if (wy < 10) {
        c = [14, 9, 20]
      } else {
        // Bricks: 10 by 5, staggered; the north face lit, the others in shade.
        const isFace = wy < ROOM.y0 && wx >= ROOM.x0 - 1 && wx < ROOM.x1 + 1
        const by = Math.floor(wy / 5)
        const bxw = wx + (by % 2) * 5
        const bx = Math.floor(bxw / 10)
        const lx = Math.floor((bxw % 10) * S)
        const ly = Math.floor((wy % 5) * S)
        const n = tileNoise(bx, by, seed + 3)
        let k = (isFace ? 1 : 0.62) * (0.88 + n * 0.24)
        if (lx === 0 || ly === 0) k *= 0.5
        else if (ly === 1) k *= 1.18
        else if (ly === 5 * S - 1) k *= 0.8
        k += (tileNoise(Math.floor(wx), Math.floor(wy), seed + 11) - 0.5) * 0.08
        c = mix(isFace ? tone.wall : mix(tone.wall, 0.9), k)
        if (wy >= 10 && wy < 11) c = tone.wallTop
      }
      dot(b, x, y, c)
    }
  }
  // The rim where walls meet the floor.
  rect(b, ROOM.x0, ROOM.y0 - 1, ROOM.x1 - ROOM.x0, 1, P.k!, 0.5)
  rect(b, ROOM.x0 - 1, ROOM.y0, 0.5, ROOM.y1 - ROOM.y0, tone.wallTop, 0.6)
  rect(b, ROOM.x1, ROOM.y0, 0.5, ROOM.y1 - ROOM.y0, P.k!, 0.6)
  rect(b, ROOM.x0, ROOM.y1, ROOM.x1 - ROOM.x0, 0.5, tone.wallTop, 0.5)
  // Pillars: a lit cap, a body shaded like a drum, a long shadow.
  for (const p of live.pillars) {
    shadow(b, p.x + p.w / 2 + 3, p.y + p.h, p.w / 2 + 3, 3, 0.5)
    const x0 = Math.round(p.x * S)
    const x1 = Math.round((p.x + p.w) * S)
    const y0 = Math.round((p.y - 4 - FRAME_TOP) * S)
    const y1 = Math.round((p.y + p.h - FRAME_TOP) * S)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0 - 1)
      const isCap = y < y0 + 3 * S
      const k = isCap ? 1.25 - u * 0.3 : 1.15 - Math.abs(u - 0.3) * 0.9 + (tileNoise(x >> 1, y >> 1, seed) - 0.5) * 0.08
      let c = mix(isCap ? tone.wallTop : tone.pillar, k)
      if (!isCap && (y - y0) % (4 * S) === 0) c = mix(c, 0.75)
      if (x === x0 || x === x1 - 1 || y === y1 - 1) c = mix(c, 0.5)
      dot(b, x, y, c)
    }
  }
}

/** The room's textured layer, painted once, laid under the frame with the shake's offset. */
function drawStatic(b: Buf, live: Live) {
  if (staticFor !== roomKeyOf(live) || staticRes !== S || staticPx.length !== RW * RH * 4) {
    if (staticPx.length !== RW * RH * 4) staticPx = new Uint8Array(RW * RH * 4)
    staticFor = roomKeyOf(live)
    staticRes = S
    staticCleared = live.isCleared
    paintStatic(live)
    // Barred doors go into the layer; once open, each frame draws them glowing over the bars.
    if (!live.isCleared) drawDoors({ px: staticPx, ox: 0, oy: -FRAME_TOP }, live)
  }
  const dx = Math.round(b.ox * S)
  const dy = Math.round((b.oy + FRAME_TOP) * S)
  if (dx === 0 && dy === 0) { b.px.set(staticPx.subarray(0, RW * RH * 4)); return }
  for (let y = 0; y < RH; y++) {
    const sy = y - dy
    if (sy < 0 || sy >= RH) continue
    const sx0 = Math.max(0, -dx)
    const sx1 = Math.min(RW, RW - dx)
    b.px.set(staticPx.subarray((sy * RW + sx0) * 4, (sy * RW + sx1) * 4), (y * RW + sx0 + dx) * 4)
  }
}

/** Torches on the north wall, clear of its door. */
function torches(live: Live): number[] {
  const north = live.doors.find(d => d.side === 'n')
  return [36, 124].map(x => (north && Math.abs(north.x - x) < 14 ? x + (x < 80 ? -16 : 16) : x))
}

function drawTorches(b: Buf, live: Live) {
  for (const [i, x] of torches(live).entries()) {
    const y = ROOM.y0 - 3
    // The sconce.
    rect(b, x - 0.5, y - 1, 1, 4, P.B!)
    rect(b, x - 2, y - 2, 4, 1.5, P.g!)
    rect(b, x - 2, y - 2, 4, 0.5, P.s!)
    const f = Math.sin(live.t * 13 + i * 2) + Math.sin(live.t * 7.3 + i)
    const sway = f > 0.6 ? 1 : f < -0.6 ? -1 : 0
    const H = (5 + (f > 0.2 ? 1 : 0)) * S
    const bx = Math.round((x + b.ox) * S)
    const by = Math.round((y - 2 + b.oy) * S)
    // A halo, then the flame from its white heart outward.
    for (let j = -H - 4; j < 4; j++) for (let k = -8; k <= 8; k++) {
      const d = (k * k) / 64 + ((j + H / 2) ** 2) / ((H / 2 + 6) ** 2)
      if (d < 1) dot(b, bx + k, by + j, P.a!, 0.18 * (1 - d))
    }
    for (let j = 0; j < H; j++) {
      const u = j / H
      const w = Math.max(1, Math.round((1 - u) * 3.2 + (u < 0.3 ? u * 4 : 0)))
      const off = Math.round(sway * u * u * 2)
      for (let k = -w; k <= w; k++) {
        const edge = Math.abs(k) / (w + 0.01)
        const c: RGB = u < 0.45 && edge < 0.4 ? P.w! : u < 0.7 && edge < 0.7 ? P.y! : edge < 0.9 && u < 0.85 ? P.a! : P.r!
        dot(b, bx + k + off, by - j, c)
      }
    }
  }
}

type Light = { x: number; y: number; r: number; c: RGB; i: number }

let lightBuf = new Float32Array(0)
let ambBuf = new Float32Array(0)
let ambKey = ''

/**
 * Multiplies the frame by an ambient dark and the lights' warm pools. The light
 * is worked out once a world pixel and spread over its fine ones.
 */
/** Adds one light's pool to a light map of world cells. */
function addLight(buf: Float32Array, L: Light, ox: number, oy: number, LW: number, LH: number) {
  const lightBuf = buf
  const cx = L.x + ox
  const cy = L.y + oy
  const R = L.r
  const x0 = Math.max(0, Math.floor(cx - R))
  const x1 = Math.min(LW - 1, Math.ceil(cx + R))
  const y0 = Math.max(0, Math.floor(cy - R))
  const y1 = Math.min(LH - 1, Math.ceil(cy + R))
  const inv = 1 / (R * R)
  for (let y = y0; y <= y1; y++) {
    const dy2 = (y + 0.5 - cy) ** 2
    for (let x = x0; x <= x1; x++) {
      const d = ((x + 0.5 - cx) ** 2 + dy2) * inv
      if (d >= 1) continue
      const f = (1 - d) * (1 - d) * L.i
      const k = (y * LW + x) * 3
      lightBuf[k] = lightBuf[k]! + f * L.c[0]
      lightBuf[k + 1] = lightBuf[k + 1]! + f * L.c[1]
      lightBuf[k + 2] = lightBuf[k + 2]! + f * L.c[2]
    }
  }
}

function applyLight(b: Buf, live: Live, lights: Light[]) {
  const LW = Math.ceil(RW / S)
  const LH = Math.ceil(RH / S)
  const n = LW * LH * 3
  // The ambient and the room's fixed lights (torches, the glow of open doors), worked out once.
  const key = `${live.biome}:${LW}x${LH}:${roomId(live)}:${live.isCleared}`
  if (ambKey !== key) {
    ambKey = key
    if (ambBuf.length !== n) {
      ambBuf = new Float32Array(n)
      lightBuf = new Float32Array(n)
    }
    const amb: RGB = live.biome === 1 ? [0.42, 0.32, 0.3] : live.biome === 2 ? [0.28, 0.38, 0.4] : [0.32, 0.3, 0.42]
    // Ambient, darker toward the frame's edges.
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const dx = x / LW - 0.5
      const dy = y / LH - 0.55
      const v = 1 - (dx * dx + dy * dy) * 1.6
      const k = (y * LW + x) * 3
      ambBuf[k] = amb[0] * v
      ambBuf[k + 1] = amb[1] * v
      ambBuf[k + 2] = amb[2] * v
    }
    for (const L of fixedLights(live)) addLight(ambBuf, L, 0, -FRAME_TOP, LW, LH)
  }
  lightBuf.set(ambBuf)
  for (const L of lights) addLight(lightBuf, L, b.ox, b.oy, LW, LH)

  // Each world cell's three factors once, laid over its fine pixels; the clamped view caps at 255.
  const px = new Uint8ClampedArray(b.px.buffer, b.px.byteOffset, RW * RH * 4)
  for (let ly = 0; ly < LH; ly++) for (let lx = 0; lx < LW; lx++) {
    const k = (ly * LW + lx) * 3
    // In steps of 1/16: smooth enough to the eye, and the picture packs far smaller.
    const fr = (Math.min(1.7, lightBuf[k]!) * 16 + 0.5) | 0
    const fg = (Math.min(1.7, lightBuf[k + 1]!) * 16 + 0.5) | 0
    const fb = (Math.min(1.7, lightBuf[k + 2]!) * 16 + 0.5) | 0
    for (let j = 0; j < S; j++) {
      const y = ly * S + j
      if (y >= RH) break
      let i = (y * RW + lx * S) * 4
      for (let q = 0; q < S; q++, i += 4) {
        px[i] = (px[i]! * fr) >> 4
        px[i + 1] = (px[i + 1]! * fg) >> 4
        px[i + 2] = (px[i + 2]! * fb) >> 4
      }
    }
  }
}

const KIND_GLOW: Record<string, RGB> = { treasure: [1, 0.9, 0.4], shop: [0.4, 0.9, 1], boss: [1, 0.35, 0.3], session: [1, 0.6, 0.25] }

/** The lights that never move in a room: baked into its ambient. */
function fixedLights(live: Live): Light[] {
  const lights: Light[] = []
  for (const x of torches(live)) lights.push({ x, y: ROOM.y0 - 4, r: 58, c: [1.25, 0.66, 0.26], i: 0.88 })
  if (live.isCleared) for (const d of live.doors) lights.push({ x: d.x, y: d.y, r: 22, c: KIND_GLOW[d.kind] ?? [0.8, 0.7, 0.6], i: 0.7 })
  return lights
}

const roomIds = new WeakMap<Live, number>()
let nextRoomId = 1
const roomId = (live: Live) => live.roomKey ?? roomIds.get(live) ?? (roomIds.set(live, nextRoomId), nextRoomId++)
/** What tells one room from the next: its key when the frame is drawn from a copy (the picture process). */
const roomKeyOf = (live: Live): unknown => live.roomKey ?? live

function lightsOf(live: Live): Light[] {
  const lights: Light[] = []
  const p = live.player
  lights.push({ x: p.x, y: p.y - 5, r: 70, c: [1, 0.9, 0.78], i: 1 })
  for (const pr of live.projs) {
    if (pr.kind === 'bolt') lights.push({ x: pr.x, y: pr.y, r: 14, c: [0.4, 0.9, 1.2], i: 0.9 })
    else if (pr.kind === 'orb') lights.push({ x: pr.x, y: pr.y, r: 12, c: [1.2, 0.4, 0.3], i: 0.8 })
    else if (pr.kind === 'spit') lights.push({ x: pr.x, y: pr.y, r: 9, c: [0.5, 1, 0.3], i: 0.6 })
  }
  for (const item of live.pickups) {
    const c: RGB = item.kind === 'portal' ? [0.4, 0.6, 1.2] : item.kind === 'shard' || item.kind === 'bolt' ? [0.4, 1, 1.1] : item.kind === 'heart' || item.kind === 'shopHeart' ? [1.1, 0.4, 0.4] : [1.1, 0.95, 0.5]
    lights.push({ x: item.x, y: item.y - 3, r: item.kind === 'stairs' || item.kind === 'altar' ? 30 : 16, c, i: 0.7 })
  }
  for (const e of live.enemies) {
    if (e.type === 'boss') lights.push({ x: e.x, y: e.y - e.r, r: 34, c: e.kind === 'nemesis' ? [1, 0.4, 1] : [1, 0.45, 0.4], i: 0.55 })
    else if (e.kind === 'error') lights.push({ x: e.x, y: e.y - 4, r: 14, c: [1.1, 0.6, 0.2], i: 0.6 })
  }
  for (const s of live.strikes ?? []) if (s.zone > 0) lights.push({ x: s.x, y: s.y, r: s.r + 8, c: [1.2, 0.6, 0.25], i: 0.6 })
  for (const fx of live.fx) {
    if (fx.kind === 'ring' && fx.r) lights.push({ x: fx.x, y: fx.y, r: fx.r + 10, c: [fx.color[0] / 200, fx.color[1] / 200, fx.color[2] / 200], i: fx.ttl / fx.max })
  }
  return lights
}

/**
 * A door in fine pixels: a bevelled stone frame in the room kind's colour, a passage
 * darkening toward the outside, iron bars while the room holds, a glow once it is clear.
 */
function fineDoor(b: Buf, live: Live, side: string, x: number, y: number, w: number, h: number, kind: RGB, isOpen: boolean, stone: RGB) {
  const x0 = fx0(b, x - 1.5)
  const y0 = fy0(b, y - 1.5)
  const x1 = Math.round((x + w + 1.5 + b.ox) * S)
  const y1 = Math.round((y + h + 1.5 + b.oy) * S)
  const ix0 = fx0(b, x)
  const iy0 = fy0(b, y)
  const ix1 = Math.round((x + w + b.ox) * S)
  const iy1 = Math.round((y + h + b.oy) * S)
  const frame = mix(kind, 0.55)
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
    const inside = i >= ix0 && i < ix1 && j >= iy0 && j < iy1
    if (!inside) {
      const k = i < x0 + 1 || j < y0 + 1 ? 1.35 : i >= x1 - 1 || j >= y1 - 1 ? 0.6 : 1
      dot(b, i, j, mix(i < ix0 - 1 || j < iy0 - 1 || i > ix1 || j > iy1 ? mix(stone, 0.8) : frame, k))
      continue
    }
    // Depth: 0 at the room's edge of the passage, 1 at the far end.
    const u = side === 'n' ? 1 - (j - iy0) / (iy1 - iy0) : side === 's' ? (j - iy0) / (iy1 - iy0) : side === 'w' ? 1 - (i - ix0) / (ix1 - ix0) : (i - ix0) / (ix1 - ix0)
    let c: RGB = mix([30, 20, 34], 1 - u * 0.7)
    if (isOpen) {
      const pulse = 0.55 + 0.2 * Math.sin(live.t * 4 + u * 3)
      c = mix(kind, (1 - u) * pulse + 0.15)
    } else {
      const across = side === 'n' || side === 's' ? i - ix0 : j - iy0
      const along = side === 'n' || side === 's' ? j - iy0 : i - ix0
      const span = side === 'n' || side === 's' ? iy1 - iy0 : ix1 - ix0
      const bar = across % 6
      if (bar === 2 || bar === 3) c = bar === 2 ? P.s! : P.S!
      if (Math.abs(along - Math.round(span * 0.35)) < 1.5) c = across % 6 === 2 ? P.w! : P.g!
    }
    dot(b, i, j, c)
  }
}

function drawDoors(b: Buf, live: Live) {
  const tone = BIOME_TONES[Math.min(live.biome, BIOME_TONES.length - 1)]!
  // Doors on every wall that leads somewhere: barred until the room is clear.
  for (const door of live.doors) {
    const isOpen = live.isCleared
    const kindColor = door.kind === 'treasure' ? P.y! : door.kind === 'shop' ? P.c! : door.kind === 'boss' ? P.r! : door.kind === 'session' ? P.a! : tone.wallTop
    const vertical = door.side === 'n' || door.side === 's'
    const [x, y, w, h] = door.side === 'n' ? [door.x - 6, 11, 12, ROOM.y0 - 11]
      : door.side === 's' ? [door.x - 6, ROOM.y1, 12, FH - ROOM.y1]
        : door.side === 'w' ? [0, door.y - 2, ROOM.x0, 12]
          : [ROOM.x1, door.y - 2, FW - ROOM.x1, 12]
    if (S > 1) {
      fineDoor(b, live, door.side, x, y, w, h, kindColor, isOpen, tone.wallTop)
    } else {
    rect(b, x - 1, y - 1, w + 2, h + 2, kindColor)
    rect(b, x, y, w, h, P.k!)
    if (!isOpen) {
      for (let i = 1; i < (vertical ? w : h); i += 3) {
        if (vertical) rect(b, x + i, y, 1, h, P.g!)
        else rect(b, x, y + i, w, 1, P.g!)
      }
    } else {
      const glow = 0.2 + 0.12 * Math.sin(live.t * 4)
      rect(b, x, y, w, h, kindColor, glow)
    }
    }
    const iconKey = door.kind === 'treasure' ? 'boon' : door.kind === 'shop' ? 'eclats' : door.kind === 'boss' ? 'boss' : door.kind === 'session' ? 'vigor' : undefined
    const icon = iconKey ? ICONS[iconKey] : undefined
    if (icon && iconKey) {
      const ix = door.side === 'w' ? ROOM.x0 / 2 : door.side === 'e' ? (ROOM.x1 + FW) / 2 : door.x
      const iy = door.side === 'n' ? ROOM.y0 - 2 : door.side === 's' ? FH - 1 : door.y + 8
      sprite(b, icon, FINE.icons[iconKey], ix, iy)
    }
  }
}

function iconColor(reward: string): RGB {
  return reward === 'boon' ? P.y! : reward === 'eclats' ? P.c! : reward === 'heal' ? P.r! : reward === 'vigor' ? P.a! : P.w!
}

// ---------- bodies ----------

const COARSE: Record<Exclude<Enemy['type'], 'boss'>, Sprite> = {
  rat: RAT, goblin: GOBLIN, slug: SLUG, skeleton: SKELETON, larva: LARVA, bug: BUG, linter: LINTER, forker: FORKER, turret: TURRET,
  miner: MINER, burrower: BURROWER, monolith: MONOLITH, micro: MICRO, sentinel: SENTINEL, reviewer: REVIEWER, leak: LEAK, sniper: SNIPER,
}

function enemySprite(type: Enemy['type']): Sprite {
  return type === 'boss' ? LARVA : COARSE[type]
}

function enemyFine(type: Enemy['type']): Fine {
  return (FINE as unknown as Record<string, Fine | undefined>)[type] ?? FINE.larva
}

/** Session errors glow orange; a Némésis turns violet. */
const ELITE_MUL: RGB = [1.35, 0.82, 0.42]
const NEMESIS_MUL: RGB = [1.1, 0.62, 1.35]

const norm2 = (x: number, y: number): [number, number] => {
  const d = Math.hypot(x, y)
  return d < 1e-6 ? [0, 0] : [x / d, y / d]
}

/** How far into its windup a foe is, 0 to 1. */
function windupOf(e: Enemy): number {
  if (e.state !== 'windup') return 0
  return Math.max(0, Math.min(1, 1 - e.t / Math.max(0.01, e.tMax ?? ENEMY[e.type].windup)))
}

/** A flat oval on the floor. */
function oval(b: Buf, cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1) {
  const X = (cx + b.ox) * S
  const Y = (cy + b.oy) * S
  const RX = rx * S
  const RY = ry * S
  for (let j = Math.floor(-RY); j <= Math.ceil(RY); j++) for (let i = Math.floor(-RX); i <= Math.ceil(RX); i++) {
    if ((i / RX) ** 2 + (j / RY) ** 2 <= 1) dot(b, Math.round(X + i), Math.round(Y + j), c, a)
  }
}

function drawEnemy(b: Buf, live: Live, e: Enemy) {
  if (e.type === 'burrower' && e.hidden) {
    drawMound(b, live, e)
    return
  }
  if (e.state === 'spawn') {
    const k = 1 - Math.max(0, e.t) / 0.7
    disc(b, e.x, e.y, Math.max(1, Math.round(6 * k)), P.k!, 0.7)
    circle(b, e.x, e.y, 7 - k * 3, e.kind === 'error' ? P.a! : P.p!, 0.9)
    return
  }
  shadow(b, e.x, e.y, e.r + 1, 1.6, 0.45)
  if (e.type === 'boss') {
    drawBoss(b, live, e)
    return
  }
  // Anticipation: it crouches and leans away from its target, trembling more as the blow nears.
  const prog = windupOf(e)
  const [ax, ay] = norm2(e.aimX - e.x, e.aimY - e.y)
  let ox = 0
  let oy = 0
  let sx = 1
  let sy = 1
  if (e.state === 'windup') {
    ox = -ax * prog * 1.2 + (Math.floor(live.t * 30) % 2 ? 0.5 : -0.5) * prog
    oy = -ay * prog * 0.6
    sx = 1 + 0.14 * prog
    sy = 1 - 0.12 * prog
    if (e.type === 'leak') { sx += 0.3 * prog; sy += 0.35 * prog }
  } else if (e.state === 'act') {
    sx = 0.86
    sy = 1.14
  }
  const q = e.squash ?? 0
  sx *= 1 + 0.3 * q
  sy *= 1 - 0.24 * q
  const blink = e.state === 'windup' && prog > 0.35 && Math.floor(live.t * 14) % 2 === 0
  const tint = e.flash > 0 ? P.w : blink ? (e.type === 'leak' ? P.q : P.y) : undefined
  const bob = S > 1 && e.state === 'chase' ? Math.round(Math.abs(Math.sin(live.t * 10 + e.id)) * S) / S : 0
  const isBehind = e.type === 'sentinel' && Math.sin(e.faceA ?? 0) < -0.2
  if (isBehind) drawShield(b, e)
  sprite(b, enemySprite(e.type), enemyFine(e.type), e.x + ox, e.y + 0.5 - bob + oy, { flip: live.player.x < e.x, tint, sx, sy, mul: e.kind === 'error' ? ELITE_MUL : undefined })
  if (e.type === 'sentinel' && !isBehind) drawShield(b, e)
  if ((e.buff ?? 0) > 0) {
    // LGTM haste: green motes rising.
    for (let i = 0; i < 3; i++) {
      const u = (live.t * 1.5 + i / 3) % 1
      fput(b, e.x - 3 + i * 3, e.y - 2 - u * 8, P.G!, 1 - u)
    }
  }
  const h = enemySprite(e.type).h
  if (e.hp < e.maxHp || e.kind === 'error') {
    const w = e.kind === 'error' ? 14 : Math.max(8, e.r * 2)
    const y = e.y - h - 3
    const th = S > 1 ? 1.5 : 1
    rect(b, e.x - w / 2 - 0.5, y - 0.5, w + 1, th + 0.5, P.k!)
    rect(b, e.x - w / 2, y, Math.max(0, (w * e.hp) / e.maxHp), th - 0.5 || 1, e.kind === 'error' ? P.a! : P.r!)
  }
  if (e.kind === 'error' && hasWorldText) {
    const old = scale
    scale = worldScale()
    const tag = e.affix ? `${e.sig ?? ''} ${AFFIX_LABEL[e.affix]}` : e.sig ?? ''
    text(b, tag, e.x - textWidth(tag) / 2, e.y - h - 4 - 5 * scale, P.a!)
    scale = old
  }
}

/** The Sentinelle's tower shield, held where it faces. */
function drawShield(b: Buf, e: Enemy) {
  const a = e.faceA ?? 0
  const cx = e.x + Math.cos(a) * 5
  const cy = e.y - 4 + Math.sin(a) * 3.5
  const px = -Math.sin(a)
  const py = Math.cos(a)
  const len = 4.5
  for (let d = -1; d <= 1; d += 0.5) {
    const c = d < -0.4 ? P.S! : d > 0.4 ? P.W! : P.s!
    line(b, cx - px * len + Math.cos(a) * d * 0.6, cy - py * len - 1 + Math.sin(a) * d * 0.6, cx + px * len + Math.cos(a) * d * 0.6, cy + py * len - 1 + Math.sin(a) * d * 0.6, c)
  }
  put(b, cx, cy - 1, P.r!)
  line(b, cx - px * len, cy - py * len - 1, cx + px * len, cy + py * len - 1, P.y!, 0.5)
}

/** The cache worm under the floor: a mound that moves, then shakes on its mark. */
function drawMound(b: Buf, live: Live, e: Enemy) {
  const isMarked = e.pattern === 1
  const k = isMarked ? 1 - Math.max(0, e.t) / Math.max(0.01, e.tMax ?? 0.75) : 0
  const jig = isMarked ? (Math.floor(live.t * 24) % 2 ? 0.5 : -0.5) * (0.5 + k) : 0
  const rx = isMarked ? 3.5 + k * 1.5 : 3
  oval(b, e.x + jig, e.y, rx + 0.5, 1.8, P.B!)
  oval(b, e.x + jig, e.y - 0.5, rx, 1.3, P.b!)
  for (let i = 0; i < 3; i++) put(b, e.x - 2 + i * 2 + jig, e.y - 1 - ((Math.floor(live.t * 8) + i) % 2), P.T!)
}

/** The guardians, drawn fine; at S 1, the same art at half size. */
function drawBoss(b: Buf, live: Live, e: Enemy) {
  const look = GUARDIAN_FINE[e.boss ?? 0] ?? GUARDIAN_FINE[0]!
  const pose = look[(e.phase ?? 1) >= 2 ? 1 : 0]!
  const prog = windupOf(e)
  let ox = 0
  let sx = 1
  let sy = 1 + Math.sin(live.t * 3) * 0.025
  if (e.state === 'windup') {
    ox = (Math.floor(live.t * 30) % 2 ? 0.5 : -0.5) * (0.4 + prog)
    sx = 1 + 0.06 * prog
    sy *= 1 - 0.05 * prog
  } else if (e.state === 'stun') {
    // The phase change: a roar that shakes it.
    ox = Math.floor(live.t * 40) % 2 ? 1 : -1
    sx = 1.06
    sy *= 1.06
  } else if (e.state === 'act' && e.move === 'charge') {
    sx = 1.08
    sy *= 0.94
  }
  const q = e.squash ?? 0
  sx *= 1 + 0.1 * q
  sy *= 1 - 0.08 * q
  const isInv = (e.inv ?? 0) > 0 && Math.floor(live.t * 12) % 2 === 0
  const tint = e.flash > 0 || isInv ? P.w : undefined
  let mul: RGB | undefined = e.kind === 'nemesis' ? NEMESIS_MUL : undefined
  if (e.state === 'windup' && prog > 0.4 && Math.floor(live.t * 12) % 2 === 0) mul = mul ? [mul[0] * 1.3, mul[1] * 1.3, mul[2] * 1.3] : [1.35, 1.3, 1.2]
  const half = S > 1 ? 1 : 0.5
  blitFine(b, pose, e.x + ox, e.y + 1.5, { sx: sx * half, sy: sy * half, tint, mul })
}

function drawPlayer(b: Buf, live: Live) {
  const p = live.player
  if (p.iframes > 0 && p.dashT <= 0 && p.flash <= 0 && Math.floor(live.t * 20) % 2 === 0 && p.iframes < 0.55) return
  const frame = p.isMoving ? HERO[Math.floor(p.walk) % 2]! : HERO[0]!
  shadow(b, p.x, p.y + 0.5, 4.5, 1.6, 0.5)
  const fine = HERO_FINE[p.isMoving ? Math.floor(p.walk) % 2 : 0]!
  sprite(b, frame, fine, p.x, p.y + 1, { flip: p.faceX < -0.1, tint: p.flash > 0 ? P.r : undefined })
  // The weapon, held toward the facing.
  const hx = p.x + p.faceX * 4
  const hy = p.y - 5 + p.faceY * 3
  const swing = p.atkT > 0
  switch (live.weapon) {
    case 'epee': {
      const L = swing ? 8 : 5.5
      line(b, hx + 0.5, hy + 0.5, hx + p.faceX * L + 0.5, hy + p.faceY * L + 0.5, P.S!)
      line(b, hx, hy, hx + p.faceX * L, hy + p.faceY * L, P.w!)
      line(b, hx - p.faceY * 1.5, hy + p.faceX * 1.5, hx + p.faceY * 1.5, hy - p.faceX * 1.5, P.y!)
      break
    }
    case 'lance':
      line(b, hx - p.faceX * 4, hy - p.faceY * 4, hx + p.faceX * (swing ? 14 : 8), hy + p.faceY * (swing ? 14 : 8), P.s!)
      put(b, hx + p.faceX * (swing ? 14 : 8), hy + p.faceY * (swing ? 14 : 8), P.w!)
      break
    case 'arc':
      for (let i = -3; i <= 3; i++) put(b, hx + p.faceX * 2 + -p.faceY * i - p.faceX * Math.abs(i) * 0.5, hy + p.faceY * 2 + p.faceX * i - p.faceY * Math.abs(i) * 0.5, P.b!)
      break
    case 'bouclier':
      if (!live.projs.some(one => one.kind === 'shield')) disc(b, hx + p.faceX * 2, hy + p.faceY * 2, 3, swing ? P.w! : P.s!)
      break
  }
}

// ---------- the frame ----------

export function renderFrame(live: Live | null, view: View, frame: Uint8Array): Uint8Array {
  S = live ? view.res ?? 1 : 1
  const top = S > 1 ? FRAME_TOP : 0
  RW = FW * S
  RH = (FH - top) * S
  frame.fill(255)
  scale = view.scale
  VW = Math.min(FW, view.vw ?? FW)
  hasWorldText = view.hasWorldText ?? true
  const hud = view.hasPixelHud ?? true
  VH = Math.min(FH, view.vh ?? FH)
  const b: Buf = { px: frame, ox: 0, oy: -top }
  if (S > 1 && frame.byteOffset % 4 === 0) {
    // One word a pixel: opaque near-black (DB16's k) little-endian.
    new Uint32Array(frame.buffer, frame.byteOffset, RW * RH).fill(0xff1c0c14)
  } else rect(b, 0, 0, FW, FH, P.k!)
  if (!live) {
    drawSplash(b, view)
    return frame
  }
  // The camera: centred on the champion, held inside the room.
  const camX = Math.max(0, Math.min(FW - VW, Math.round(live.player.x - VW / 2)))
  const camY = Math.max(0, Math.min(FH - VH, Math.round(live.player.y - (hud ? VH + 10 : VH) / 2)))
  b.ox = -camX
  b.oy = -camY - top
  if (live.shake > 0) {
    b.ox += Math.round(Math.sin(live.t * 90) * 2 * S * Math.min(1, live.shake * 4)) / S
    b.oy += Math.round(Math.cos(live.t * 70) * 2 * S * Math.min(1, live.shake * 4)) / S
  }
  if (S > 1) {
    drawStatic(b, live)
    if (live.isCleared) drawDoors(b, live)
    drawTorches(b, live)
  } else drawRoom(b, live)

  // Under the bodies: warnings, traps, dash ghosts.
  for (const fx of live.fx) {
    const k = fx.ttl / fx.max
    if (fx.kind === 'tele') {
      if (fx.r) {
        disc(b, fx.x, fx.y - 2, fx.r, fx.color, 0.18 + 0.2 * (1 - k))
        circle(b, fx.x, fx.y - 2, fx.r, fx.color, 0.8)
      } else if (fx.x2 !== undefined && fx.y2 !== undefined) {
        line(b, fx.x, fx.y - 3, fx.x + (fx.x2 - fx.x) * 1.4, fx.y - 3 + (fx.y2 - fx.y) * 1.4, fx.color, 0.4 + 0.5 * (1 - k))
      }
    } else if (fx.kind === 'spike') {
      put(b, fx.x, fx.y, fx.color, k)
      put(b, fx.x, fx.y - 1, P.w!, k * 0.7)
    } else if (fx.kind === 'ghost') {
      sprite(b, HERO[0]!, HERO_FINE[0], fx.x, fx.y + 1, { tint: fx.color, alpha: k * 0.5, flip: live.player.faceX < 0 })
    } else if (fx.kind === 'stain' && fx.r) {
      oval(b, fx.x, fx.y, fx.r, fx.r * 0.45, fx.color, 0.35 * Math.min(1, fx.ttl / 2))
    }
  }

  for (const item of live.pickups) {
    const bob = Math.round(Math.sin(live.t * 4 + item.x) * 1)
    if (item.kind !== 'stairs' && item.kind !== 'portal') shadow(b, item.x, item.y + 1, 3.5, 1.2, 0.35)
    if (item.kind === 'heart') sprite(b, ICONS.heart!, FINE.icons.heart, item.x, item.y + bob)
    else if (item.kind === 'shard') sprite(b, ICONS.eclats!, FINE.icons.eclats, item.x, item.y + bob)
    else if (item.kind === 'altar') {
      rect(b, item.x - 6, item.y - 3, 12, 6, P.s!)
      rect(b, item.x - 6, item.y - 3, 12, 1, P.w!)
      rect(b, item.x - 5, item.y + 3, 10, 2, P.g!)
      sprite(b, ICONS.item!, FINE.icons.item, item.x, item.y - 6 + bob)
      circle(b, item.x, item.y - 8 + bob, 4 + Math.sin(live.t * 4) * 0.5, P.u!, 0.35)
    } else if (item.kind === 'shopHeart' || item.kind === 'shopBoon') {
      if (S > 1) {
        rect(b, item.x - 6, item.y + 3, 1, 3, P.B!)
        rect(b, item.x + 5, item.y + 3, 1, 3, P.B!)
        rect(b, item.x - 7, item.y + 0.5, 14, 3, P.b!)
        rect(b, item.x - 7, item.y + 0.5, 14, 0.5, P.a!)
        rect(b, item.x - 7, item.y + 3, 14, 0.5, P.B!)
        for (let k = -7 + 3.5; k < 7; k += 3.5) rect(b, item.x + k, item.y + 1, 0.5, 2, P.B!, 0.6)
      } else rect(b, item.x - 7, item.y + 1, 14, 3, P.b!)
      if (item.kind === 'shopHeart') sprite(b, ICONS.heart!, FINE.icons.heart, item.x, item.y + bob)
      else if (item.tag === 'shopItem') sprite(b, ICONS.item!, FINE.icons.item, item.x, item.y + bob)
      else sprite(b, ICONS.boon!, FINE.icons.boon, item.x, item.y + bob)
      if (S > 1 && hasWorldText) {
        const old = scale
        scale = worldScale()
        const label = `${item.price ?? 0}`
        text(b, label, item.x - textWidth(label) / 2 + 1, item.y + 4.5, live.wallet >= (item.price ?? 0) ? P.c! : P.r!)
        sprite(b, ICONS.shard!, FINE.icons.shard, item.x - textWidth(label) / 2 - 1.5, item.y + 7.5)
        scale = old
      } else for (let i = 0; i < Math.min(5, Math.ceil((item.price ?? 0) / 8)); i++) put(b, item.x - 4 + i * 2, item.y + 5, P.c!)
    } else if (item.kind === 'stairs') {
      rect(b, item.x - 8, item.y - 6, 16, 12, P.k!)
      for (let i = 0; i < 4; i++) rect(b, item.x - 7 + i, item.y - 5 + i * 3, 14 - i * 2, 1, P.g!)
      circle(b, item.x, item.y, 9 + (Math.floor(live.t * 3) % 2), P.y!, 0.5)
    } else if (item.kind === 'chest') sprite(b, CHEST, FINE.chest, item.x, item.y + 2)
    else if (item.kind === 'portal') {
      circle(b, item.x, item.y - 4, 5 + Math.sin(live.t * 6), P.u!)
      circle(b, item.x, item.y - 4, 3, P.c!, 0.7)
    } else {
      put(b, item.x, item.y - 1, P.c!)
      put(b, item.x, item.y - 2, P.w!)
      circle(b, item.x, item.y - 1, 2 + (Math.floor(live.t * 6) % 2), P.c!, 0.4)
    }
  }

  // Bodies, back to front.
  const bodies: { y: number; draw: () => void }[] = []
  for (const e of live.enemies) bodies.push({ y: e.y, draw: () => drawEnemy(b, live, e) })
  for (const ally of live.allies) bodies.push({ y: ally.y, draw: () => sprite(b, FAMILIAR, FINE.familiar, ally.x, ally.y + Math.round(Math.sin(live.t * 8) * S) / S) })
  bodies.push({ y: live.player.y, draw: () => drawPlayer(b, live) })
  bodies.sort((a, z) => a.y - z.y)
  for (const body of bodies) body.draw()

  if (S > 1) applyLight(b, live, lightsOf(live))

  // Over the light, so they read at once: what is about to land, and what is flying.
  for (const s of live.strikes ?? []) drawStrike(b, live, s)
  for (const e of live.enemies) if (e.state === 'windup') drawWindup(b, live, e)
  for (const pr of live.projs) {
    const [nx, ny] = [pr.vx / (Math.hypot(pr.vx, pr.vy) || 1), pr.vy / (Math.hypot(pr.vx, pr.vy) || 1)]
    switch (pr.kind) {
      case 'arrow': line(b, pr.x - nx * 4, pr.y - ny * 4, pr.x, pr.y, P.y!); break
      case 'spear': line(b, pr.x - nx * 8, pr.y - ny * 8, pr.x, pr.y, P.s!); put(b, pr.x, pr.y, P.w!); break
      case 'bolt': disc(b, pr.x, pr.y, 1.5, P.c!); fput(b, pr.x, pr.y, P.w!); circle(b, pr.x, pr.y, 3, P.u!, 0.5); line(b, pr.x - nx * 5, pr.y - ny * 5, pr.x, pr.y, P.c!, 0.5); break
      case 'shield': disc(b, pr.x, pr.y, 3, P.s!); put(b, pr.x, pr.y, P.w!); break
      // Foes' shots: a dark rim, a hot core, so they stand out from the floor and from each other.
      case 'spit': disc(b, pr.x, pr.y, 2.5, P.k!, 0.6); ball(b, pr.x, pr.y, 2, P.G!); fput(b, pr.x - 0.5, pr.y - 0.5, P.y!); break
      case 'orb': {
        const [rim, core] = pr.tone === 1 ? [P.u!, P.c!] : [P.r!, P.y!]
        disc(b, pr.x, pr.y, 2.5, P.k!, 0.6)
        ball(b, pr.x, pr.y, 2, rim)
        fput(b, pr.x, pr.y, core)
        fput(b, pr.x - 0.5, pr.y - 0.5, P.w!)
        break
      }
      case 'shot':
        line(b, pr.x - nx * 6, pr.y - ny * 6, pr.x, pr.y, P.r!, 0.7)
        line(b, pr.x - nx * 3, pr.y - ny * 3, pr.x, pr.y, P.w!)
        disc(b, pr.x, pr.y, 1, P.q!)
        break
    }
  }

  // Over everything: swings, rings, sparks, numbers.
  for (const fx of live.fx) {
    const k = fx.ttl / fx.max
    if (fx.kind === 'slash' && fx.a !== undefined && fx.r) {
      for (let t = -1.1; t <= 1.1; t += 0.08 / S) {
        const a = fx.a + t
        const edge = 1 - Math.abs(t) / 1.1
        for (let rr = fx.r - 3; rr <= fx.r; rr += 1 / S) fput(b, fx.x + Math.cos(a) * rr, fx.y + Math.sin(a) * rr, rr > fx.r - 0.6 ? P.w! : fx.color, k * (0.35 + 0.65 * edge) * (0.4 + 0.6 * (rr - fx.r + 3) / 3))
      }
    } else if (fx.kind === 'ring' && fx.r) {
      circle(b, fx.x, fx.y, fx.r * (1.1 - k * 0.3), fx.color, k)
      circle(b, fx.x, fx.y, fx.r * (1 - k * 0.3), fx.color, k * 0.6)
    } else if (fx.kind === 'line' && fx.x2 !== undefined && fx.y2 !== undefined) {
      line(b, fx.x, fx.y, fx.x2, fx.y2, fx.color, k)
    } else if (fx.kind === 'spark') {
      if (S > 1) { fput(b, fx.x, fx.y, P.w!, k); fput(b, fx.x + 0.5, fx.y, fx.color, k); fput(b, fx.x, fx.y + 0.5, fx.color, k * 0.7) } else put(b, fx.x, fx.y, fx.color, k)
    } else if (fx.kind === 'gib') {
      const size = fx.r ?? 0.5
      rect(b, fx.x, fx.y - (fx.z ?? 0), size, size, fx.color, Math.min(1, k * 2))
    } else if (fx.kind === 'beam' && fx.x2 !== undefined && fx.y2 !== undefined) {
      const w = fx.w ?? 2
      fillBand(b, fx.x, fx.y, fx.x2, fx.y2, w * (0.6 + 0.4 * k), fx.color, 0.75 * k)
      fillBand(b, fx.x, fx.y, fx.x2, fx.y2, w * 0.35 * k, P.w!, 0.9 * k)
    } else if (fx.kind === 'num' && fx.text && hasWorldText) {
      const old = scale
      scale = worldScale() * (fx.big ? 2 : 1)
      // Big numbers pop: larger for the first instants.
      text(b, fx.text, fx.x - textWidth(fx.text) / 2, fx.y, k > 0.85 && fx.big ? P.w! : fx.color)
      scale = old
    }
  }
  for (const fx of live.fx) if (fx.kind === 'flash') rect(b, -b.ox, -b.oy, FW, FH, fx.color, 0.45 * (fx.ttl / fx.max))

  b.ox = 0
  b.oy = -top
  // Hurt: the frame's edges bleed red for a moment.
  if (live.player.flash > 0) {
    const a = Math.min(1, live.player.flash / 0.28) * 0.45
    for (let i = 0; i < 6; i++) {
      const k = a * (1 - i / 6)
      rect(b, i, 0, 1, VH, P.r!, k)
      rect(b, VW - 1 - i, 0, 1, VH, P.r!, k)
      rect(b, 0, top + i, VW, 1, P.r!, k)
      rect(b, 0, VH - 1 - i, VW, 1, P.r!, k)
    }
  }
  // Foes out of sight: a mark on the edge, where they are.
  if (VW < FW || VH < FH) {
    for (const e of live.enemies) {
      const x = e.x - camX
      const y = e.y - 4 - camY
      if (x >= 0 && x < VW && y >= (hud ? 10 : 0) && y < VH) continue
      const mx = Math.max(1, Math.min(VW - 3, Math.round(x)))
      const my = Math.max(hud ? 11 : 1, Math.min(VH - 3, Math.round(y)))
      rect(b, mx, my, 2, 2, e.type === 'boss' ? P.y! : e.kind === 'error' ? P.a! : P.r!)
    }
  }
  if (hud) drawHud(b, live, view)
  else if (live.isDead || view.isOffer || view.isPaused) rect(b, 0, 0, VW, VH, P.k!, 0.55)
  return frame
}

// ---------- telegraphs ----------

/** A band between two points, `w` wide on each side, filled at one alpha. */
function fillBand(b: Buf, x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a: number) {
  if (w <= 0 || a <= 0) return
  const dx = x1 - x0
  const dy = y1 - y0
  const L2 = dx * dx + dy * dy || 1
  const X0 = Math.max(0, Math.floor((Math.min(x0, x1) - w + b.ox) * S))
  const X1 = Math.min(RW - 1, Math.ceil((Math.max(x0, x1) + w + b.ox) * S))
  const Y0 = Math.max(0, Math.floor((Math.min(y0, y1) - w + b.oy) * S))
  const Y1 = Math.min(RH - 1, Math.ceil((Math.max(y0, y1) + w + b.oy) * S))
  for (let py = Y0; py <= Y1; py++) {
    const wy = (py + 0.5) / S - b.oy
    for (let px = X0; px <= X1; px++) {
      const wx = (px + 0.5) / S - b.ox
      const u = Math.max(0, Math.min(1, ((wx - x0) * dx + (wy - y0) * dy) / L2))
      if (Math.hypot(wx - x0 - dx * u, wy - y0 - dy * u) <= w) dot(b, px, py, c, a)
    }
  }
}

/** How deep inside a strike a point is: 0 at its heart, its radius at its rim, Infinity outside. */
function strikeDepth(s: Strike, wx: number, wy: number): number {
  if (s.shape === 'band') {
    const dx = s.x2 - s.x
    const dy = s.y2 - s.y
    const L2 = dx * dx + dy * dy || 1
    const u = ((wx - s.x) * dx + (wy - s.y) * dy) / L2
    if (u < 0 || u > 1) return Infinity
    return Math.hypot(wx - s.x - dx * u, wy - s.y - dy * u)
  }
  const d = Math.hypot(wx - s.x, wy - s.y)
  if (s.shape === 'cone' && d > 2) {
    const a = Math.atan2(wy - s.y, wx - s.x) - s.a
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > s.half) return Infinity
  }
  return d
}

/**
 * A blow about to land: its whole area faint, filling from the heart outward as the moment
 * nears, its rim bright, blinking white at the very end. Burning floor flickers; mines blink.
 */
function drawStrike(b: Buf, live: Live, s: Strike) {
  if (s.mine > 0) {
    disc(b, s.x, s.y, 1.5, P.g!)
    if (Math.floor(live.t * (s.mine < 6.4 ? 6 : 2)) % 2 === 0) fput(b, s.x, s.y - 0.5, P.r!)
    if (s.mine < 6.4) circle(b, s.x, s.y, s.r - 2, P.r!, 0.18)
    return
  }
  if (s.zone > 0) {
    disc(b, s.x, s.y, s.r, P.a!, 0.14)
    const n = Math.round(s.r * s.r * 0.5)
    const f = Math.floor(live.t * 14)
    for (let i = 0; i < n; i++) {
      const a = tileNoise(i, f, 3) * Math.PI * 2
      const r = Math.sqrt(tileNoise(i, f, 7)) * s.r
      const h = tileNoise(i, f, 11)
      fput(b, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r * 0.8 - h, h < 0.3 ? P.y! : h < 0.7 ? P.a! : P.r!, Math.min(1, s.zone))
    }
    return
  }
  const prog = Math.max(0, Math.min(1, 1 - s.t / Math.max(0.01, s.max)))
  const blink = prog > 0.78 && Math.floor(live.t * 16) % 2 === 0
  const rim = blink ? P.w! : s.color
  if (s.isLaser) {
    // A thin sight line that thickens to the shot.
    line(b, s.x, s.y, s.x2, s.y2, rim, 0.35 + 0.6 * prog)
    if (prog > 0.55) {
      const [nx, ny] = norm2(s.x2 - s.x, s.y2 - s.y)
      const w = s.r * (prog - 0.55) / 0.45
      line(b, s.x - ny * w, s.y + nx * w, s.x2 - ny * w, s.y2 + nx * w, rim, 0.6)
      line(b, s.x + ny * w, s.y - nx * w, s.x2 + ny * w, s.y2 - nx * w, rim, 0.6)
    }
    return
  }
  const isPath = s.dmg <= 0 && s.after !== 'summon'
  // The fill, in one pass: faint everywhere, stronger inside the growing heart.
  const R = s.r
  const inner = R * prog
  const ext = s.shape === 'band' ? [Math.min(s.x, s.x2) - R, Math.min(s.y, s.y2) - R, Math.max(s.x, s.x2) + R, Math.max(s.y, s.y2) + R] : [s.x - R, s.y - R, s.x + R, s.y + R]
  const X0 = Math.max(0, Math.floor((ext[0]! + b.ox) * S))
  const X1 = Math.min(RW - 1, Math.ceil((ext[2]! + b.ox) * S))
  const Y0 = Math.max(0, Math.floor((ext[1]! + b.oy) * S))
  const Y1 = Math.min(RH - 1, Math.ceil((ext[3]! + b.oy) * S))
  const lo = isPath ? 0.1 : 0.13
  const hi = isPath ? 0.1 : 0.3
  for (let py = Y0; py <= Y1; py++) {
    const wy = (py + 0.5) / S - b.oy
    for (let px = X0; px <= X1; px++) {
      const d = strikeDepth(s, (px + 0.5) / S - b.ox, wy)
      if (d > R) continue
      dot(b, px, py, s.color, d <= inner ? hi : lo)
    }
  }
  // The rim.
  if (s.shape === 'circle') {
    circle(b, s.x, s.y, R, rim, 0.9)
    if (s.after === 'summon') for (let i = 0; i < 3; i++) {
      const a = live.t * 5 + (i * Math.PI * 2) / 3
      fput(b, s.x + Math.cos(a) * R * 0.6, s.y + Math.sin(a) * R * 0.6, P.w!)
    }
  } else if (s.shape === 'cone') {
    for (const side of [-1, 1]) line(b, s.x, s.y, s.x + Math.cos(s.a + side * s.half) * R, s.y + Math.sin(s.a + side * s.half) * R, rim, 0.85)
    for (let t = -s.half; t <= s.half; t += 0.6 / (R * S)) fput(b, s.x + Math.cos(s.a + t) * R, s.y + Math.sin(s.a + t) * R, rim, 0.85)
  } else {
    const [nx, ny] = norm2(s.x2 - s.x, s.y2 - s.y)
    line(b, s.x - ny * R, s.y + nx * R, s.x2 - ny * R, s.y2 + nx * R, rim, isPath ? 0.55 : 0.85)
    line(b, s.x + ny * R, s.y - nx * R, s.x2 + ny * R, s.y2 - nx * R, rim, isPath ? 0.55 : 0.85)
    if (isPath) {
      // A charge's path: chevrons running along it.
      const L = Math.hypot(s.x2 - s.x, s.y2 - s.y)
      for (let d = ((live.t * 40) % 8) + 4; d < L * Math.min(1, prog * 1.6); d += 8) {
        const cx = s.x + nx * d
        const cy = s.y + ny * d
        line(b, cx - nx * 2 - ny * 2.5, cy - ny * 2 + nx * 2.5, cx, cy, rim, 0.8)
        line(b, cx - nx * 2 + ny * 2.5, cy - ny * 2 - nx * 2.5, cx, cy, rim, 0.8)
      }
    }
  }
}

/** The lines a foe shows while it winds up: where it will lunge, charge or shoot. */
function drawWindup(b: Buf, live: Live, e: Enemy) {
  const prog = windupOf(e)
  const [ax, ay] = norm2(e.aimX - e.x, e.aimY - e.y)
  const a = 0.3 + 0.6 * prog
  const red = P.r!
  const ray = (dx: number, dy: number, len: number, c: RGB, alpha: number, y = e.y - 3) => line(b, e.x + dx * 3, y + dy * 3, e.x + dx * len, y + dy * len, c, alpha)
  switch (e.type) {
    case 'rat':
    case 'larva':
    case 'bug':
    case 'micro': {
      const len = e.type === 'rat' ? 18 : 13
      ray(ax, ay, len, red, a, e.y - 1)
      fput(b, e.x + ax * len, e.y - 1 + ay * len, P.w!, a)
      break
    }
    case 'skeleton': {
      const L = rayToWall(live, e.x, e.y, ax, ay, 90)
      for (const side of [-1, 1]) line(b, e.x - ay * 3.5 * side, e.y + ax * 3.5 * side, e.x + ax * L - ay * 3.5 * side, e.y + ay * L + ax * 3.5 * side, red, 0.25 + 0.5 * prog)
      line(b, e.x, e.y, e.x + ax * L * prog, e.y + ay * L * prog, prog > 0.8 && Math.floor(live.t * 16) % 2 ? P.w! : red, 0.8)
      break
    }
    case 'slug':
      for (let d = 4; d < 24; d += 3) fput(b, e.x + ax * d, e.y - 3 + ay * d, red, a)
      break
    case 'linter':
      for (let i = -2; i <= 2; i++) {
        const c = Math.cos(i * 0.26)
        const sn = Math.sin(i * 0.26)
        ray(ax * c - ay * sn, ax * sn + ay * c, 18, P.u!, a)
      }
      break
    case 'sniper': {
      const isLocked = e.t <= 0.3
      const L = rayToWall(live, e.x, e.y - 3, ax, ay, 220)
      const c = isLocked && Math.floor(live.t * 20) % 2 ? P.w! : red
      line(b, e.x, e.y - 3, e.x + ax * L, e.y - 3 + ay * L, c, isLocked ? 0.95 : 0.35 + 0.3 * prog)
      if (isLocked) circle(b, e.x + ax * Math.min(L, Math.hypot(e.aimX - e.x, e.aimY - e.y)), e.y - 3 + ay * Math.min(L, Math.hypot(e.aimX - e.x, e.aimY - e.y)), 2.5, c, 0.9)
      break
    }
    case 'turret': {
      const off = e.pattern % 2 === 0 ? 0 : Math.PI / 4
      for (let i = 0; i < 4; i++) ray(Math.cos(off + (i * Math.PI) / 2), Math.sin(off + (i * Math.PI) / 2), 12, red, a)
      break
    }
    case 'boss': {
      const isP2 = (e.phase ?? 1) >= 2
      if (e.move === 'fan') {
        const n = isP2 ? 7 : 5
        for (let i = 0; i < n; i++) {
          const t = (i - (n - 1) / 2) * 0.2
          const c = Math.cos(t)
          const sn = Math.sin(t)
          ray(ax * c - ay * sn, ax * sn + ay * c, 34, P.u!, a, e.y - e.r)
        }
      } else if (e.move === 'burst' || e.move === 'spiral') {
        circle(b, e.x, e.y - e.r, e.r + 3 + 14 * (1 - prog), e.move === 'burst' ? P.y! : [170, 90, 200], a)
      }
      break
    }
    default:
      break
  }
}

function drawHud(b: Buf, live: Live, view: View) {
  const p = live.player
  const s = live.stats
  const isNarrow = VW < 120
  rect(b, 0, 0, VW, 10, P.k!)
  blit(b, ICONS.heart!, 5, 7)
  const w = isNarrow ? 24 : 40
  rect(b, 9, 3, w + 2, 5, P.p!)
  rect(b, 10, 4, Math.max(0, Math.round((w * p.hp) / s.maxHp)), 3, p.hp / s.maxHp > 0.3 ? P.r! : P.y!)
  const ty = 2
  let x = 13 + w
  text(b, `${Math.max(0, Math.ceil(p.hp))}`, x, ty, P.w!)
  x += 14
  // Cast crystals, then the dash.
  for (let i = 0; i < s.castAmmo; i++) {
    rect(b, x, 3, 2, 4, i < live.ammo ? P.c! : P.g!)
    x += 4
  }
  rect(b, x + 1, 4, 5, 2, p.dashCd <= 0 ? P.u! : P.g!)
  const shards = `${view.eclats}`
  const sx = VW - textWidth(shards) - (isNarrow ? 3 : textWidth(view.roomLabel) + 8)
  blit(b, ICONS.shard!, sx - 4, 7)
  text(b, shards, sx, ty, P.c!)
  if (!isNarrow) text(b, view.roomLabel, VW - textWidth(view.roomLabel) - 2, ty, P.s!)
  if (p.defiance > 0) for (let i = 0; i < p.defiance; i++) put(b, 4 + i * 2, 9, P.w!)

  const boss = live.enemies.find(e => e.type === 'boss')
  if (boss && boss.state !== 'spawn') {
    const bw = VW - 16
    rect(b, 8, VH - 4, bw, 3, P.k!)
    rect(b, 8, VH - 4, Math.round((bw * boss.hp) / boss.maxHp), 3, boss.kind === 'nemesis' ? [200, 60, 160] : P.r!)
    const name = boss.name.split(',')[0] ?? boss.name
    text(b, name, (VW - textWidth(name)) / 2, VH - 11, P.w!)
  }

  const mid = Math.round((VH + 10) / 2)
  const isOverlay = live.isDead || view.isOffer || view.isPaused
  if (live.banner && !isOverlay) banner(b, live.banner.text, mid, P.y!, 0.6 * Math.min(1, live.banner.ttl * 3))
  if (live.isDead) {
    rect(b, 0, 0, VW, VH, P.k!, 0.6)
    centered(b, tr('TU ES TOMBE', 'YOU FELL'), mid - 3, P.r!)
  } else if (view.isOffer) {
    rect(b, 0, 10, VW, VH - 10, P.k!, 0.55)
    centered(b, tr('BIENFAIT', 'BOON'), mid - 8, P.y!)
    centered(b, '1  2  3', mid, P.y!)
  } else if (view.isPaused) {
    rect(b, 0, 10, VW, VH - 10, P.k!, 0.55)
    centered(b, 'PAUSE', mid - 8, P.w!)
    banner(b, view.hint, mid + 4, P.s!, 0)
  }
}

/** The idle look of a enemy type, for tests and previews. */
export const enemyHeight = (type: Enemy['type']) => (type === 'boss' ? ENEMY.boss.r * 2 : enemySprite(type).h)

/**
 * The frame shrunk into terminal cells, two pixels a cell: each cell an upper
 * half block whose ink is the top pixel and whose paper is the bottom one.
 * Packed as a Raster wants it: little-endian u32 triplets, base64.
 */
export function toCells(frame: Uint8Array, columns: number, rows: number): Uint8Array {
  const out = new Uint32Array(columns * rows * 3)
  const isCrop = columns <= FW && rows * 2 <= FH
  const sx = isCrop ? 1 : FW / columns
  const sy = isCrop ? 1 : FH / (rows * 2)
  const sample = (px: number, py: number) => {
    if (isCrop) {
      const i = (py * FW + px) * 4
      return (frame[i]! << 16) | (frame[i + 1]! << 8) | frame[i + 2]!
    }
    const x0 = Math.floor(px * sx)
    const y0 = Math.floor(py * sy)
    const x1 = Math.max(x0 + 1, Math.floor((px + 1) * sx))
    const y1 = Math.max(y0 + 1, Math.floor((py + 1) * sy))
    let r = 0
    let g = 0
    let bl = 0
    let n = 0
    for (let y = y0; y < y1 && y < FH; y++) {
      for (let x = x0; x < x1 && x < FW; x++) {
        const i = (y * FW + x) * 4
        r += frame[i]!
        g += frame[i + 1]!
        bl += frame[i + 2]!
        n++
      }
    }
    n = Math.max(1, n)
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(bl / n)
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const k = (row * columns + col) * 3
      out[k] = 0x2580
      out[k + 1] = sample(col, row * 2)
      out[k + 2] = sample(col, row * 2 + 1)
    }
  }
  return new Uint8Array(out.buffer)
}

const QUADS = [0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588]

/**
 * The frame in quadrant blocks: a cell is 2 pixels wide and 4 tall, its four
 * quarters each a pair of rows (a quarter is twice as tall as wide on screen),
 * in the two colours that best split them. Packed as a Raster wants it.
 */
export function toQuads(frame: Uint8Array, columns: number, rows: number): Uint8Array {
  const out = new Uint32Array(columns * rows * 3)
  const quarter = new Array<[number, number, number]>(4)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      for (let q = 0; q < 4; q++) {
        const x = col * 2 + (q & 1)
        const y = row * 4 + (q >> 1) * 2
        let r = 0
        let g = 0
        let bl = 0
        for (let dy = 0; dy < 2; dy++) {
          const yy = Math.min(FH - 1, y + dy)
          const i = (yy * FW + Math.min(FW - 1, x)) * 4
          r += frame[i]!
          g += frame[i + 1]!
          bl += frame[i + 2]!
        }
        quarter[q] = [r / 2, g / 2, bl / 2]
      }
      // The two quarters furthest apart seed the two colours.
      let a = 0
      let z = 0
      let far = -1
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        const d = dist2(quarter[i]!, quarter[j]!)
        if (d > far) { far = d; a = i; z = j }
      }
      let mask = 0
      const ink: [number, number, number, number] = [0, 0, 0, 0]
      const paper: [number, number, number, number] = [0, 0, 0, 0]
      for (let q = 0; q < 4; q++) {
        const c = quarter[q]!
        const isInk = far > 0 && dist2(c, quarter[z]!) < dist2(c, quarter[a]!)
        const acc = isInk ? ink : paper
        if (isInk) mask |= 1 << q
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 1
      }
      const k = (row * columns + col) * 3
      out[k] = QUADS[mask]!
      out[k + 1] = pack(ink)
      out[k + 2] = pack(paper)
    }
  }
  return new Uint8Array(out.buffer)
}

function dist2(a: readonly number[], b: readonly number[]) {
  return (a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2
}

function pack(acc: number[]) {
  const n = Math.max(1, acc[3]!)
  return (Math.round(acc[0]! / n) << 16) | (Math.round(acc[1]! / n) << 8) | Math.round(acc[2]! / n)
}

/** The Hall's picture: flagstones, two torches, the champion large, the title. */
function drawSplash(b: Buf, view: View) {
  const tone = BIOME_TONES[0]!
  for (let ty = 0; ty < VH; ty += 8) for (let tx = 0; tx < VW; tx += 8) {
    rect(b, tx, ty, 8, 8, tone.floor[(tx / 8 + ty / 8) % 2 === 0 ? 0 : 1])
    put(b, tx, ty, tone.crack)
  }
  rect(b, 0, 0, VW, 10, tone.wall)
  rect(b, 0, 10, VW, 1, tone.wallTop)
  for (const x of [8, VW - 6]) {
    rect(b, x - 1, 12, 2, 6, P.b!)
    disc(b, x, 10, 2, P.a!)
    put(b, x, 9, P.y!)
    disc(b, x, 12, 9, P.a!, 0.12)
  }
  const hero = HERO[0]!
  const big = VH >= 48
  const s = big ? 3 : 1
  const x0 = big ? Math.round(VW / 2 - (hero.w * s) / 2) : Math.round(VW / 2 + 18)
  const y0 = VH - hero.h * s - (big ? 4 : 2)
  rect(b, x0 + 1, VH - (big ? 5 : 3), hero.w * s - 2, 1, P.k!, 0.4)
  for (let y = 0; y < hero.h; y++) for (let x = 0; x < hero.w; x++) {
    const ch = hero.rows[y]?.[x] ?? '.'
    const c = P[ch]
    if (ch !== '.' && c) rect(b, x0 + x * s, y0 + y * s, s, s, c)
  }
  const old = scale
  scale = big ? 2 : 1
  centered(b, 'CLAUWLER', big ? 14 : Math.round(VH / 2) - 1, P.y!)
  scale = old
  if (view.hint && big) centered(b, view.hint, 28, P.w!)
}
