import type { ErrorSpawn, RoomKind, SessionEvent, Side, WeaponId } from '../types'
import type { CombatStats } from './data'
import { hash } from './data'
import type { RGB } from './art'

// The frame and the room inside it, in pixels.
export const FW = 160
export const FH = 100
export const ROOM = { x0: 8, y0: 18, x1: 152, y1: 94 }
export const START = { x: 80, y: 86 }
const MID_Y = Math.round((ROOM.y0 + ROOM.y1) / 2)

export function doorAt(side: Side): { x: number; y: number } {
  return side === 'n' ? { x: 80, y: ROOM.y0 } : side === 's' ? { x: 80, y: ROOM.y1 } : side === 'w' ? { x: ROOM.x0, y: MID_Y } : { x: ROOM.x1, y: MID_Y }
}

function entryAt(side: Side | null | undefined): { x: number; y: number } {
  if (!side) return START
  return side === 'n' ? { x: 80, y: ROOM.y0 + 18 } : side === 's' ? { x: 80, y: ROOM.y1 - 10 } : side === 'w' ? { x: ROOM.x0 + 18, y: MID_Y + 4 } : { x: ROOM.x1 - 18, y: MID_Y + 4 }
}

export type EnemyType = 'rat' | 'goblin' | 'slug' | 'skeleton' | 'larva' | 'boss'
export type EnemyKind = 'biome' | 'error' | 'nemesis' | 'boss' | 'minion'
type EnemyState = 'spawn' | 'chase' | 'windup' | 'act' | 'recover' | 'stun'

export type Enemy = {
  id: number
  type: EnemyType
  kind: EnemyKind
  name: string
  sig?: string
  x: number
  y: number
  r: number
  hp: number
  maxHp: number
  speed: number
  dmg: number
  level: number
  state: EnemyState
  t: number
  aimX: number
  aimY: number
  vx: number
  vy: number
  flash: number
  pattern: number
  hasHit: boolean
  detour: number
  detourX: number
  detourY: number
}

export type Proj = {
  id: number
  kind: 'arrow' | 'bolt' | 'spit' | 'spear' | 'shield' | 'orb'
  team: 'p' | 'e'
  x: number
  y: number
  vx: number
  vy: number
  r: number
  dmg: number
  ttl: number
  pierce: boolean
  hits: number[]
  isReturning: boolean
  bounces: number
  isLodging: boolean
  heal: number
}

export type Fx = {
  kind: 'slash' | 'ring' | 'spark' | 'num' | 'ghost' | 'tele' | 'line' | 'spike'
  x: number
  y: number
  ttl: number
  max: number
  color: RGB
  a?: number
  r?: number
  x2?: number
  y2?: number
  text?: string
  dmg?: number
  hits?: number[]
}

export type PickupKind = 'chest' | 'portal' | 'bolt' | 'heart' | 'shard' | 'altar' | 'shopHeart' | 'shopBoon' | 'stairs'
export type Pickup = { x: number; y: number; kind: PickupKind; t: number; price?: number }
export type Door = { side: Side; to: number; kind: RoomKind; x: number; y: number }
export type Ally = { x: number; y: number; t: number; dmg: number }
export type Rect = { x: number; y: number; w: number; h: number }

export type Signal =
  | { k: 'cleared' }
  | { k: 'door'; to: number; side: Side }
  | { k: 'descend' }
  | { k: 'buy'; item: string; price: number }
  | { k: 'died'; killer: string }
  | { k: 'revived' }
  | { k: 'kill'; name: string; kind: EnemyKind; level: number; sig?: string }
  | { k: 'log'; text: string }
  | { k: 'chest'; n: number }
  | { k: 'portal' }

/** Move with `mx`/`my`; aim with `ax`/`ay` (the twin stick), attacking that way. */
export type Input = { mx: number; my: number; ax?: number; ay?: number; attack: boolean; special: boolean; cast: boolean; dash: boolean }

export type BossSpec = { name: string; rank: number; isNemesis: boolean; sig?: string }

export type RoomSpec = {
  seed: number
  biome: number
  chamber: number
  depth: number
  isBoss: boolean
  boss?: BossSpec
  errorSpawns: ErrorSpawn[]
  chests: number
  portals: number
  familiars: number
  weapon: WeaponId
  stats: CombatStats
  hp: number
  defiance: number
  scars: string[]
  fortune: number
  title: string
  isFight?: boolean
  entry?: Side | null
  wallet?: number
  items?: { kind: string; price?: number }[]
  doors?: { side: Side; to: number; kind: RoomKind }[]
}

export type Live = {
  t: number
  rng: number
  nextId: number
  biome: number
  depth: number
  isBoss: boolean
  weapon: WeaponId
  stats: CombatStats
  scars: string[]
  fortune: number
  wallet: number
  aimX: number
  aimY: number
  player: {
    x: number
    y: number
    hp: number
    faceX: number
    faceY: number
    iframes: number
    flash: number
    dashT: number
    dashCd: number
    dashX: number
    dashY: number
    atkT: number
    atkCd: number
    combo: number
    comboT: number
    specCd: number
    echoT: number
    walk: number
    isMoving: boolean
    defiance: number
  }
  ammo: number
  buffer: { attack: number; special: number; cast: number; dash: number }
  enemies: Enemy[]
  projs: Proj[]
  fx: Fx[]
  pickups: Pickup[]
  allies: Ally[]
  pillars: Rect[]
  doors: Door[]
  waves: EnemyType[][]
  errorQueue: ErrorSpawn[]
  boss?: BossSpec
  isCleared: boolean
  isDead: boolean
  shake: number
  hitstop: number
  banner: { text: string; ttl: number } | null
  signals: Signal[]
}

// ---------- random ----------

function rnd(live: Live): number {
  let t = (live.rng = (live.rng + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rint = (live: Live, n: number) => Math.floor(rnd(live) * n)
const pick = <T>(live: Live, list: readonly T[]): T => list[rint(live, list.length)] as T

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)
const norm = (x: number, y: number): [number, number] => {
  const d = Math.hypot(x, y)
  return d < 1e-6 ? [0, 0] : [x / d, y / d]
}

// ---------- enemies ----------

type EnemyDef = { hp: number; r: number; speed: number; dmg: number; range: number; windup: number; act: number; recover: number; level: number }

export const ENEMY: Record<EnemyType, EnemyDef> = {
  rat: { hp: 16, r: 4, speed: 46, dmg: 5, range: 9, windup: 0.35, act: 0.15, recover: 0.5, level: 1 },
  goblin: { hp: 26, r: 4, speed: 34, dmg: 8, range: 11, windup: 0.5, act: 0.2, recover: 0.6, level: 2 },
  slug: { hp: 20, r: 4, speed: 20, dmg: 6, range: 60, windup: 0.6, act: 0.1, recover: 1.2, level: 2 },
  skeleton: { hp: 32, r: 4, speed: 30, dmg: 10, range: 55, windup: 0.7, act: 0.4, recover: 0.7, level: 3 },
  larva: { hp: 8, r: 3, speed: 55, dmg: 3, range: 7, windup: 0.25, act: 0.1, recover: 0.4, level: 1 },
  boss: { hp: 280, r: 9, speed: 26, dmg: 12, range: 0, windup: 0.8, act: 0.6, recover: 1.2, level: 10 },
}

const NAMES: Record<EnemyType, string> = {
  rat: 'Rat de node_modules',
  goblin: 'Gobelin TODO',
  slug: 'Warning Rampant',
  skeleton: 'Squelette Legacy',
  larva: 'Larve',
  boss: 'Gardien',
}

const BIOME_POOL: EnemyType[][] = [
  ['rat', 'rat', 'goblin', 'slug'],
  ['rat', 'goblin', 'slug', 'skeleton'],
  ['goblin', 'slug', 'skeleton', 'skeleton'],
]

function makeEnemy(live: Live, type: EnemyType, kind: EnemyKind, x: number, y: number, name?: string, sig?: string): Enemy {
  const def = ENEMY[type]
  const scaleHp = 1 + live.depth * 0.1
  const scaleDmg = 1 + live.depth * 0.06
  const elite = kind === 'error' ? 1.8 : 1
  const hp = Math.round(def.hp * scaleHp * elite)
  return {
    id: live.nextId++, type, kind, name: name ?? NAMES[type], sig, x, y, r: def.r, hp, maxHp: hp,
    speed: def.speed, dmg: Math.round(def.dmg * scaleDmg * (kind === 'error' ? 1.25 : 1)), level: def.level + Math.floor(live.depth / 2) + (kind === 'error' ? 2 : 0),
    state: 'spawn', t: 0.7, aimX: x, aimY: y, vx: 0, vy: 0, flash: 0, pattern: 0, hasHit: false, detour: 0, detourX: 0, detourY: 0,
  }
}

function freeSpot(live: Live, minFromPlayer: number): { x: number; y: number } {
  for (let i = 0; i < 80; i++) {
    const x = ROOM.x0 + 8 + rnd(live) * (ROOM.x1 - ROOM.x0 - 16)
    const y = ROOM.y0 + 6 + rnd(live) * (ROOM.y1 - ROOM.y0 - 12)
    if (dist(x, y, live.player.x, live.player.y) < minFromPlayer) continue
    if (blocked(live, x, y, 5)) continue
    return { x, y }
  }
  return { x: 80, y: 40 }
}

/** The free spot nearest a point: drops never land inside a pillar. */
function nearFree(live: Live, x: number, y: number): { x: number; y: number } {
  for (let r = 0; r < 60; r += 3) {
    for (let a = 0; a < 16; a++) {
      const px = Math.round(x + Math.cos((a / 16) * Math.PI * 2) * r)
      const py = Math.round(y + Math.sin((a / 16) * Math.PI * 2) * r)
      if (!blocked(live, px, py, 7)) return { x: px, y: py }
      if (r === 0) break
    }
  }
  return { x, y }
}

function errorType(sig: string): EnemyType {
  return (['goblin', 'slug', 'skeleton'] as const)[hash(sig) % 3] ?? 'goblin'
}

export function spawnError(live: Live, spawn: ErrorSpawn, isAnnounced: boolean) {
  const at = freeSpot(live, 40)
  live.enemies.push(makeEnemy(live, errorType(spawn.sig), 'error', at.x, at.y, spawn.name, spawn.sig))
  if (isAnnounced) {
    live.banner = { text: `${spawn.sig} surgit !`, ttl: 1.6 }
    live.signals.push({ k: 'log', text: `⚡ ${spawn.name} surgit de la session !` })
  }
}

function spawnWave(live: Live) {
  const wave = live.waves.shift()
  if (!wave) return
  for (const type of wave) {
    const at = freeSpot(live, 45)
    live.enemies.push(makeEnemy(live, type, 'biome', at.x, at.y))
  }
  for (const spawn of live.errorQueue.splice(0, 2)) spawnError(live, spawn, false)
}

// ---------- room ----------

export function createRoom(spec: RoomSpec): Live {
  const live: Live = {
    t: 0, rng: spec.seed | 0, nextId: 1, biome: spec.biome, depth: spec.depth, isBoss: spec.isBoss,
    weapon: spec.weapon, stats: spec.stats, scars: spec.scars, fortune: spec.fortune, wallet: spec.wallet ?? 0, aimX: 0, aimY: 0,
    player: {
      x: entryAt(spec.entry).x, y: entryAt(spec.entry).y, hp: Math.min(spec.hp, spec.stats.maxHp), faceX: 0, faceY: -1, iframes: 0.8, flash: 0,
      dashT: 0, dashCd: 0, dashX: 0, dashY: 0, atkT: 0, atkCd: 0, combo: 0, comboT: 0, specCd: 0, echoT: 0,
      walk: 0, isMoving: false, defiance: spec.defiance,
    },
    ammo: spec.stats.castAmmo,
    buffer: { attack: 0, special: 0, cast: 0, dash: 0 },
    enemies: [], projs: [], fx: [], pickups: [], allies: [], pillars: [], doors: [], waves: [],
    errorQueue: [...spec.errorSpawns], boss: spec.boss, isCleared: false, isDead: false,
    shake: 0, hitstop: 0, banner: { text: spec.title, ttl: 1.8 }, signals: [],
  }
  // Pillars, away from the entrance and the doors.
  const count = spec.isFight === false ? 0 : spec.isBoss ? 2 : 2 + rint(live, 3)
  for (let i = 0; i < count * 6 && live.pillars.length < count; i++) {
    const w = 8 + rint(live, 3) * 4
    const h = 6 + rint(live, 2) * 4
    const x = ROOM.x0 + 14 + rnd(live) * (ROOM.x1 - ROOM.x0 - 28 - w)
    const y = ROOM.y0 + 12 + rnd(live) * (ROOM.y1 - ROOM.y0 - 24 - h)
    const rect = { x: Math.round(x), y: Math.round(y), w, h }
    const overlaps = live.pillars.some(o => rect.x < o.x + o.w + 10 && rect.x + rect.w + 10 > o.x && rect.y < o.y + o.h + 10 && rect.y + rect.h + 10 > o.y)
    const nearDoor = (['n', 's', 'e', 'w'] as const).some(side => {
      const d = doorAt(side)
      return d.x > rect.x - 22 && d.x < rect.x + rect.w + 22 && d.y > rect.y - 22 && d.y < rect.y + rect.h + 22
    })
    const nearMe = live.player.x > rect.x - 14 && live.player.x < rect.x + rect.w + 14 && live.player.y > rect.y - 14 && live.player.y < rect.y + rect.h + 18
    if (!overlaps && !nearDoor && !nearMe) live.pillars.push(rect)
  }
  live.doors = (spec.doors ?? []).map(d => ({ ...d, ...doorAt(d.side) }))
  if (spec.isFight === false) {
    live.isCleared = true
    live.errorQueue = []
  } else if (spec.isBoss && spec.boss) {
    const b = spec.boss
    const def = ENEMY.boss
    const hp = Math.round((def.hp + spec.biome * 160 + b.rank * 50) * (1 + spec.depth * 0.03))
    live.enemies.push({
      ...makeEnemy(live, 'boss', b.isNemesis ? 'nemesis' : 'boss', 80, 42, b.name, b.sig),
      hp, maxHp: hp, dmg: def.dmg + spec.biome * 3 + Math.ceil(b.rank / 2), level: def.level + spec.biome * 4 + b.rank * 2, t: 1.2,
    })
    live.errorQueue = []
  } else {
    const waves = spec.depth < 2 ? 1 : spec.depth < 7 ? 2 : 3
    const pool = BIOME_POOL[Math.min(spec.biome, BIOME_POOL.length - 1)] ?? BIOME_POOL[0]!
    for (let w = 0; w < waves; w++) {
      const n = Math.min(6, 2 + Math.floor(spec.depth / 3) + rint(live, 2))
      const wave: EnemyType[] = []
      for (let i = 0; i < n; i++) wave.push(pick(live, pool))
      live.waves.push(wave)
    }
    spawnWave(live)
  }
  const center = { x: 80, y: Math.round((ROOM.y0 + ROOM.y1) / 2) }
  const placed = spec.items ?? []
  placed.forEach((item, i) => {
    const x = placed.length > 1 ? 60 + i * 40 : center.x
    live.pickups.push({ x, y: center.y, kind: item.kind as PickupKind, t: 0, price: item.price })
  })
  for (let i = 0; i < spec.chests; i++) live.pickups.push({ ...freeSpot(live, 20), kind: 'chest', t: 0 })
  for (let i = 0; i < spec.portals; i++) live.pickups.push({ ...freeSpot(live, 20), kind: 'portal', t: 0 })
  for (let i = 0; i < spec.familiars; i++) addAlly(live)
  return live
}

function addAlly(live: Live) {
  live.allies.push({ x: live.player.x - 8, y: live.player.y - 4, t: 0, dmg: Math.round(6 * live.stats.dmg) })
}

// ---------- session events, live ----------

export function inject(live: Live, ev: SessionEvent) {
  switch (ev.kind) {
    case 'fail':
      if (!live.isCleared) spawnError(live, { sig: ev.sig, name: ev.name }, true)
      break
    case 'test':
      live.pickups.push({ ...freeSpot(live, 16), kind: 'chest', t: 0 })
      live.signals.push({ k: 'log', text: '$ Des tests passent au vert : un coffre apparaît.' })
      break
    case 'agent':
      addAlly(live)
      live.banner = { text: 'Familier invoqué', ttl: 1.2 }
      live.signals.push({ k: 'log', text: 'Un sous-agent est invoqué : un familier combat à tes côtés.' })
      break
    case 'web':
      live.pickups.push({ ...freeSpot(live, 16), kind: 'portal', t: 0 })
      live.signals.push({ k: 'log', text: 'Une recherche ouvre un portail vers un bienfait.' })
      break
    case 'compact':
      live.shake = 0.6
      live.banner = { text: 'Seisme !', ttl: 1.2 }
      for (const e of live.enemies) if (e.state !== 'spawn') damageEnemy(live, e, Math.round(e.maxHp * (e.kind === 'boss' || e.kind === 'nemesis' ? 0.1 : 0.5)), false, 0, 0)
      live.signals.push({ k: 'log', text: '🌋 Le contexte se compacte : la salle tremble et écrase tes ennemis.' })
      break
    case 'read': {
      const s = live.stats
      live.player.hp = Math.min(s.maxHp, live.player.hp + 6)
      live.fx.push({ kind: 'num', x: live.player.x, y: live.player.y - 10, ttl: 0.8, max: 0.8, color: [109, 170, 44], text: '+6' })
      break
    }
    default:
      break
  }
}

// ---------- collision ----------

function blocked(live: Live, x: number, y: number, r: number): boolean {
  if (x - r < ROOM.x0 || x + r > ROOM.x1 || y - r < ROOM.y0 || y + r > ROOM.y1) return true
  return live.pillars.some(p => x + r > p.x && x - r < p.x + p.w && y + r > p.y && y - r < p.y + p.h)
}

function moveBody(live: Live, body: { x: number; y: number }, dx: number, dy: number, r: number): boolean {
  let hit = false
  // A step that would cross a wall shrinks until it touches it.
  for (const f of [1, 0.5, 0.25, 0.125]) {
    if (!blocked(live, body.x + dx * f, body.y, r)) { body.x += dx * f; break }
    hit = true
  }
  for (const f of [1, 0.5, 0.25, 0.125]) {
    if (!blocked(live, body.x, body.y + dy * f, r)) { body.y += dy * f; break }
    hit = true
  }
  return hit
}

// ---------- damage ----------

function scarBonus(live: Live, e: Enemy) {
  return live.scars.includes(e.name.split(',')[0] ?? e.name) ? 1.5 : 1
}

function damageEnemy(live: Live, e: Enemy, amount: number, isCrit: boolean, kx: number, ky: number) {
  if (e.state === 'spawn' || e.hp <= 0) return
  const dmg = Math.max(1, Math.round(amount * scarBonus(live, e)))
  e.hp -= dmg
  e.flash = 0.12
  const knock = e.type === 'boss' ? 0.15 : 1
  if (kx !== 0 || ky !== 0) moveBody(live, e, kx * knock, ky * knock, e.r)
  live.hitstop = Math.max(live.hitstop, isCrit ? 0.07 : 0.035)
  if (isCrit) live.shake = Math.max(live.shake, 0.15)
  live.fx.push({ kind: 'num', x: e.x + (rnd(live) - 0.5) * 6, y: e.y - e.r - 4, ttl: 0.7, max: 0.7, color: isCrit ? [218, 212, 94] : [222, 238, 214], text: isCrit ? `${dmg}!` : `${dmg}` })
  for (let i = 0; i < 3; i++) live.fx.push({ kind: 'spark', x: e.x, y: e.y, ttl: 0.25, max: 0.25, color: [222, 238, 214], a: rnd(live) * Math.PI * 2, r: 20 + rnd(live) * 30 })
  if (e.hp <= 0) killEnemy(live, e)
}

function killEnemy(live: Live, e: Enemy) {
  live.enemies = live.enemies.filter(one => one !== e)
  const s = live.stats
  if (s.lifesteal > 0) live.player.hp = Math.min(s.maxHp, live.player.hp + s.lifesteal)
  for (let i = 0; i < 8; i++) live.fx.push({ kind: 'spark', x: e.x, y: e.y, ttl: 0.4, max: 0.4, color: e.kind === 'biome' || e.kind === 'minion' ? [208, 70, 72] : [210, 125, 44], a: rnd(live) * Math.PI * 2, r: 30 + rnd(live) * 40 })
  if (e.type === 'boss') live.shake = 0.8
  live.signals.push({ k: 'kill', name: e.name, kind: e.kind, level: e.level, sig: e.sig })
}

function hurtPlayer(live: Live, amount: number, from: Enemy | null, killer: string) {
  const p = live.player
  if (p.iframes > 0 || live.isDead) return
  const s = live.stats
  if (rnd(live) < s.dodge) {
    live.fx.push({ kind: 'num', x: p.x, y: p.y - 12, ttl: 0.6, max: 0.6, color: [109, 194, 202], text: 'esquive' })
    p.iframes = 0.3
    return
  }
  p.hp -= amount
  p.iframes = 0.6
  p.flash = 0.2
  live.shake = Math.max(live.shake, 0.25)
  live.hitstop = Math.max(live.hitstop, 0.06)
  live.fx.push({ kind: 'num', x: p.x, y: p.y - 12, ttl: 0.7, max: 0.7, color: [208, 70, 72], text: `-${amount}` })
  if (from && s.thorns > 0) damageEnemy(live, from, s.thorns, false, 0, 0)
  if (p.hp <= 0) {
    if (p.defiance > 0) {
      p.defiance -= 1
      p.hp = Math.ceil(s.maxHp / 2)
      p.iframes = 1.5
      live.banner = { text: 'Defi de la mort', ttl: 1.5 }
      live.signals.push({ k: 'revived' })
    } else {
      live.isDead = true
      live.signals.push({ k: 'died', killer })
    }
  }
}

// ---------- the player's moves ----------

function critRoll(live: Live, extra: number) {
  return rnd(live) < live.stats.crit + extra
}

/** Turns the facing toward the nearest enemy in a cone ahead: aim assist. */
function assistAim(live: Live, range: number, coneIn: number): [number, number] {
  const p = live.player
  const cone = live.aimX !== 0 || live.aimY !== 0 ? Math.min(coneIn, 0.4) : coneIn
  let best: Enemy | null = null
  let bestD = range
  for (const e of live.enemies) {
    if (e.state === 'spawn') continue
    const d = dist(p.x, p.y, e.x, e.y)
    if (d > bestD) continue
    const [nx, ny] = norm(e.x - p.x, e.y - p.y)
    if (nx * p.faceX + ny * p.faceY < Math.cos(cone)) continue
    best = e
    bestD = d
  }
  return best ? norm(best.x - p.x, best.y - p.y) : [p.faceX, p.faceY]
}

function arcHit(live: Live, radius: number, half: number, base: number, crit: number, knock: number, fx: [number, number]) {
  const p = live.player
  const [ax, ay] = fx
  for (const e of [...live.enemies]) {
    const d = dist(p.x, p.y, e.x, e.y)
    if (d > radius + e.r) continue
    const [nx, ny] = norm(e.x - p.x, e.y - p.y)
    if (d > e.r + 2 && nx * ax + ny * ay < Math.cos(half)) continue
    const isCrit = critRoll(live, crit)
    damageEnemy(live, e, base * (isCrit ? 2 : 1), isCrit, nx * knock, ny * knock)
  }
}

function lineHit(live: Live, length: number, width: number, base: number, crit: number, knock: number, dir: [number, number]) {
  const p = live.player
  const [ax, ay] = dir
  for (const e of [...live.enemies]) {
    const rx = e.x - p.x
    const ry = e.y - p.y
    const along = rx * ax + ry * ay
    const across = Math.abs(rx * -ay + ry * ax)
    if (along < -2 || along > length + e.r || across > width + e.r) continue
    const isCrit = critRoll(live, crit)
    damageEnemy(live, e, base * (isCrit ? 2 : 1), isCrit, ax * knock, ay * knock)
  }
}

function ringHit(live: Live, x: number, y: number, radius: number, base: number, knock: number, stun: number) {
  for (const e of [...live.enemies]) {
    const d = dist(x, y, e.x, e.y)
    if (d > radius + e.r) continue
    const [nx, ny] = norm(e.x - x, e.y - y)
    const isCrit = critRoll(live, 0)
    damageEnemy(live, e, base * (isCrit ? 2 : 1), isCrit, nx * knock, ny * knock)
    if (stun > 0 && e.hp > 0 && e.type !== 'boss') { e.state = 'stun'; e.t = stun }
  }
}

function shoot(live: Live, kind: Proj['kind'], dir: [number, number], speed: number, dmg: number, extra: Partial<Proj> = {}) {
  const p = live.player
  live.projs.push({
    id: live.nextId++, kind, team: 'p', x: p.x + dir[0] * 5, y: p.y - 3 + dir[1] * 5, vx: dir[0] * speed, vy: dir[1] * speed,
    r: 2, dmg, ttl: 1.6, pierce: false, hits: [], isReturning: false, bounces: 0, isLodging: false, heal: 0, ...extra,
  })
}

function rotate([x, y]: [number, number], a: number): [number, number] {
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
}

function doAttack(live: Live) {
  const p = live.player
  const s = live.stats
  const mult = s.dmg * s.attackMult
  p.atkT = 0.16
  switch (live.weapon) {
    case 'epee': {
      p.combo = p.comboT > 0 ? (p.combo + 1) % 3 : 0
      p.comboT = 0.55
      const heavy = p.combo === 2
      const dir = assistAim(live, 30, 1.0)
      p.faceX = dir[0]; p.faceY = dir[1]
      moveBody(live, p, dir[0] * 3, dir[1] * 3, 4)
      arcHit(live, heavy ? 19 : 15, 1.2, (heavy ? 22 : 12) * mult, s.attackCrit, (heavy ? 7 : 3) * s.attackKnock, dir)
      live.fx.push({ kind: 'slash', x: p.x, y: p.y - 3, ttl: 0.14, max: 0.14, color: heavy ? [218, 212, 94] : [222, 238, 214], a: Math.atan2(dir[1], dir[0]), r: heavy ? 19 : 15 })
      p.atkCd = heavy ? 0.4 : 0.24
      break
    }
    case 'lance': {
      const dir = assistAim(live, 34, 0.6)
      p.faceX = dir[0]; p.faceY = dir[1]
      lineHit(live, 26, 4, 15 * mult, s.attackCrit, 4 * s.attackKnock, dir)
      live.fx.push({ kind: 'line', x: p.x, y: p.y - 3, x2: p.x + dir[0] * 26, y2: p.y - 3 + dir[1] * 26, ttl: 0.12, max: 0.12, color: [222, 238, 214] })
      p.atkCd = 0.34
      break
    }
    case 'arc': {
      const dir = assistAim(live, 120, 0.5)
      p.faceX = dir[0]; p.faceY = dir[1]
      const isCrit = critRoll(live, s.attackCrit)
      shoot(live, 'arrow', dir, 230, 16 * mult * (isCrit ? 2 : 1))
      p.atkCd = 0.4
      break
    }
    case 'bouclier': {
      const dir = assistAim(live, 26, 1.0)
      p.faceX = dir[0]; p.faceY = dir[1]
      arcHit(live, 14, 1.0, 12 * mult, s.attackCrit, 10 * s.attackKnock, dir)
      live.fx.push({ kind: 'slash', x: p.x, y: p.y - 3, ttl: 0.12, max: 0.12, color: [133, 149, 161], a: Math.atan2(dir[1], dir[0]), r: 13 })
      p.atkCd = 0.38
      break
    }
  }
}

function doSpecial(live: Live, factor: number) {
  const p = live.player
  const s = live.stats
  const mult = s.dmg * s.specialMult * factor
  switch (live.weapon) {
    case 'epee':
      ringHit(live, p.x, p.y, 22, 18 * mult, 8, s.specialStun)
      live.fx.push({ kind: 'ring', x: p.x, y: p.y - 2, ttl: 0.25, max: 0.25, color: [218, 212, 94], r: 22 })
      live.shake = Math.max(live.shake, 0.15)
      break
    case 'lance': {
      if (live.projs.some(one => one.kind === 'spear')) return
      const dir = assistAim(live, 90, 0.5)
      shoot(live, 'spear', dir, 200, 20 * mult, { pierce: true, ttl: 0.45 })
      break
    }
    case 'arc': {
      const dir = assistAim(live, 100, 0.6)
      for (let i = -2; i <= 2; i++) shoot(live, 'arrow', rotate(dir, i * 0.17), 210, 8 * mult, { ttl: 0.9 })
      break
    }
    case 'bouclier': {
      if (live.projs.some(one => one.kind === 'shield')) return
      const dir = assistAim(live, 100, 0.8)
      shoot(live, 'shield', dir, 170, 16 * mult, { bounces: 3, ttl: 2.5, r: 3 })
      break
    }
  }
  p.specCd = live.weapon === 'epee' ? 1.1 : 1.25
  if (s.specialEcho && factor === 1) p.echoT = 0.22
}

function doCast(live: Live) {
  const p = live.player
  const s = live.stats
  if (live.ammo <= 0) {
    live.fx.push({ kind: 'num', x: p.x, y: p.y - 12, ttl: 0.5, max: 0.5, color: [117, 113, 97], text: 'vide' })
    return
  }
  live.ammo -= 1
  const dir = assistAim(live, 120, 0.6)
  shoot(live, 'bolt', dir, 210, 22 * s.dmg * s.castMult, { isLodging: true, heal: s.castHeal })
  if (s.castSplit) {
    shoot(live, 'bolt', rotate(dir, 0.35), 210, 22 * s.dmg * s.castMult * 0.6, { heal: s.castHeal, ttl: 0.7 })
    shoot(live, 'bolt', rotate(dir, -0.35), 210, 22 * s.dmg * s.castMult * 0.6, { heal: s.castHeal, ttl: 0.7 })
  }
}

function doDash(live: Live, mx: number, my: number) {
  const p = live.player
  const [dx, dy] = mx !== 0 || my !== 0 ? norm(mx, my) : [p.faceX, p.faceY]
  p.dashX = dx
  p.dashY = dy
  p.dashT = 0.11
  p.dashCd = live.stats.dashCd
  p.iframes = Math.max(p.iframes, live.stats.dashIframes)
}

// ---------- the step ----------

const BUFFER = 0.18

export function step(live: Live, input: Input, dtIn: number) {
  const dt = Math.min(dtIn, 0.05)
  if (live.isDead) return
  for (const key of ['attack', 'special', 'cast', 'dash'] as const) {
    if (input[key]) live.buffer[key] = BUFFER
    else live.buffer[key] = Math.max(0, live.buffer[key] - dt)
  }
  live.t += dt
  live.shake = Math.max(0, live.shake - dt)
  if (live.banner) {
    live.banner.ttl -= dt
    if (live.banner.ttl <= 0) live.banner = null
  }
  updateFx(live, dt)
  if (live.hitstop > 0) {
    live.hitstop -= dt
    return
  }
  updatePlayer(live, input, dt)
  updateProjs(live, dt)
  updateEnemies(live, dt)
  updateAllies(live, dt)
  updatePickups(live, dt)
  if (!live.isCleared && live.enemies.length === 0) {
    if (live.waves.length > 0) {
      spawnWave(live)
    } else if (live.errorQueue.length > 0) {
      for (const spawn of live.errorQueue.splice(0, 2)) spawnError(live, spawn, true)
    } else {
      live.isCleared = true
      live.projs = live.projs.filter(one => one.team === 'p')
      live.banner = { text: 'Salle nettoyee', ttl: 1.2 }
      const at = nearFree(live, 80, Math.round((ROOM.y0 + ROOM.y1) / 2))
      if (live.isBoss) live.pickups.push({ ...at, kind: 'stairs', t: 0 })
      else {
        const r = rnd(live)
        if (r < 0.3) live.pickups.push({ ...at, kind: 'heart', t: 0 })
        else if (r < 0.65) live.pickups.push({ ...at, kind: 'shard', t: 0 })
      }
      live.signals.push({ k: 'cleared' })
    }
  }
}

function updatePlayer(live: Live, input: Input, dt: number) {
  const p = live.player
  const s = live.stats
  p.iframes = Math.max(0, p.iframes - dt)
  p.flash = Math.max(0, p.flash - dt)
  p.dashCd = Math.max(0, p.dashCd - dt)
  p.atkCd = Math.max(0, p.atkCd - dt)
  p.atkT = Math.max(0, p.atkT - dt)
  p.specCd = Math.max(0, p.specCd - dt)
  p.comboT = Math.max(0, p.comboT - dt)
  if (p.echoT > 0) {
    p.echoT -= dt
    if (p.echoT <= 0) doSpecial(live, 0.5)
  }

  if (p.dashT > 0) {
    const sp = 270 * dt
    const ox = p.x
    const oy = p.y
    moveBody(live, p, p.dashX * sp, p.dashY * sp, 4)
    live.fx.push({ kind: 'ghost', x: ox, y: oy, ttl: 0.18, max: 0.18, color: [109, 194, 202] })
    if (s.dashTrail > 0) live.fx.push({ kind: 'spike', x: ox, y: oy, ttl: 1.2, max: 1.2, color: [109, 170, 44], dmg: s.dashTrail * s.dmg, hits: [] })
    if (live.weapon === 'bouclier') arcHit(live, 7, Math.PI, 6 * s.dmg, 0, 6, [p.dashX, p.dashY])
    p.dashT -= dt
    if (p.dashT <= 0 && s.dashNova > 0) {
      ringHit(live, p.x, p.y, 16, s.dashNova * s.dmg, 5, 0)
      live.fx.push({ kind: 'ring', x: p.x, y: p.y - 2, ttl: 0.2, max: 0.2, color: [109, 194, 202], r: 16 })
    }
    return
  }

  const [mx, my] = norm(input.mx, input.my)
  const [ax, ay] = norm(input.ax ?? 0, input.ay ?? 0)
  live.aimX = ax
  live.aimY = ay
  p.isMoving = mx !== 0 || my !== 0
  if (ax !== 0 || ay !== 0) {
    p.faceX = ax
    p.faceY = ay
  } else if (p.isMoving) {
    p.faceX = mx
    p.faceY = my
  }
  if (p.isMoving) {
    const slow = p.atkT > 0 ? 0.35 : 1
    moveBody(live, p, mx * 62 * slow * dt, my * 62 * slow * dt, 4)
    p.walk += dt * 8
  }

  if (live.buffer.dash > 0 && p.dashCd <= 0) {
    live.buffer.dash = 0
    doDash(live, input.mx, input.my)
  } else if (live.buffer.attack > 0 && p.atkCd <= 0) {
    live.buffer.attack = 0
    doAttack(live)
  } else if (live.buffer.special > 0 && p.specCd <= 0 && p.atkCd <= 0) {
    live.buffer.special = 0
    doSpecial(live, 1)
  } else if (live.buffer.cast > 0 && p.atkCd <= 0) {
    live.buffer.cast = 0
    doCast(live)
    p.atkCd = 0.2
  }

  // Doors: walk through one once the room is clear.
  if (live.isCleared && live.t > 0.35) {
    for (const door of live.doors) {
      const isThrough =
        door.side === 'n' ? p.y <= ROOM.y0 + 9 && Math.abs(p.x - door.x) <= 8
          : door.side === 's' ? p.y >= ROOM.y1 - 7 && Math.abs(p.x - door.x) <= 8
            : door.side === 'w' ? p.x <= ROOM.x0 + 9 && Math.abs(p.y - door.y - 4) <= 9
              : p.x >= ROOM.x1 - 9 && Math.abs(p.y - door.y - 4) <= 9
      if (isThrough) {
        live.signals.push({ k: 'door', to: door.to, side: door.side })
        live.doors = []
        break
      }
    }
  }
}

function updateProjs(live: Live, dt: number) {
  const p = live.player
  for (const pr of [...live.projs]) {
    pr.ttl -= dt
    if (pr.kind === 'spear' && (pr.ttl <= 0 || pr.isReturning)) {
      if (!pr.isReturning) {
        pr.isReturning = true
        pr.hits = []
      }
      const [nx, ny] = norm(p.x - pr.x, p.y - pr.y)
      pr.vx = nx * 230
      pr.vy = ny * 230
      if (dist(pr.x, pr.y, p.x, p.y) < 6) { remove(live, pr); continue }
    } else if (pr.kind === 'shield' && pr.isReturning) {
      const [nx, ny] = norm(p.x - pr.x, p.y - pr.y)
      pr.vx = nx * 200
      pr.vy = ny * 200
      if (dist(pr.x, pr.y, p.x, p.y) < 6) { remove(live, pr); continue }
    } else if (pr.ttl <= 0) {
      if (pr.isLodging) live.pickups.push({ x: pr.x, y: pr.y, kind: 'bolt', t: 0 })
      remove(live, pr)
      continue
    }
    const nx = pr.x + pr.vx * dt
    const ny = pr.y + pr.vy * dt
    const isFlying = pr.isReturning
    if (!isFlying && blocked(live, nx, ny, 1)) {
      if (pr.kind === 'spear' || pr.kind === 'shield') {
        pr.isReturning = true
        pr.hits = []
      }
      else {
        if (pr.isLodging) live.pickups.push({ x: pr.x, y: pr.y, kind: 'bolt', t: 0 })
        remove(live, pr)
        continue
      }
    } else {
      pr.x = nx
      pr.y = ny
    }
    if (pr.team === 'e') {
      if (dist(pr.x, pr.y, p.x, p.y - 3) < pr.r + 4) {
        hurtPlayer(live, pr.dmg, null, pr.kind === 'orb' && live.boss ? live.boss.name : 'Warning Rampant')
        remove(live, pr)
      }
      continue
    }
    for (const e of [...live.enemies]) {
      if (e.state === 'spawn' || pr.hits.includes(e.id)) continue
      if (dist(pr.x, pr.y, e.x, e.y - 2) > pr.r + e.r + 1) continue
      pr.hits.push(e.id)
      const isWounded = e.hp < e.maxHp
      const isCrit = pr.kind === 'bolt' && live.stats.castWoundCrit && isWounded ? true : critRoll(live, 0)
      const [kx, ky] = norm(pr.vx, pr.vy)
      damageEnemy(live, e, pr.dmg * (isCrit ? 2 : 1), isCrit, kx * 3, ky * 3)
      if (pr.heal > 0) live.player.hp = Math.min(live.stats.maxHp, live.player.hp + pr.heal)
      if (pr.kind === 'shield') {
        pr.bounces -= 1
        const next = live.enemies.filter(one => !pr.hits.includes(one.id) && one.state !== 'spawn').sort((a, b) => dist(a.x, a.y, pr.x, pr.y) - dist(b.x, b.y, pr.x, pr.y))[0]
        if (pr.bounces > 0 && next) {
          const [dx, dy] = norm(next.x - pr.x, next.y - pr.y)
          pr.vx = dx * 170
          pr.vy = dy * 170
        } else pr.isReturning = true
        break
      }
      if (!pr.pierce) {
        if (pr.isLodging) live.pickups.push({ x: pr.x, y: pr.y, kind: 'bolt', t: 0 })
        remove(live, pr)
        break
      }
    }
  }
}

function remove(live: Live, pr: Proj) {
  live.projs = live.projs.filter(one => one !== pr)
}

function updateEnemies(live: Live, dt: number) {
  const p = live.player
  for (const e of [...live.enemies]) {
    if (!live.enemies.includes(e)) continue
    e.flash = Math.max(0, e.flash - dt)
    e.t -= dt
    const def = ENEMY[e.type]
    const phase2 = e.type === 'boss' && e.hp < e.maxHp / 2
    switch (e.state) {
      case 'spawn':
      case 'stun':
        if (e.t <= 0) { e.state = 'chase'; e.t = e.type === 'boss' ? 1.0 : 0 }
        break
      case 'chase': {
        const d = dist(e.x, e.y, p.x, p.y)
        const [nx, ny] = norm(p.x - e.x, p.y - e.y)
        const ox = e.x
        const oy = e.y
        const sp = e.speed * (phase2 ? 1.3 : 1) * dt
        if (e.detour > 0) {
          e.detour -= dt
          moveBody(live, e, e.detourX * sp, e.detourY * sp, e.r)
        } else if (e.type === 'slug' && d < 40) moveBody(live, e, -nx * sp, -ny * sp, e.r)
        else if (e.type !== 'boss' || d > 20) {
          moveBody(live, e, nx * sp, ny * sp, e.r)
          // Walked into a pillar: go around it for a moment.
          if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.3 && d > def.range) {
            const side = e.id % 2 === 0 ? 1 : -1
            e.detour = 0.5
            e.detourX = -ny * side
            e.detourY = nx * side
          }
        }
        const isReady = e.type === 'boss' ? e.t <= 0 : d <= def.range
        if (isReady) {
          e.state = 'windup'
          e.aimX = p.x
          e.aimY = p.y
          e.hasHit = false
          e.t = (e.type === 'boss' ? [0.8, 0.8, 0.6, 1.0][e.pattern % 4]! : def.windup) * (phase2 ? 0.75 : 1)
          if (e.type === 'skeleton' || (e.type === 'boss' && e.pattern % 4 === 1)) {
            live.fx.push({ kind: 'tele', x: e.x, y: e.y, x2: e.aimX, y2: e.aimY, ttl: e.t, max: e.t, color: [208, 70, 72] })
          } else if (e.type === 'boss' && e.pattern % 4 === 3) {
            live.fx.push({ kind: 'tele', x: e.x, y: e.y, r: 30, ttl: e.t, max: e.t, color: [208, 70, 72] })
          } else if (e.type === 'boss' && e.pattern % 4 === 0) {
            live.fx.push({ kind: 'tele', x: e.x, y: e.y, r: 14, ttl: e.t, max: e.t, color: [218, 212, 94] })
          }
        }
        break
      }
      case 'windup':
        if (e.t <= 0) startAct(live, e, phase2)
        break
      case 'act': {
        if (e.vx !== 0 || e.vy !== 0) {
          const isWall = moveBody(live, e, e.vx * dt, e.vy * dt, e.r)
          if (!e.hasHit && dist(e.x, e.y, p.x, p.y) < e.r + 5) {
            e.hasHit = true
            hurtPlayer(live, Math.round(e.dmg * (e.type === 'boss' ? 1.2 : 1)), e, e.name)
          }
          if (isWall) e.t = 0
        }
        if (e.t <= 0) {
          e.vx = 0
          e.vy = 0
          e.state = 'recover'
          e.t = def.recover * (phase2 ? 0.7 : 1)
        }
        break
      }
      case 'recover':
        if (e.t <= 0) {
          e.state = 'chase'
          if (e.type === 'boss') { e.pattern += 1; e.t = phase2 ? 0.8 : 1.2 }
        }
        break
    }
  }
  // Keep bodies apart.
  for (let i = 0; i < live.enemies.length; i++) {
    for (let j = i + 1; j < live.enemies.length; j++) {
      const a = live.enemies[i]!
      const b = live.enemies[j]!
      const d = dist(a.x, a.y, b.x, b.y)
      const min = a.r + b.r
      if (d > 0 && d < min) {
        const push = (min - d) / 2
        const [nx, ny] = norm(b.x - a.x, b.y - a.y)
        if (a.type !== 'boss') moveBody(live, a, -nx * push, -ny * push, a.r)
        if (b.type !== 'boss') moveBody(live, b, nx * push, ny * push, b.r)
      }
    }
  }
}

function startAct(live: Live, e: Enemy, phase2: boolean) {
  const p = live.player
  const def = ENEMY[e.type]
  e.state = 'act'
  e.t = def.act
  const [nx, ny] = norm(e.aimX - e.x, e.aimY - e.y)
  switch (e.type) {
    case 'rat':
    case 'goblin':
    case 'larva':
      moveBody(live, e, nx * 4, ny * 4, e.r)
      live.fx.push({ kind: 'slash', x: e.x, y: e.y - 2, ttl: 0.1, max: 0.1, color: [208, 70, 72], a: Math.atan2(ny, nx), r: def.range })
      if (dist(e.x, e.y, p.x, p.y) <= def.range + 4) hurtPlayer(live, e.dmg, e, e.name)
      break
    case 'slug':
      live.projs.push({ id: live.nextId++, kind: 'spit', team: 'e', x: e.x, y: e.y - 2, vx: nx * 85, vy: ny * 85, r: 2, dmg: e.dmg, ttl: 2, pierce: false, hits: [], isReturning: false, bounces: 0, isLodging: false, heal: 0 })
      break
    case 'skeleton':
      e.vx = nx * 190
      e.vy = ny * 190
      break
    case 'boss': {
      const pattern = e.pattern % 4
      if (pattern === 0) {
        const n = phase2 ? 16 : 12
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + live.t
          live.projs.push({ id: live.nextId++, kind: 'orb', team: 'e', x: e.x, y: e.y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, r: 2, dmg: Math.round(e.dmg * 0.7), ttl: 2.5, pierce: false, hits: [], isReturning: false, bounces: 0, isLodging: false, heal: 0 })
        }
      } else if (pattern === 1) {
        e.vx = nx * 170
        e.vy = ny * 170
        e.t = 0.6
      } else if (pattern === 2) {
        const n = phase2 ? 3 : 2
        for (let i = 0; i < n && live.enemies.length < 9; i++) {
          const at = freeSpot(live, 30)
          live.enemies.push(makeEnemy(live, 'larva', 'minion', at.x, at.y, `Larve de ${e.name.split(',')[0]}`))
        }
      } else {
        live.shake = 0.3
        live.fx.push({ kind: 'ring', x: e.x, y: e.y, ttl: 0.3, max: 0.3, color: [208, 70, 72], r: 30 })
        if (dist(e.x, e.y, p.x, p.y) <= 30) hurtPlayer(live, Math.round(e.dmg * 1.3), e, e.name)
      }
      break
    }
  }
}

function updateAllies(live: Live, dt: number) {
  for (const ally of live.allies) {
    ally.t = Math.max(0, ally.t - dt)
    const target = [...live.enemies].filter(e => e.state !== 'spawn').sort((a, b) => dist(a.x, a.y, ally.x, ally.y) - dist(b.x, b.y, ally.x, ally.y))[0]
    if (!target) {
      const [nx, ny] = norm(live.player.x - 10 - ally.x, live.player.y - 6 - ally.y)
      if (dist(ally.x, ally.y, live.player.x, live.player.y) > 14) moveBody(live, ally, nx * 50 * dt, ny * 50 * dt, 3)
      continue
    }
    const d = dist(ally.x, ally.y, target.x, target.y)
    if (d > target.r + 5) {
      const [nx, ny] = norm(target.x - ally.x, target.y - ally.y)
      moveBody(live, ally, nx * 58 * dt, ny * 58 * dt, 3)
    } else if (ally.t <= 0) {
      ally.t = 0.6
      const [nx, ny] = norm(target.x - ally.x, target.y - ally.y)
      damageEnemy(live, target, ally.dmg, false, nx * 2, ny * 2)
    }
  }
}

function updatePickups(live: Live, dt: number) {
  const p = live.player
  for (const item of [...live.pickups]) {
    item.t += dt
    const isTouched = dist(item.x, item.y, p.x, p.y) < 7
    if (item.kind === 'bolt') {
      if (isTouched || item.t > 5) {
        live.ammo = Math.min(live.stats.castAmmo, live.ammo + 1)
        live.pickups = live.pickups.filter(one => one !== item)
      }
      continue
    }
    if (!isTouched) continue
    if (item.kind === 'shopHeart' || item.kind === 'shopBoon') {
      const price = item.price ?? 0
      if (live.wallet >= price) {
        live.wallet -= price
        live.pickups = live.pickups.filter(one => one !== item)
        live.signals.push({ k: 'buy', item: item.kind, price })
      } else if (item.t > 1) {
        item.t = 0
        live.fx.push({ kind: 'num', x: item.x, y: item.y - 10, ttl: 0.8, max: 0.8, color: [208, 70, 72], text: `${price}` })
      }
      continue
    }
    if (item.kind === 'heart' && p.hp >= live.stats.maxHp) continue
    live.pickups = live.pickups.filter(one => one !== item)
    if (item.kind === 'heart') {
      const n = Math.round(live.stats.maxHp * 0.2)
      p.hp = Math.min(live.stats.maxHp, p.hp + n)
      live.fx.push({ kind: 'num', x: item.x, y: item.y - 8, ttl: 0.9, max: 0.9, color: [208, 70, 72], text: `+${n}` })
    } else if (item.kind === 'shard') {
      const n = Math.round((3 + live.depth) * live.fortune)
      live.wallet += n
      live.signals.push({ k: 'chest', n })
    } else if (item.kind === 'altar') {
      live.signals.push({ k: 'portal' })
    } else if (item.kind === 'stairs') {
      live.signals.push({ k: 'descend' })
    } else if (item.kind === 'chest') {
      const n = Math.round((10 + live.depth) * live.fortune)
      live.fx.push({ kind: 'num', x: item.x, y: item.y - 8, ttl: 0.9, max: 0.9, color: [109, 194, 202], text: `+${n}` })
      live.wallet += n
      live.signals.push({ k: 'chest', n })
    } else {
      live.signals.push({ k: 'portal' })
    }
  }
  for (const spike of live.fx) {
    if (spike.kind !== 'spike' || !spike.hits || !spike.dmg) continue
    for (const e of [...live.enemies]) {
      if (spike.hits.includes(e.id) || dist(spike.x, spike.y, e.x, e.y) > e.r + 3) continue
      spike.hits.push(e.id)
      damageEnemy(live, e, spike.dmg, false, 0, 0)
    }
  }
}

function updateFx(live: Live, dt: number) {
  for (const fx of live.fx) {
    fx.ttl -= dt
    if (fx.kind === 'spark' && fx.a !== undefined && fx.r !== undefined) {
      fx.x += Math.cos(fx.a) * fx.r * dt
      fx.y += Math.sin(fx.a) * fx.r * dt
    }
    if (fx.kind === 'num') fx.y -= 14 * dt
  }
  live.fx = live.fx.filter(fx => fx.ttl > 0)
  if (live.fx.length > 400) live.fx.splice(0, live.fx.length - 400)
}
