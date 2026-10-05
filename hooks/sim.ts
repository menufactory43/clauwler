/**
 * The fight: the room, the bodies, the blows, simulated in a little world of 160x100 pixels.
 *
 * Sound cues. The sim pushes cue names into `live.sfx` as things happen; register.tsx drains
 * them every tick (hooks/sound.ts plays them). The sim keeps only the latest 24. Kills, room
 * clears, doors and death are sounded from `live.signals` instead. The names:
 *   'hit'     a blow lands on a foe          'crit'    a critical blow lands
 *   'hurt'    the champion takes damage      'dash'    the champion dashes
 *   'shoot'   a shot leaves (his or a foe's) 'explode' an explosion, a ground strike, a guardian's fall
 *   'boss'    a guardian enters              'phase'   a guardian enters its second phase
 *   'block'   a blow glances off a shield or a guardian between phases
 *   'warn'    a dangerous telegraph starts (guardian move, sniper lock, mine trips, leak swells)
 *   'summon'  adds appear                    'burrow'  the cache worm digs in or erupts
 * ('block', 'warn', 'summon', 'burrow' have no clip yet: the player ignores unknown names.)
 */
import type { ErrorSpawn, RoomKind, SessionEvent, Side, WeaponId } from '../types'
import type { CombatStats } from './data'
import { hash } from './data'
import { L, localize, localizeAll, tr } from './i18n'
import type { RGB } from './art'
// Build effects (statuses, extra shots, shields...): the build agent's hook points, one line each.
import * as FX from './effects'

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

export type EnemyType =
  | 'rat' | 'goblin' | 'slug' | 'skeleton' | 'larva' | 'bug' | 'linter' | 'forker' | 'turret'
  | 'miner' | 'burrower' | 'monolith' | 'micro' | 'sentinel' | 'reviewer' | 'leak' | 'sniper' | 'boss'
export type EnemyKind = 'biome' | 'error' | 'nemesis' | 'boss' | 'minion'
type EnemyState = 'spawn' | 'chase' | 'windup' | 'act' | 'recover' | 'stun'
/** What a session error's monster gets on top of its kind. */
export type Affix = 'rapide' | 'volatile' | 'scinde' | 'blinde'
export type BossMove = 'burst' | 'spiral' | 'fan' | 'charge' | 'slam' | 'rows' | 'cols' | 'cross' | 'grid' | 'rain' | 'summon' | 'snipe'

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
  /** Statuses from the build (burn, poison, chill, mark, freeze). */
  status?: FX.Status
  /** Knockback, in pixels a second, dying away. */
  kbx?: number
  kby?: number
  /** 1 on a hit, falling to 0: the squash of the body. */
  squash?: number
  /** The full length of the current windup or act, for the telegraphs' progress. */
  tMax?: number
  /** Underground: the cache worm between its eruptions. */
  hidden?: boolean
  /** The heading of the Sentinelle's shield, radians. */
  faceA?: number
  /** Seconds of LGTM haste left. */
  buff?: number
  affix?: Affix
  blockT?: number
  /** The guardian's look and moves: 0 Merge Conflict, 1 Démon de la Prod, 2 Hydre. */
  boss?: number
  phase?: number
  move?: BossMove
  seq?: number
  /** Seconds a guardian shrugs blows off. */
  inv?: number
  spin?: number
}

export type Proj = {
  id: number
  kind: 'arrow' | 'bolt' | 'spit' | 'spear' | 'shield' | 'orb' | 'shot'
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
  /** What the build did to this shot (source, homing, ricochet). */
  fx?: FX.ProjFx
  /** Who fired it, named on death. */
  by?: string
  /** Its colour in a guardian's two-tone patterns: 0 or 1. */
  tone?: number
}

export type Fx = {
  kind: 'slash' | 'ring' | 'spark' | 'num' | 'ghost' | 'tele' | 'line' | 'spike' | 'gib' | 'stain' | 'beam' | 'flash'
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
  /** Gibs: a velocity and a height above the floor. */
  vx?: number
  vy?: number
  z?: number
  vz?: number
  /** Beams: half their width. */
  w?: number
  /** Numbers drawn large: crits, the champion's wounds. */
  big?: boolean
}

/**
 * A blow announced on the ground before it lands: a disc, a band (lanes, lasers, charges) or a
 * cone (swipes). It lands when `t` runs out. A mine waits (`mine` > 0) until the champion comes
 * near; a burning zone (`zone` > 0) hurts whoever stands in it until it dies out.
 */
export type Strike = {
  shape: 'circle' | 'band' | 'cone'
  x: number
  y: number
  x2: number
  y2: number
  /** Radius of a disc or cone, half-width of a band. */
  r: number
  a: number
  half: number
  t: number
  max: number
  dmg: number
  by: string
  color: RGB
  /** The enemy that casts it: 0 for none. */
  from: number
  /** Dropped when its caster dies. */
  isTied: boolean
  /** Moves with its caster. */
  isFollowing: boolean
  hitsFoes: boolean
  isLaser: boolean
  after: '' | 'burn' | 'summon' | 'pop'
  spawn?: EnemyType
  spawnName?: string
  mine: number
  zone: number
}

export type PickupKind = 'chest' | 'portal' | 'bolt' | 'heart' | 'shard' | 'altar' | 'shopHeart' | 'shopBoon' | 'stairs'
/** `tag`: what a shop stand really sells when it is not its kind (e.g. `shopItem`). */
export type Pickup = { x: number; y: number; kind: PickupKind; t: number; price?: number; tag?: string }
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
  items?: { kind: string; price?: number; tag?: string }[]
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
  /** Telegraphed blows waiting to land. */
  strikes: Strike[]
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
  /** A number for this room alone: the picture process caches the room's layer by it. */
  roomKey?: number
  /** When the world last froze or slowed, so the beats stay rare. */
  lastFreezeAt?: number
  lastSlowAt?: number
  /** Seconds of slow motion left after the champion is hurt. */
  slow: number
  banner: { text: string; ttl: number } | null
  signals: Signal[]
  /** Sound cues since the reader last emptied it: see the top of this file. */
  sfx: string[]
  /** Build state for this room (shield, dash charges, queued bursts). */
  effects?: FX.FxState
}

// ---------- random ----------

function rnd(live: Live): number {
  let t = (live.rng = (live.rng + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rint = (live: Live, n: number) => Math.floor(rnd(live) * n)

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)
const norm = (x: number, y: number): [number, number] => {
  const d = Math.hypot(x, y)
  return d < 1e-6 ? [0, 0] : [x / d, y / d]
}

function sfx(live: Live, name: string) {
  if (!live.sfx) live.sfx = []
  live.sfx.push(name)
  if (live.sfx.length > 24) live.sfx.splice(0, live.sfx.length - 24)
}

// ---------- enemies ----------

/** `keep`: the distance a shooter holds from the champion (0 walks in); `cd`: the pause before its first blow. */
type EnemyDef = { hp: number; r: number; speed: number; dmg: number; range: number; windup: number; act: number; recover: number; level: number; keep: number; cd: number }

export const ENEMY: Record<EnemyType, EnemyDef> = {
  rat: { hp: 16, r: 4, speed: 46, dmg: 5, range: 16, windup: 0.42, act: 0.14, recover: 0.55, level: 1, keep: 0, cd: 0.3 },
  goblin: { hp: 26, r: 4, speed: 34, dmg: 8, range: 13, windup: 0.5, act: 0.2, recover: 0.6, level: 2, keep: 0, cd: 0.4 },
  slug: { hp: 20, r: 4, speed: 20, dmg: 6, range: 64, windup: 0.6, act: 0.1, recover: 1.2, level: 2, keep: 40, cd: 0.8 },
  skeleton: { hp: 32, r: 4, speed: 30, dmg: 10, range: 60, windup: 0.65, act: 0.42, recover: 0.8, level: 3, keep: 0, cd: 0.8 },
  larva: { hp: 8, r: 3, speed: 55, dmg: 3, range: 12, windup: 0.34, act: 0.12, recover: 0.45, level: 1, keep: 0, cd: 0.2 },
  bug: { hp: 4, r: 2, speed: 58, dmg: 2, range: 10, windup: 0.32, act: 0.1, recover: 0.5, level: 0, keep: 0, cd: 0.3 },
  linter: { hp: 24, r: 4, speed: 24, dmg: 5, range: 72, windup: 0.65, act: 0.1, recover: 1.5, level: 2, keep: 50, cd: 1.0 },
  forker: { hp: 30, r: 4, speed: 22, dmg: 0, range: 130, windup: 0.9, act: 0.1, recover: 3.2, level: 3, keep: 60, cd: 1.0 },
  turret: { hp: 44, r: 5, speed: 0, dmg: 6, range: 400, windup: 0.7, act: 0.1, recover: 1.4, level: 3, keep: 0, cd: 1.4 },
  miner: { hp: 24, r: 4, speed: 34, dmg: 9, range: 400, windup: 0.4, act: 0.1, recover: 2.2, level: 2, keep: 38, cd: 1.0 },
  burrower: { hp: 28, r: 4, speed: 38, dmg: 9, range: 0, windup: 0.75, act: 0.1, recover: 1.5, level: 3, keep: 0, cd: 1.2 },
  monolith: { hp: 46, r: 6, speed: 18, dmg: 9, range: 16, windup: 0.65, act: 0.15, recover: 0.9, level: 3, keep: 0, cd: 0.5 },
  micro: { hp: 12, r: 3, speed: 44, dmg: 4, range: 13, windup: 0.36, act: 0.12, recover: 0.5, level: 1, keep: 0, cd: 0.4 },
  sentinel: { hp: 38, r: 5, speed: 24, dmg: 9, range: 15, windup: 0.55, act: 0.2, recover: 0.8, level: 3, keep: 0, cd: 0.6 },
  reviewer: { hp: 22, r: 4, speed: 26, dmg: 4, range: 12, windup: 0.9, act: 0.1, recover: 2.8, level: 2, keep: 52, cd: 1.5 },
  leak: { hp: 14, r: 4, speed: 40, dmg: 12, range: 15, windup: 0.75, act: 0.1, recover: 0.1, level: 2, keep: 0, cd: 0 },
  sniper: { hp: 20, r: 4, speed: 28, dmg: 10, range: 130, windup: 1.0, act: 0.1, recover: 1.6, level: 3, keep: 72, cd: 1.2 },
  boss: { hp: 280, r: 9, speed: 26, dmg: 12, range: 0, windup: 0.8, act: 0.6, recover: 1.2, level: 10, keep: 36, cd: 1 },
}

/** The forker's raised dead, in either language (a room keeps the names it was made with). */
const isZombie = (name: string) => name === 'Processus Zombie' || name === 'Zombie Process'

export const NAMES: Record<EnemyType, string> = localize({
  rat: L('Rat de node_modules', 'node_modules Rat'),
  goblin: L('Gobelin TODO', 'TODO Goblin'),
  slug: L('Warning Rampant', 'Crawling Warning'),
  skeleton: L('Squelette Legacy', 'Legacy Skeleton'),
  larva: L('Larve', 'Larva'),
  bug: 'Bug',
  linter: L('Prêcheur du Lint', 'Lint Preacher'),
  forker: L('Nécromant du Fork', 'Fork Necromancer'),
  turret: L('Tourelle CI', 'CI Turret'),
  miner: L('Poseur de Breakpoints', 'Breakpoint Layer'),
  burrower: L('Ver de Cache', 'Cache Worm'),
  monolith: L('Monolithe Gluant', 'Sticky Monolith'),
  micro: 'Microservice',
  sentinel: L('Sentinelle CORS', 'CORS Sentinel'),
  reviewer: L('Relecteur LGTM', 'LGTM Reviewer'),
  leak: L('Fuite Mémoire', 'Memory Leak'),
  sniper: L('Profileur Embusqué', 'Lurking Profiler'),
  boss: L('Gardien', 'Guardian'),
})

/** The bits a body breaks into. */
export const GIB: Record<EnemyType, RGB[]> = {
  rat: [[133, 149, 161], [86, 98, 118], [208, 70, 72]],
  goblin: [[109, 170, 44], [133, 76, 48], [52, 101, 36]],
  slug: [[218, 212, 94], [210, 125, 44]],
  skeleton: [[222, 238, 214], [164, 176, 170]],
  larva: [[68, 36, 52], [109, 194, 202]],
  bug: [[208, 70, 72], [218, 212, 94]],
  linter: [[89, 125, 206], [48, 52, 109], [218, 212, 94]],
  forker: [[68, 36, 52], [109, 194, 202], [133, 76, 48]],
  turret: [[133, 149, 161], [78, 74, 78], [208, 70, 72]],
  miner: [[210, 125, 44], [133, 76, 48], [208, 70, 72]],
  burrower: [[238, 112, 92], [140, 36, 48], [133, 76, 48]],
  monolith: [[89, 125, 206], [48, 52, 109], [222, 238, 214]],
  micro: [[109, 194, 202], [89, 125, 206]],
  sentinel: [[133, 149, 161], [164, 176, 170], [208, 70, 72]],
  reviewer: [[109, 170, 44], [210, 170, 153], [222, 238, 214]],
  leak: [[238, 112, 92], [208, 70, 72], [218, 212, 94]],
  sniper: [[117, 113, 97], [78, 74, 78], [208, 70, 72]],
  boss: [[208, 70, 72], [218, 212, 94], [222, 238, 214]],
}

/** Each biome's foes: type, weight, and the threat within the biome (0..4) it shows up from. */
const POOLS: (readonly [EnemyType, number, number])[][] = [
  // Les Racines du Dépôt: vermin, a first shooter, then the first real patterns.
  [['rat', 4, 0], ['goblin', 3, 0], ['slug', 2, 0], ['bug', 2, 0], ['leak', 1, 1], ['monolith', 2, 2], ['skeleton', 1, 2], ['burrower', 1, 3], ['linter', 1, 3]],
  // Les Abysses de node_modules: things underground, things that multiply, things that blow up.
  [['rat', 2, 0], ['goblin', 2, 0], ['linter', 2, 0], ['bug', 2, 0], ['burrower', 2, 0], ['leak', 2, 0], ['forker', 1, 1], ['miner', 2, 1], ['sentinel', 1, 2], ['monolith', 1, 2], ['skeleton', 1, 2]],
  // Le Cœur du Monolithe: shields, snipers, turrets, and someone to heal them.
  [['skeleton', 2, 0], ['sentinel', 2, 0], ['linter', 2, 0], ['sniper', 2, 0], ['turret', 1, 0], ['reviewer', 1, 0], ['monolith', 2, 0], ['forker', 1, 1], ['miner', 1, 1], ['leak', 1, 1], ['bug', 1, 2], ['burrower', 1, 2]],
]
/** At most one of these a wave. */
const SOLO = new Set<EnemyType>(['turret', 'reviewer', 'forker', 'sniper'])

function rollWave(live: Live, n: number): EnemyType[] {
  const pool = (POOLS[Math.min(live.biome, POOLS.length - 1)] ?? POOLS[0]!).filter(([, , from]) => from <= live.depth - live.biome * 5)
  const wave: EnemyType[] = []
  for (let i = 0; i < n; i++) {
    const open = pool.filter(([type]) => !(SOLO.has(type) && wave.includes(type)))
    const total = open.reduce((s, [, w]) => s + w, 0)
    let roll = rnd(live) * total
    for (const [type, w] of open) {
      roll -= w
      if (roll <= 0) { wave.push(type); break }
    }
  }
  return wave
}

function makeEnemy(live: Live, type: EnemyType, kind: EnemyKind, x: number, y: number, name?: string, sig?: string): Enemy {
  const def = ENEMY[type]
  const scaleHp = 1 + live.depth * 0.06
  const scaleDmg = 1 + live.depth * 0.06
  const elite = kind === 'error' ? 1.4 : 1
  const hp = Math.round(def.hp * scaleHp * elite)
  return {
    id: live.nextId++, type, kind, name: name ?? NAMES[type], sig, x, y, r: def.r, hp, maxHp: hp,
    speed: def.speed, dmg: Math.round(def.dmg * scaleDmg * (kind === 'error' ? 1.25 : 1)), level: def.level + Math.floor(live.depth / 2) + (kind === 'error' ? 2 : 0),
    state: 'spawn', t: 0.7, aimX: x, aimY: y, vx: 0, vy: 0, flash: 0, pattern: 0, hasHit: false, detour: 0, detourX: 0, detourY: 0,
    kbx: 0, kby: 0, squash: 0, tMax: 0.7, faceA: Math.atan2(live.player.y - y, live.player.x - x), buff: 0,
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
function nearFree(live: Live, x: number, y: number, r = 7): { x: number; y: number } {
  for (let d = 0; d < 60; d += 3) {
    for (let a = 0; a < 16; a++) {
      const px = Math.round(x + Math.cos((a / 16) * Math.PI * 2) * d)
      const py = Math.round(y + Math.sin((a / 16) * Math.PI * 2) * d)
      if (!blocked(live, px, py, r)) return { x: px, y: py }
      if (d === 0) break
    }
  }
  return { x, y }
}

const ERROR_TYPES: EnemyType[] = ['goblin', 'slug', 'skeleton', 'linter', 'sentinel', 'sniper', 'leak', 'monolith', 'miner']
const AFFIXES: Affix[] = ['rapide', 'volatile', 'scinde', 'blinde']
export const AFFIX_LABEL: Record<Affix, string> = localize({ rapide: L('rapide', 'swift'), volatile: L('volatile', 'volatile'), scinde: L('scindé', 'splitting'), blinde: L('blindé', 'armored') })

function errorType(sig: string): EnemyType {
  return ERROR_TYPES[hash(sig) % ERROR_TYPES.length] ?? 'goblin'
}

export function spawnError(live: Live, spawn: ErrorSpawn, isAnnounced: boolean) {
  const at = freeSpot(live, 40)
  const e = makeEnemy(live, errorType(spawn.sig), 'error', at.x, at.y, spawn.name, spawn.sig)
  e.affix = AFFIXES[hash(`${spawn.sig}+affix`) % AFFIXES.length]
  if (e.affix === 'rapide') e.speed = Math.round(e.speed * 1.35)
  live.enemies.push(e)
  if (isAnnounced) {
    live.banner = { text: tr(`${spawn.sig} surgit !`, `${spawn.sig} breaks out!`), ttl: 1.6 }
    live.signals.push({ k: 'log', text: tr(`⚡ ${spawn.name} surgit de la session (${AFFIX_LABEL[e.affix ?? 'rapide']}) !`, `⚡ ${spawn.name} crawls out of the session (${AFFIX_LABEL[e.affix ?? 'rapide']})!`) })
  }
}

function spawnWave(live: Live) {
  const wave = live.waves.shift()
  if (!wave) return
  for (const type of wave) {
    const at = freeSpot(live, 45)
    if (type === 'bug') {
      // A swarm: a handful at one spot.
      const n = 4 + (live.depth >= 6 ? 1 : 0)
      for (let i = 0; i < n; i++) {
        const spot = nearFree(live, at.x + Math.cos(i * 1.3) * 5, at.y + Math.sin(i * 1.3) * 4, 3)
        const e = makeEnemy(live, 'bug', 'biome', spot.x, spot.y)
        e.t = 0.7 + i * 0.06
        live.enemies.push(e)
      }
    } else live.enemies.push(makeEnemy(live, type, 'biome', at.x, at.y))
  }
  for (const spawn of live.errorQueue.splice(0, 2)) spawnError(live, spawn, false)
}

// ---------- guardians ----------

type GuardianDef = { p1: BossMove[]; p2: BossMove[]; adds: EnemyType; addName: string; addCount: number; roar: string; isBurning: boolean }

/** One guardian a biome, two phases each; a Némésis takes one of their shapes. */
export const GUARDIANS: GuardianDef[] = localizeAll([
  // Le Merge Conflict: lanes and crossings, HEAD against incoming.
  { p1: ['cross', 'burst', 'charge', 'fan'], p2: ['rows', 'spiral', 'charge', 'cross', 'summon', 'burst', 'cols'], adds: 'micro', addName: L('Hunk orphelin', 'Orphan Hunk'), addCount: 3, roar: L('Le conflit s’envenime !', 'The conflict festers!'), isBurning: false },
  // Le Démon de la Prod: incidents raining down, the floor on fire.
  { p1: ['fan', 'rain', 'slam', 'burst'], p2: ['rain', 'spiral', 'fan', 'summon', 'slam', 'rain'], adds: 'leak', addName: L('Incident', 'Incident'), addCount: 2, roar: L('La prod est en feu !', 'Prod is on fire!'), isBurning: true },
  // L'Hydre des Dépendances: heads that aim, a swarm of transitive deps.
  { p1: ['snipe', 'burst', 'summon', 'cols'], p2: ['grid', 'snipe', 'spiral', 'summon', 'rain', 'snipe'], adds: 'bug', addName: L('Dépendance transitive', 'Transitive Dependency'), addCount: 5, roar: L('Deux têtes repoussent !', 'Two heads grow back!'), isBurning: false },
])

const BOSS_WIND: Record<BossMove, number> = { burst: 0.75, spiral: 0.7, fan: 0.6, charge: 0.75, slam: 0.8, rows: 1.0, cols: 1.0, cross: 0.9, grid: 1.1, rain: 0.9, summon: 0.9, snipe: 0.8 }

const RED: RGB = [208, 70, 72]
const ORANGE: RGB = [210, 125, 44]
const YELLOW: RGB = [218, 212, 94]
const PURPLE: RGB = [170, 90, 200]
const GREEN: RGB = [109, 170, 44]

// ---------- room ----------

let roomCount = Math.floor(Math.random() * 1e6)

export function createRoom(spec: RoomSpec): Live {
  const live: Live = {
    roomKey: ++roomCount,
    t: 0, rng: spec.seed | 0, nextId: 1, biome: spec.biome, depth: spec.depth, isBoss: spec.isBoss,
    weapon: spec.weapon, stats: spec.stats, scars: spec.scars, fortune: spec.fortune, wallet: spec.wallet ?? 0, aimX: 0, aimY: 0,
    player: {
      x: entryAt(spec.entry).x, y: entryAt(spec.entry).y, hp: Math.min(spec.hp, spec.stats.maxHp), faceX: 0, faceY: -1, iframes: 0.8, flash: 0,
      dashT: 0, dashCd: 0, dashX: 0, dashY: 0, atkT: 0, atkCd: 0, combo: 0, comboT: 0, specCd: 0, echoT: 0,
      walk: 0, isMoving: false, defiance: spec.defiance,
    },
    ammo: spec.stats.castAmmo,
    buffer: { attack: 0, special: 0, cast: 0, dash: 0 },
    enemies: [], projs: [], fx: [], strikes: [], pickups: [], allies: [], pillars: [], doors: [], waves: [],
    errorQueue: [...spec.errorSpawns], boss: spec.boss, isCleared: false, isDead: false,
    shake: 0, hitstop: 0, slow: 0, banner: { text: spec.title, ttl: 1.8 }, signals: [], sfx: [],
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
    // The guardian's lair keeps its middle open.
    const nearBoss = spec.isBoss && rect.x < 104 && rect.x + rect.w > 56 && rect.y < 60
    if (!overlaps && !nearDoor && !nearMe && !nearBoss) live.pillars.push(rect)
  }
  live.doors = (spec.doors ?? []).map(d => ({ ...d, ...doorAt(d.side) }))
  if (spec.isFight === false) {
    live.isCleared = true
    live.errorQueue = []
  } else if (spec.isBoss && spec.boss) {
    const b = spec.boss
    const def = ENEMY.boss
    const hp = Math.round((def.hp + spec.biome * 160 + b.rank * 50) * (1 + spec.depth * 0.03))
    const look = b.isNemesis ? hash(b.sig ?? b.name) % GUARDIANS.length : spec.biome % GUARDIANS.length
    live.enemies.push({
      ...makeEnemy(live, 'boss', b.isNemesis ? 'nemesis' : 'boss', 80, 44, b.name, b.sig),
      hp, maxHp: hp, dmg: def.dmg + spec.biome * 3 + Math.ceil(b.rank / 2), level: def.level + spec.biome * 4 + b.rank * 2, t: 1.4, tMax: 1.4,
      boss: look, phase: 1, inv: 0, seq: 0, spin: 0,
    })
    sfx(live, 'boss')
    live.errorQueue = []
  } else {
    const waves = spec.depth < 2 ? 1 : spec.depth < 7 ? 2 : 3
    for (let w = 0; w < waves; w++) live.waves.push(rollWave(live, Math.min(6, 2 + Math.floor(spec.depth / 3) + rint(live, 2))))
    spawnWave(live)
  }
  const center = { x: 80, y: Math.round((ROOM.y0 + ROOM.y1) / 2) }
  const placed = spec.items ?? []
  placed.forEach((item, i) => {
    const x = Math.round(center.x + (i - (placed.length - 1) / 2) * 36)
    live.pickups.push({ x, y: center.y, kind: item.kind as PickupKind, t: 0, price: item.price, tag: item.tag })
  })
  for (let i = 0; i < spec.chests; i++) live.pickups.push({ ...freeSpot(live, 20), kind: 'chest', t: 0 })
  for (let i = 0; i < spec.portals; i++) live.pickups.push({ ...freeSpot(live, 20), kind: 'portal', t: 0 })
  for (let i = 0; i < spec.familiars; i++) addAlly(live)
  FX.onRoomStart(live) // build: shield, dash charges, summoned familiars
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
      live.signals.push({ k: 'log', text: tr('$ Des tests passent au vert : un coffre apparaît.', '$ Tests go green: a chest appears.') })
      break
    case 'agent':
      addAlly(live)
      live.banner = { text: tr('Familier invoqué', 'Familiar summoned'), ttl: 1.2 }
      live.signals.push({ k: 'log', text: tr('Un sous-agent est invoqué : un familier combat à tes côtés.', 'A subagent is summoned: a familiar fights at your side.') })
      break
    case 'web':
      live.pickups.push({ ...freeSpot(live, 16), kind: 'portal', t: 0 })
      live.signals.push({ k: 'log', text: tr('Une recherche ouvre un portail vers un bienfait.', 'A search opens a portal to a boon.') })
      break
    case 'compact':
      live.shake = 0.6
      live.banner = { text: tr('Seisme !', 'Quake!'), ttl: 1.2 }
      for (const e of [...live.enemies]) if (e.state !== 'spawn') damageEnemy(live, e, Math.round(e.maxHp * (e.kind === 'boss' || e.kind === 'nemesis' ? 0.1 : 0.5)), false, 0, 0)
      live.signals.push({ k: 'log', text: tr('🌋 Le contexte se compacte : la salle tremble et écrase tes ennemis.', '🌋 The context compacts: the room shakes and crushes your foes.') })
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

/** How far a ray runs from a point before a wall or a pillar stops it, up to `max`. */
export function rayToWall(live: Live, x: number, y: number, dx: number, dy: number, max = 220): number {
  for (let d = 4; d < max; d += 2) if (blocked(live, x + dx * d, y + dy * d, 0.5)) return d
  return max
}

// ---------- damage ----------

function scarBonus(live: Live, e: Enemy) {
  return live.scars.includes(e.name.split(',')[0] ?? e.name) ? 1.5 : 1
}

function num(live: Live, x: number, y: number, text: string, color: RGB, big = false) {
  live.fx.push({ kind: 'num', x, y, ttl: big ? 0.85 : 0.65, max: big ? 0.85 : 0.65, color, text, big })
}

function sparks(live: Live, x: number, y: number, n: number, color: RGB, speed: number, dir?: [number, number]) {
  for (let i = 0; i < n; i++) {
    const a = dir && (dir[0] !== 0 || dir[1] !== 0) ? Math.atan2(dir[1], dir[0]) + (rnd(live) - 0.5) * 1.6 : rnd(live) * Math.PI * 2
    live.fx.push({ kind: 'spark', x, y, ttl: 0.28, max: 0.28, color, a, r: speed * (0.5 + rnd(live)) })
  }
}

function damageEnemy(live: Live, e: Enemy, amount: number, isCrit: boolean, kx: number, ky: number) {
  if (e.state === 'spawn' || e.hp <= 0) return
  if ((e.inv ?? 0) > 0) {
    if (live.t - (e.blockT ?? -9) > 0.35) {
      e.blockT = live.t
      num(live, e.x, e.y - e.r - 8, tr('immunisé', 'immune'), [133, 149, 161])
      sfx(live, 'block')
    }
    return
  }
  // The Sentinelle's shield, turned toward the blow, stops it: go round.
  if (e.type === 'sentinel' && (kx !== 0 || ky !== 0)) {
    const [bx, by] = norm(kx, ky)
    if (bx * Math.cos(e.faceA ?? 0) + by * Math.sin(e.faceA ?? 0) < -0.4) {
      sparks(live, e.x + Math.cos(e.faceA ?? 0) * 5, e.y - 3 + Math.sin(e.faceA ?? 0) * 5, 3, YELLOW, 40, [-bx, -by])
      e.kbx = (e.kbx ?? 0) + bx * 25
      e.kby = (e.kby ?? 0) + by * 25
      if (live.t - (e.blockT ?? -9) > 0.4) {
        e.blockT = live.t
        num(live, e.x, e.y - e.r - 8, tr('bloqué', 'blocked'), [133, 149, 161])
        sfx(live, 'block')
      }
      return
    }
  }
  let dmg = Math.max(1, Math.round(amount * scarBonus(live, e) * FX.damageMult(live, e, isCrit))) // build: marks, crits, bosses
  if (e.affix === 'blinde') dmg = Math.max(1, Math.round(dmg * 0.65))
  e.hp -= dmg
  FX.onPlayerHit(live, e, dmg, isCrit) // build: statuses, chains, executes
  e.flash = 0.1
  e.squash = 1
  // Knockback as a push that dies away; the heavy ones barely move.
  const heft = e.type === 'boss' ? 0.12 : e.type === 'turret' ? 0 : e.type === 'monolith' || e.type === 'sentinel' ? 0.5 : 1
  e.kbx = (e.kbx ?? 0) + kx * heft * 12
  e.kby = (e.kby ?? 0) + ky * heft * 12
  // Only crits freeze, and not twice in a row: a crowd hit every tick would stutter the game.
  if (isCrit && live.enemies.length <= 6) freeze(live, 0.04)
  if (isCrit) live.shake = Math.max(live.shake, 0.14)
  sfx(live, isCrit ? 'crit' : 'hit')
  num(live, e.x + (rnd(live) - 0.5) * 6, e.y - e.r - 5, isCrit ? `${dmg}!` : `${dmg}`, isCrit ? YELLOW : [222, 238, 214], isCrit)
  sparks(live, e.x, e.y - 2, isCrit ? 6 : 3, isCrit ? YELLOW : [222, 238, 214], isCrit ? 50 : 35, [kx, ky])
  if (e.hp <= 0 && live.enemies.includes(e)) killEnemy(live, e)
}

function gibs(live: Live, e: Enemy, n: number) {
  const colors = GIB[e.type]
  for (let i = 0; i < n; i++) {
    const a = rnd(live) * Math.PI * 2
    const sp = 18 + rnd(live) * 34
    live.fx.push({
      kind: 'gib', x: e.x + (rnd(live) - 0.5) * e.r, y: e.y - 1, ttl: 0.8 + rnd(live) * 0.5, max: 1.3, color: colors[i % colors.length]!,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, z: 2 + rnd(live) * e.r, vz: 25 + rnd(live) * 40, r: rnd(live) < 0.3 ? 1 : 0.5,
    })
  }
  if (live.fx.filter(f => f.kind === 'stain').length < 24) live.fx.push({ kind: 'stain', x: e.x, y: e.y, ttl: 9, max: 9, color: colors[colors.length > 2 ? 2 : 0]!, r: Math.min(8, e.r + 1) })
}

function killEnemy(live: Live, e: Enemy) {
  FX.onKill(live, e) // build: explosions, spreading poison, familiars
  live.enemies = live.enemies.filter(one => one !== e)
  live.strikes = live.strikes.filter(s => !(s.from === e.id && s.isTied))
  const s = live.stats
  if (s.lifesteal > 0) live.player.hp = Math.min(s.maxHp, live.player.hp + s.lifesteal)
  const isBoss = e.type === 'boss'
  gibs(live, e, isBoss ? 26 : Math.min(12, 4 + e.r))
  sparks(live, e.x, e.y - 2, isBoss ? 16 : 6, e.kind === 'biome' || e.kind === 'minion' ? RED : ORANGE, 55)
  live.fx.push({ kind: 'ring', x: e.x, y: e.y - 2, ttl: 0.2, max: 0.2, color: [222, 238, 214], r: e.r + 5 })
  if (isBoss) freeze(live, 0.35, true)
  else if (e.kind !== 'biome' && e.kind !== 'minion') freeze(live, 0.06)
  live.shake = Math.max(live.shake, isBoss ? 0.9 : 0.1)
  if (isBoss) sfx(live, 'explode')
  if (isBoss) {
    // The guardian's court falls with it; its shots fade.
    live.fx.push({ kind: 'flash', x: 0, y: 0, ttl: 0.35, max: 0.35, color: [246, 214, 132] })
    live.projs = live.projs.filter(one => one.team === 'p')
    live.strikes = []
    for (const m of live.enemies.filter(one => one.kind === 'minion')) {
      gibs(live, m, 4)
      live.enemies = live.enemies.filter(one => one !== m)
    }
  }
  // What a body leaves behind.
  if (e.type === 'monolith') {
    for (const side of [-1, 1]) {
      const at = nearFree(live, e.x + side * 5, e.y, 3)
      const m = makeEnemy(live, 'micro', 'minion', at.x, at.y)
      m.t = 0.25
      m.kbx = side * 40
      live.enemies.push(m)
    }
    sfx(live, 'summon')
  }
  const hasFuse = live.strikes.some(one => one.from === e.id && one.after === 'pop')
  if ((e.type === 'leak' || e.affix === 'volatile') && !hasFuse) {
    strike(live, { shape: 'circle', x: e.x, y: e.y, r: 16, t: 0.55, dmg: Math.round(e.dmg * (e.type === 'leak' ? 1 : 0.8)), by: e.name, color: ORANGE, hitsFoes: true })
    sfx(live, 'warn')
  }
  if (e.affix === 'scinde') {
    for (const side of [-1, 1]) {
      const at = nearFree(live, e.x + side * 6, e.y, 3)
      const m = makeEnemy(live, 'larva', 'minion', at.x, at.y, tr(`Éclat de ${e.sig ?? e.name}`, `Fragment of ${e.sig ?? e.name}`))
      m.t = 0.3
      live.enemies.push(m)
    }
  }
  live.signals.push({ k: 'kill', name: e.name, kind: e.kind, level: e.level, sig: e.sig })
}

function hurtPlayer(live: Live, amount: number, from: Enemy | null, killer: string, sx?: number, sy?: number) {
  const p = live.player
  if (p.iframes > 0 || live.isDead) return
  const s = live.stats
  if (rnd(live) < s.dodge) {
    num(live, p.x, p.y - 12, tr('esquive', 'dodge'), [109, 194, 202])
    p.iframes = 0.3
    return
  }
  amount = FX.onPlayerHurt(live, amount, from) // build: armour, shield
  if (amount <= 0) return
  p.hp -= amount
  p.iframes = 0.6
  p.flash = 0.28
  live.shake = Math.max(live.shake, 0.28)
  freeze(live, 0.04)
  // A short slow-down, never back to back: in a crowd blows land often.
  if (live.t - (live.lastSlowAt ?? -9) > 2) {
    live.slow = Math.max(live.slow ?? 0, 0.12)
    live.lastSlowAt = live.t
  }
  sfx(live, 'hurt')
  num(live, p.x, p.y - 13, `-${amount}`, [238, 112, 92], true)
  sparks(live, p.x, p.y - 4, 5, RED, 45)
  // Thrown back a step from what hit.
  const ox = sx ?? from?.x
  const oy = sy ?? from?.y
  if (ox !== undefined && oy !== undefined) {
    const [nx, ny] = norm(p.x - ox, p.y - oy)
    moveBody(live, p, nx * 3, ny * 3, 4)
  }
  if (from && s.thorns > 0) damageEnemy(live, from, s.thorns, false, 0, 0)
  if (p.hp <= 0) {
    if (p.defiance > 0) {
      p.defiance -= 1
      p.hp = Math.ceil(s.maxHp / 2)
      p.iframes = 1.5
      live.banner = { text: tr('Defi de la mort', 'Death Defiance'), ttl: 1.5 }
      live.signals.push({ k: 'revived' })
    } else {
      live.isDead = true
      live.signals.push({ k: 'died', killer })
    }
  }
}

// ---------- telegraphed strikes ----------

type StrikeIn = Partial<Strike> & { shape: Strike['shape']; x: number; y: number; t: number; dmg: number; by: string; color: RGB }

function strike(live: Live, s: StrikeIn): Strike {
  const full: Strike = {
    x2: s.x, y2: s.y, r: 8, a: 0, half: 0, max: s.t, from: 0, isTied: false, isFollowing: false, hitsFoes: false, isLaser: false, after: '', mine: 0, zone: 0,
    ...s,
  }
  live.strikes.push(full)
  return full
}

/** A band right across the room, along a row or a column. */
function lane(live: Live, isRow: boolean, at: number, half: number, t: number, dmg: number, by: string, from: number, color: RGB = RED) {
  if (isRow) strike(live, { shape: 'band', x: ROOM.x0, y: at, x2: ROOM.x1, y2: at, r: half, t, dmg, by, color, from, isTied: true })
  else strike(live, { shape: 'band', x: at, y: ROOM.y0, x2: at, y2: ROOM.y1, r: half, t, dmg, by, color, from, isTied: true })
}

/** Whether a point (with a margin) stands in a strike's shape. */
export function inStrike(s: Strike, x: number, y: number, pad: number): boolean {
  if (s.shape === 'circle') return dist(x, y, s.x, s.y) <= s.r + pad
  if (s.shape === 'cone') {
    const d = dist(x, y, s.x, s.y)
    if (d > s.r + pad) return false
    if (d < 3) return true
    const a = Math.atan2(y - s.y, x - s.x) - s.a
    return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= s.half + pad / Math.max(4, d)
  }
  const dx = s.x2 - s.x
  const dy = s.y2 - s.y
  const L2 = dx * dx + dy * dy || 1
  const u = Math.max(0, Math.min(1, ((x - s.x) * dx + (y - s.y) * dy) / L2))
  return dist(x, y, s.x + dx * u, s.y + dy * u) <= s.r + pad
}

function updateStrikes(live: Live, dt: number) {
  const p = live.player
  for (const s of [...live.strikes]) {
    if (s.mine > 0) {
      // A mine: armed after a moment, it trips when the champion comes near, or when it rots.
      s.mine -= dt
      const isArmed = s.mine < 6.4
      if ((isArmed && dist(p.x, p.y, s.x, s.y) < s.r - 2) || s.mine <= 0) {
        s.mine = 0
        s.t = s.max = 0.5
        sfx(live, 'warn')
      }
      continue
    }
    if (s.zone > 0) {
      s.zone -= dt
      if (inStrike(s, p.x, p.y, 1)) hurtPlayer(live, s.dmg, null, s.by)
      if (s.zone <= 0) live.strikes = live.strikes.filter(one => one !== s)
      continue
    }
    if (s.from) {
      const src = live.enemies.find(one => one.id === s.from)
      if (!src && s.isTied) { live.strikes = live.strikes.filter(one => one !== s); continue }
      if (src && s.isFollowing) {
        s.x = src.x
        s.y = src.y
      }
    }
    s.t -= dt
    if (s.t > 0) continue
    live.strikes = live.strikes.filter(one => one !== s)
    resolveStrike(live, s)
  }
}

function resolveStrike(live: Live, s: Strike) {
  const p = live.player
  const src = s.from ? live.enemies.find(one => one.id === s.from) ?? null : null
  if (s.dmg > 0) {
    if (inStrike(s, p.x, p.y - 2, 2.5)) hurtPlayer(live, s.dmg, src, s.by, s.x, s.y)
    if (s.hitsFoes) {
      for (const e of [...live.enemies]) {
        if (e === src || e.type === 'boss' || !inStrike(s, e.x, e.y, e.r)) continue
        const [nx, ny] = norm(e.x - s.x, e.y - s.y)
        damageEnemy(live, e, s.dmg, false, nx * 4, ny * 4)
      }
    }
    if (s.shape === 'circle') {
      live.fx.push({ kind: 'ring', x: s.x, y: s.y, ttl: 0.25, max: 0.25, color: s.color, r: s.r })
      sparks(live, s.x, s.y, Math.min(10, 3 + Math.round(s.r / 3)), s.color, s.r * 3)
      if (s.r >= 12) {
        live.shake = Math.max(live.shake, 0.22)
        sfx(live, 'explode')
      }
    } else if (s.shape === 'band') {
      live.fx.push({ kind: 'beam', x: s.x, y: s.y, x2: s.x2, y2: s.y2, w: s.r, ttl: 0.24, max: 0.24, color: s.color })
      live.shake = Math.max(live.shake, s.isLaser ? 0.1 : 0.18)
      sfx(live, 'explode')
    } else {
      live.fx.push({ kind: 'slash', x: s.x, y: s.y - 2, ttl: 0.14, max: 0.14, color: s.color, a: s.a, r: s.r })
    }
  }
  if (s.after === 'burn') strike(live, { shape: 'circle', x: s.x, y: s.y, r: s.r - 1, t: 0, dmg: Math.max(2, Math.round(s.dmg * 0.4)), by: s.by, color: ORANGE, zone: 2.4 })
  else if (s.after === 'summon' && s.spawn && live.enemies.length < 12) {
    const at = nearFree(live, s.x, s.y, ENEMY[s.spawn].r)
    const m = makeEnemy(live, s.spawn, 'minion', at.x, at.y, s.spawnName)
    m.t = 0.3
    live.enemies.push(m)
    live.fx.push({ kind: 'ring', x: at.x, y: at.y - 2, ttl: 0.3, max: 0.3, color: PURPLE, r: 7 })
  } else if (s.after === 'pop' && src) {
    // The leak bursts: gone, with nothing to show for it.
    gibs(live, src, 6)
    live.enemies = live.enemies.filter(one => one !== src)
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
    if (stun > 0 && e.hp > 0 && e.type !== 'boss' && !e.hidden) { e.state = 'stun'; e.t = stun; e.vx = 0; e.vy = 0 }
  }
}

function shoot(live: Live, kind: Proj['kind'], dir: [number, number], speed: number, dmg: number, extra: Partial<Proj> = {}) {
  const p = live.player
  live.projs.push({
    id: live.nextId++, kind, team: 'p', x: p.x + dir[0] * 5, y: p.y - 3 + dir[1] * 5, vx: dir[0] * speed, vy: dir[1] * speed,
    r: 2, dmg, ttl: 1.6, pierce: false, hits: [], isReturning: false, bounces: 0, isLodging: false, heal: 0, ...extra,
  })
  FX.onShoot(live, live.projs[live.projs.length - 1]) // build: size, pierce, homing, ricochet
  sfx(live, 'shoot')
}

function rotate([x, y]: [number, number], a: number): [number, number] {
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
}

function doAttack(live: Live) {
  FX.onAttack(live) // build: hits count as 'attack'; extra shots
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
      live.fx.push({ kind: 'slash', x: p.x, y: p.y - 3, ttl: 0.14, max: 0.14, color: heavy ? YELLOW : [222, 238, 214], a: Math.atan2(dir[1], dir[0]), r: heavy ? 19 : 15 })
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
  FX.onSpecial(live) // build: hits count as 'special'
  const p = live.player
  const s = live.stats
  const mult = s.dmg * s.specialMult * factor
  switch (live.weapon) {
    case 'epee':
      ringHit(live, p.x, p.y, 22, 18 * mult, 8, s.specialStun)
      live.fx.push({ kind: 'ring', x: p.x, y: p.y - 2, ttl: 0.25, max: 0.25, color: YELLOW, r: 22 })
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
    num(live, p.x, p.y - 12, tr('vide', 'empty'), [117, 113, 97])
    return
  }
  live.ammo -= 1
  FX.onCast(live) // build: hits count as 'cast'
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
  FX.onDash(live) // build: dash charges, shield, lightning
  sfx(live, 'dash')
}

// ---------- the step ----------

const BUFFER = 0.18

export function step(live: Live, input: Input, dtIn: number) {
  let dt = Math.min(dtIn, 0.05)
  if (live.isDead) return
  if (!live.strikes) live.strikes = []
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
  // A solid blow freezes the world for a beat; whatever is left of the tick still runs.
  if (live.hitstop > 0) {
    const used = Math.min(live.hitstop, dt)
    live.hitstop -= used
    dt -= used
    if (dt < 0.004) return
  }
  // A hurt champion sees the world slow down for a moment.
  if ((live.slow ?? 0) > 0) {
    live.slow = Math.max(0, live.slow - dt)
    dt *= 0.6
  }
  updatePlayer(live, input, dt)
  FX.tickEffects(live, dt, damageEnemy) // build: statuses, orbitals, homing, queued bursts
  updateProjs(live, dt)
  updateEnemies(live, dt)
  updateStrikes(live, dt)
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
      live.strikes = []
      live.banner = { text: tr('Salle nettoyee', 'Room cleared'), ttl: 1.2 }
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
    if (s.dashTrail > 0) live.fx.push({ kind: 'spike', x: ox, y: oy, ttl: 1.2, max: 1.2, color: GREEN, dmg: s.dashTrail * s.dmg, hits: [] })
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
        if (pr.team === 'e') live.fx.push({ kind: 'spark', x: pr.x, y: pr.y, ttl: 0.18, max: 0.18, color: [222, 238, 214], a: Math.atan2(-pr.vy, -pr.vx), r: 25 })
        remove(live, pr)
        continue
      }
    } else {
      pr.x = nx
      pr.y = ny
    }
    if (pr.team === 'e') {
      // A small heart to hit: bullets graze the cape and miss.
      if (dist(pr.x, pr.y, p.x, p.y - 3) < pr.r + 2.5) {
        hurtPlayer(live, pr.dmg, null, pr.by ?? NAMES.slug, pr.x - pr.vx, pr.y - pr.vy)
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
      FX.onProjHit(live, pr, e) // build: the shot's source; ricochet
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

function enemyShot(live: Live, e: Enemy, kind: Proj['kind'], dx: number, dy: number, speed: number, dmg: number, tone = 0) {
  if (live.projs.length > 240) return
  live.projs.push({
    id: live.nextId++, kind, team: 'e', x: e.x + dx * (e.r - 1), y: e.y - 3 + dy * (e.r - 1), vx: dx * speed, vy: dy * speed, r: kind === 'shot' ? 1.5 : 2,
    dmg, ttl: 3.6, pierce: false, hits: [], isReturning: false, bounces: 0, isLodging: false, heal: 0, by: e.name, tone,
  })
}

function ring(live: Live, e: Enemy, n: number, speed: number, dmg: number, offset: number, tone = 0) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + offset
    enemyShot(live, e, 'orb', Math.cos(a), Math.sin(a), speed, dmg, tone)
  }
}

function speedOf(e: Enemy): number {
  return e.speed * ((e.buff ?? 0) > 0 ? 1.3 : 1)
}

function updateEnemies(live: Live, dt: number) {
  const p = live.player
  for (const e of [...live.enemies]) {
    if (!live.enemies.includes(e)) continue
    e.flash = Math.max(0, e.flash - dt)
    e.squash = Math.max(0, (e.squash ?? 0) - dt * 6)
    e.buff = Math.max(0, (e.buff ?? 0) - dt)
    // Knockback dies away over a few frames: the body slides, it does not teleport.
    const kbx = e.kbx ?? 0
    const kby = e.kby ?? 0
    if (Math.abs(kbx) + Math.abs(kby) > 0.5) {
      moveBody(live, e, kbx * dt, kby * dt, e.r)
      const k = Math.exp(-dt * 12)
      e.kbx = kbx * k
      e.kby = kby * k
    } else {
      e.kbx = 0
      e.kby = 0
    }
    e.t -= dt
    if (e.type === 'boss') { updateBoss(live, e, dt); continue }
    if (e.type === 'burrower' && (e.hidden || e.state === 'chase')) { updateBurrower(live, e, dt); continue }
    const def = ENEMY[e.type]
    if (e.type === 'sentinel') {
      // The shield swings round toward the champion, slower than he can circle.
      const want = Math.atan2(p.y - e.y, p.x - e.x)
      const diff = Math.atan2(Math.sin(want - (e.faceA ?? 0)), Math.cos(want - (e.faceA ?? 0)))
      const turn = (e.state === 'act' ? 0 : e.state === 'windup' ? 0.8 : 2.1) * dt
      e.faceA = (e.faceA ?? 0) + Math.max(-turn, Math.min(turn, diff))
    }
    switch (e.state) {
      case 'spawn':
      case 'stun':
        if (e.t <= 0) { e.state = 'chase'; e.t = def.cd * (0.5 + rnd(live)) }
        break
      case 'chase': {
        const d = dist(e.x, e.y, p.x, p.y)
        chaseMove(live, e, d, dt)
        if (e.t <= 0 && isReady(live, e, d)) beginWindup(live, e)
        break
      }
      case 'windup':
        if (e.type === 'sniper' && e.t > 0.3) {
          // The laser follows the champion, a touch late, then locks.
          const k = Math.min(1, dt * 7)
          e.aimX += (p.x - e.aimX) * k
          e.aimY += (p.y - 3 - e.aimY) * k
          if (e.t - dt <= 0.3) sfx(live, 'warn')
        }
        if (e.t <= 0) startAct(live, e)
        break
      case 'act': {
        if (e.vx !== 0 || e.vy !== 0) {
          const isWall = moveBody(live, e, e.vx * dt, e.vy * dt, e.r)
          if (!e.hasHit && dist(e.x, e.y, p.x, p.y) < e.r + 4) {
            e.hasHit = true
            hurtPlayer(live, e.dmg, e, e.name)
          }
          if (isWall) {
            e.t = 0
            if (e.type === 'skeleton') {
              live.shake = Math.max(live.shake, 0.12)
              sparks(live, e.x, e.y - 2, 4, [222, 238, 214], 30)
            }
          }
        }
        if (e.t <= 0) {
          e.vx = 0
          e.vy = 0
          e.state = 'recover'
          e.t = def.recover * (e.affix === 'rapide' ? 0.8 : 1)
          e.tMax = e.t
        }
        break
      }
      case 'recover':
        if (e.t <= 0) {
          e.state = 'chase'
          e.t = 0
        }
        break
    }
  }
  // Keep bodies apart.
  for (let i = 0; i < live.enemies.length; i++) {
    for (let j = i + 1; j < live.enemies.length; j++) {
      const a = live.enemies[i]!
      const b = live.enemies[j]!
      if (a.hidden || b.hidden) continue
      const d = dist(a.x, a.y, b.x, b.y)
      const min = a.r + b.r
      if (d > 0 && d < min) {
        const push = (min - d) / 2
        const [nx, ny] = norm(b.x - a.x, b.y - a.y)
        if (a.type !== 'boss' && a.type !== 'turret') moveBody(live, a, -nx * push, -ny * push, a.r)
        if (b.type !== 'boss' && b.type !== 'turret') moveBody(live, b, nx * push, ny * push, b.r)
      }
    }
  }
}

/** How a foe moves while it looks for an opening. */
function chaseMove(live: Live, e: Enemy, d: number, dt: number) {
  const p = live.player
  const def = ENEMY[e.type]
  if (def.speed === 0) return
  const [nx, ny] = norm(p.x - e.x, p.y - e.y)
  const sp = speedOf(e) * dt
  if (e.detour > 0) {
    e.detour -= dt
    moveBody(live, e, e.detourX * sp, e.detourY * sp, e.r)
    return
  }
  const hasFriends = e.type === 'reviewer' && live.enemies.some(one => one !== e && one.type !== 'reviewer' && !one.hidden)
  const keep = e.type === 'reviewer' && !hasFriends ? 0 : def.keep
  let mx = nx
  let my = ny
  if (keep > 0) {
    // Shooters hold their distance, and sidestep while they wait.
    const side = Math.floor(live.t / 2.2 + e.id * 0.7) % 2 === 0 ? 1 : -1
    if (d < keep - 8) { mx = -nx; my = -ny }
    else if (d < keep + 8) { mx = -ny * side * 0.7; my = nx * side * 0.7 }
  } else if (e.type === 'bug' || e.type === 'larva') {
    // The small ones skitter.
    const w = Math.sin(live.t * 9 + e.id * 2.1) * 0.9
    mx = nx - ny * w
    my = ny + nx * w
  }
  const ox = e.x
  const oy = e.y
  moveBody(live, e, mx * sp, my * sp, e.r)
  // Walked into a pillar: go around it for a moment.
  if (Math.hypot(e.x - ox, e.y - oy) < sp * 0.3 && (mx !== 0 || my !== 0)) {
    const side = e.id % 2 === 0 ? 1 : -1
    e.detour = 0.5
    e.detourX = -my * side
    e.detourY = mx * side
  }
}

function isReady(live: Live, e: Enemy, d: number): boolean {
  const def = ENEMY[e.type]
  switch (e.type) {
    case 'forker':
      return d <= def.range && live.enemies.filter(one => isZombie(one.name)).length < 4 && (e.seq ?? 0) < 8
    case 'miner':
      return live.strikes.filter(s => s.from === e.id && s.mine > 0).length < 3 && d < 90
    case 'reviewer':
      return live.enemies.some(one => one !== e && !one.hidden && one.state !== 'spawn' && one.hp < one.maxHp && dist(one.x, one.y, e.x, e.y) < 70) || d <= def.range
    case 'turret':
      return true
    default:
      return d <= def.range
  }
}

function beginWindup(live: Live, e: Enemy) {
  const p = live.player
  const def = ENEMY[e.type]
  e.state = 'windup'
  e.aimX = p.x
  e.aimY = p.y
  e.hasHit = false
  e.t = def.windup * (e.affix === 'rapide' ? 0.85 : 1)
  e.tMax = e.t
  const a = Math.atan2(p.y - e.y, p.x - e.x)
  switch (e.type) {
    case 'goblin':
      strike(live, { shape: 'cone', x: e.x, y: e.y, r: 15, a, half: 0.9, t: e.t, dmg: e.dmg, by: e.name, color: RED, from: e.id, isTied: true, isFollowing: true })
      break
    case 'sentinel':
      strike(live, { shape: 'cone', x: e.x, y: e.y, r: 18, a: e.faceA ?? a, half: 0.6, t: e.t, dmg: e.dmg, by: e.name, color: RED, from: e.id, isTied: true, isFollowing: true })
      break
    case 'monolith':
      strike(live, { shape: 'circle', x: e.x, y: e.y, r: 16, t: e.t, dmg: e.dmg, by: e.name, color: RED, from: e.id, isTied: true, isFollowing: true })
      break
    case 'leak':
      // It swells: the blast lands even if it dies first.
      strike(live, { shape: 'circle', x: e.x, y: e.y, r: 17, t: e.t, dmg: e.dmg, by: e.name, color: ORANGE, from: e.id, isFollowing: true, hitsFoes: true, after: 'pop' })
      sfx(live, 'warn')
      break
    case 'forker':
      for (let i = 0; i < 2; i++) {
        const at = nearFree(live, e.x + (i === 0 ? -12 : 12), e.y + 6, 3)
        strike(live, { shape: 'circle', x: at.x, y: at.y, r: 5, t: e.t, dmg: 0, by: e.name, color: PURPLE, from: e.id, isTied: true, after: 'summon', spawn: 'larva', spawnName: tr('Processus Zombie', 'Zombie Process') })
      }
      e.seq = (e.seq ?? 0) + 2
      break
    case 'reviewer': {
      const near = live.enemies.filter(one => one !== e && !one.hidden && one.state !== 'spawn' && dist(one.x, one.y, e.x, e.y) < 70)
      if (near.length === 0) {
        strike(live, { shape: 'cone', x: e.x, y: e.y, r: 13, a, half: 0.8, t: e.t, dmg: e.dmg, by: e.name, color: RED, from: e.id, isTied: true, isFollowing: true })
        e.pattern = 0
      } else {
        for (const one of near) live.fx.push({ kind: 'tele', x: one.x, y: one.y, r: one.r + 3, ttl: e.t, max: e.t, color: GREEN })
        e.pattern = 1
      }
      break
    }
    case 'turret':
      e.pattern += 1
      break
  }
}

function startAct(live: Live, e: Enemy) {
  const def = ENEMY[e.type]
  e.state = 'act'
  e.t = def.act
  e.tMax = e.t
  const [nx, ny] = norm(e.aimX - e.x, e.aimY - e.y)
  switch (e.type) {
    case 'rat':
    case 'larva':
    case 'bug':
    case 'micro':
      // A lunge along the line it showed.
      e.vx = nx * (e.type === 'rat' ? 125 : 105)
      e.vy = ny * (e.type === 'rat' ? 125 : 105)
      // Already at the champion's throat: the bite lands at once.
      if (dist(e.x, e.y, live.player.x, live.player.y) < e.r + 4) {
        e.hasHit = true
        hurtPlayer(live, e.dmg, e, e.name)
      }
      break
    case 'goblin':
    case 'sentinel':
    case 'monolith':
      moveBody(live, e, nx * 3, ny * 3, e.r)
      if (e.type === 'monolith') live.shake = Math.max(live.shake, 0.12)
      break
    case 'skeleton':
      e.vx = nx * 190
      e.vy = ny * 190
      break
    case 'slug':
      enemyShot(live, e, 'spit', nx, ny, 85, e.dmg)
      sfx(live, 'shoot')
      break
    case 'linter':
      for (let i = -2; i <= 2; i++) {
        const [dx, dy] = rotate([nx, ny], i * 0.26)
        enemyShot(live, e, 'spit', dx, dy, 68, e.dmg)
      }
      sfx(live, 'shoot')
      break
    case 'sniper':
      enemyShot(live, e, 'shot', nx, ny, 250, e.dmg)
      sfx(live, 'shoot')
      break
    case 'turret': {
      const off = e.pattern % 2 === 0 ? 0 : Math.PI / 4
      for (let i = 0; i < 4; i++) {
        const a = off + (i * Math.PI) / 2
        enemyShot(live, e, 'orb', Math.cos(a), Math.sin(a), 62, e.dmg)
        enemyShot(live, e, 'orb', Math.cos(a), Math.sin(a), 46, e.dmg)
      }
      sfx(live, 'shoot')
      break
    }
    case 'miner':
      // A breakpoint on the floor, waiting for a step.
      strike(live, { shape: 'circle', x: e.x, y: e.y, r: 14, t: 0.5, dmg: e.dmg, by: e.name, color: RED, from: e.id, hitsFoes: true, mine: 7 })
      break
    case 'forker':
      sfx(live, 'summon')
      break
    case 'reviewer':
      if (e.pattern === 1) {
        for (const one of live.enemies) {
          if (one === e || one.hidden || dist(one.x, one.y, e.x, e.y) > 74) continue
          // A modest top-up of what was lost, not a third of the bar.
          const heal = Math.min(one.maxHp - one.hp, Math.round(one.maxHp * 0.12))
          if (heal <= 0) continue
          one.hp += heal
          one.buff = 4
          live.fx.push({ kind: 'ring', x: one.x, y: one.y - 2, ttl: 0.4, max: 0.4, color: GREEN, r: one.r + 4 })
          num(live, one.x, one.y - one.r - 6, `+${heal}`, GREEN)
        }
        live.fx.push({ kind: 'ring', x: e.x, y: e.y - 2, ttl: 0.5, max: 0.5, color: GREEN, r: 30 })
      }
      break
  }
}

/** The cache worm: under the floor toward the champion, a marked spot, an eruption, a breath in the open. */
function updateBurrower(live: Live, e: Enemy, dt: number) {
  const p = live.player
  if (!e.hidden) {
    e.hidden = true
    e.state = 'spawn'
    e.pattern = 0
    e.t = 1.1 + rnd(live) * 0.6
    sfx(live, 'burrow')
    dirt(live, e.x, e.y, 6)
    return
  }
  if (e.pattern === 0) {
    const [nx, ny] = norm(p.x - e.x, p.y - e.y)
    moveBody(live, e, nx * speedOf(e) * dt, ny * speedOf(e) * dt, 3)
    if (rnd(live) < dt * 10) dirt(live, e.x, e.y, 1)
    if (e.t <= 0) {
      const at = nearFree(live, p.x, p.y, 4)
      e.x = at.x
      e.y = at.y
      e.pattern = 1
      e.t = ENEMY.burrower.windup
      e.tMax = e.t
      strike(live, { shape: 'circle', x: at.x, y: at.y, r: 11, t: e.t, dmg: e.dmg, by: e.name, color: ORANGE, from: e.id })
      sfx(live, 'warn')
    }
    return
  }
  if (e.t <= 0) {
    e.hidden = false
    e.state = 'recover'
    e.t = ENEMY.burrower.recover
    e.tMax = e.t
    e.pattern = 0
    sfx(live, 'burrow')
    dirt(live, e.x, e.y, 10)
    if (live.depth >= 6) for (let i = 0; i < 6; i++) enemyShot(live, e, 'spit', Math.cos(i * 1.047 + 0.5), Math.sin(i * 1.047 + 0.5), 55, Math.round(e.dmg * 0.6))
  }
}

function dirt(live: Live, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = rnd(live) * Math.PI * 2
    live.fx.push({ kind: 'gib', x, y, ttl: 0.5 + rnd(live) * 0.3, max: 0.8, color: rnd(live) < 0.5 ? [133, 76, 48] : [86, 48, 34], vx: Math.cos(a) * 20, vy: Math.sin(a) * 12, z: 1, vz: 30 + rnd(live) * 30, r: 0.5 })
  }
}

// ---------- the guardians' fight ----------

function updateBoss(live: Live, e: Enemy, dt: number) {
  const p = live.player
  const g = GUARDIANS[e.boss ?? 0] ?? GUARDIANS[0]!
  const isP2 = (e.phase ?? 1) === 2
  e.inv = Math.max(0, (e.inv ?? 0) - dt)
  if (!isP2 && e.hp <= e.maxHp / 2 && e.state !== 'spawn') { phaseShift(live, e, g); return }
  const d = dist(e.x, e.y, p.x, p.y)
  const [nx, ny] = norm(p.x - e.x, p.y - e.y)
  switch (e.state) {
    case 'spawn':
    case 'stun':
      if (e.t <= 0) { e.state = 'chase'; e.t = isP2 ? 0.5 : 0.9 }
      break
    case 'chase': {
      // It keeps the champion at arm's length, circling.
      const sp = ENEMY.boss.speed * (isP2 ? 1.25 : 1) * dt
      const side = Math.floor(live.t / 3) % 2 === 0 ? 1 : -1
      if (d > 48) moveBody(live, e, nx * sp, ny * sp, e.r)
      else if (d < 28) moveBody(live, e, -nx * sp, -ny * sp, e.r)
      else moveBody(live, e, -ny * sp * 0.6 * side, nx * sp * 0.6 * side, e.r)
      if (e.t <= 0) bossWindup(live, e, g, isP2)
      break
    }
    case 'windup':
      if (e.t <= 0) bossAct(live, e, isP2)
      break
    case 'act':
      bossActing(live, e, isP2, dt)
      if (e.t <= 0) {
        e.vx = 0
        e.vy = 0
        if (e.move === 'charge' && isP2 && (e.seq ?? 0) === 0) {
          // Twice in a row once it is angry.
          e.seq = 1
          e.state = 'windup'
          e.aimX = p.x
          e.aimY = p.y
          e.t = e.tMax = 0.5
          chargeTele(live, e)
        } else {
          e.state = 'recover'
          e.t = e.tMax = isP2 ? 0.5 : 0.85
        }
      }
      break
    case 'recover':
      if (e.t <= 0) {
        e.state = 'chase'
        e.pattern += 1
        e.t = isP2 ? 0.4 : 0.75
      }
      break
  }
}

function phaseShift(live: Live, e: Enemy, g: GuardianDef) {
  const p = live.player
  e.phase = 2
  e.state = 'stun'
  e.t = e.tMax = 1.5
  e.inv = 1.5
  e.vx = 0
  e.vy = 0
  e.pattern = 0
  live.strikes = live.strikes.filter(s => s.from !== e.id)
  // A breath: the shots in the air fade, the champion is thrown clear.
  for (const pr of live.projs) if (pr.team === 'e') live.fx.push({ kind: 'spark', x: pr.x, y: pr.y, ttl: 0.3, max: 0.3, color: [222, 238, 214], a: 0, r: 0 })
  live.projs = live.projs.filter(one => one.team === 'p')
  const [nx, ny] = norm(p.x - e.x, p.y - e.y)
  if (dist(p.x, p.y, e.x, e.y) < 34) moveBody(live, p, nx * 12, ny * 12, 4)
  live.banner = { text: g.roar, ttl: 1.8 }
  live.shake = Math.max(live.shake, 0.8)
  freeze(live, 0.25, true)
  live.fx.push({ kind: 'flash', x: 0, y: 0, ttl: 0.4, max: 0.4, color: [222, 238, 214] })
  live.fx.push({ kind: 'ring', x: e.x, y: e.y - e.r, ttl: 0.6, max: 0.6, color: e.kind === 'nemesis' ? [200, 60, 160] : RED, r: 46 })
  sparks(live, e.x, e.y - e.r, 16, YELLOW, 70)
  sfx(live, 'phase')
  live.signals.push({ k: 'log', text: `☠ ${e.name.split(',')[0]} : ${g.roar}` })
}

function chargeTele(live: Live, e: Enemy) {
  const [nx, ny] = norm(e.aimX - e.x, e.aimY - e.y)
  const L = rayToWall(live, e.x, e.y, nx, ny, 160)
  strike(live, { shape: 'band', x: e.x, y: e.y, x2: e.x + nx * L, y2: e.y + ny * L, r: e.r, t: e.t, dmg: 0, by: e.name, color: RED, from: e.id, isTied: true })
}

function bossWindup(live: Live, e: Enemy, g: GuardianDef, isP2: boolean) {
  const p = live.player
  const list = isP2 ? g.p2 : g.p1
  const move = list[e.pattern % list.length]!
  e.move = move
  e.state = 'windup'
  e.aimX = p.x
  e.aimY = p.y
  e.hasHit = false
  e.seq = 0
  e.t = e.tMax = BOSS_WIND[move] * (isP2 ? 0.88 : 1)
  sfx(live, 'warn')
  const dmg = Math.round(e.dmg * 1.1)
  const by = e.name
  switch (move) {
    case 'charge':
      chargeTele(live, e)
      break
    case 'slam':
      strike(live, { shape: 'circle', x: e.x, y: e.y, r: 28, t: e.t, dmg: Math.round(e.dmg * 1.3), by, color: RED, from: e.id, isTied: true, isFollowing: true })
      break
    case 'rows': {
      // Five lanes, three of them struck: find a gap.
      const safe = rint(live, 5)
      const safe2 = (safe + 2 + rint(live, 2)) % 5
      const h = (ROOM.y1 - ROOM.y0) / 5
      for (let i = 0; i < 5; i++) if (i !== safe && i !== safe2) lane(live, true, ROOM.y0 + h * (i + 0.5), h / 2 - 0.5, e.t, dmg, by, e.id)
      break
    }
    case 'cols': {
      const off = rint(live, 2)
      const w = (ROOM.x1 - ROOM.x0) / 8
      for (let i = 0; i < 8; i++) if (i % 2 === off) lane(live, false, ROOM.x0 + w * (i + 0.5), w / 2 - 0.5, e.t, dmg, by, e.id, ORANGE)
      break
    }
    case 'cross':
      lane(live, true, p.y - 2, 5, e.t, dmg, by, e.id)
      lane(live, false, p.x, 5, e.t, dmg, by, e.id)
      if (isP2) {
        lane(live, true, Math.max(ROOM.y0 + 6, Math.min(ROOM.y1 - 6, p.y - 2 + (p.y < MID_Y ? 26 : -26))), 5, e.t + 0.35, dmg, by, e.id, ORANGE)
        lane(live, false, Math.max(ROOM.x0 + 6, Math.min(ROOM.x1 - 6, p.x + (p.x < 80 ? 30 : -30))), 5, e.t + 0.35, dmg, by, e.id, ORANGE)
      }
      break
    case 'grid': {
      const h = (ROOM.y1 - ROOM.y0) / 5
      const w = (ROOM.x1 - ROOM.x0) / 8
      const row = rint(live, 2)
      const col = rint(live, 2)
      for (let i = 0; i < 5; i++) if (i % 2 === row) lane(live, true, ROOM.y0 + h * (i + 0.5), h / 2 - 2, e.t, dmg, by, e.id)
      for (let i = 0; i < 8; i++) if (i % 2 === col) lane(live, false, ROOM.x0 + w * (i + 0.5), w / 2 - 2, e.t + 0.5, dmg, by, e.id, ORANGE)
      break
    }
    case 'rain': {
      // Incidents falling: one on the champion, the rest around him, landing one after the other.
      const n = isP2 ? 8 : 5
      for (let i = 0; i < n; i++) {
        const a = rnd(live) * Math.PI * 2
        const r = i === 0 ? 0 : 14 + rnd(live) * 30
        const x = Math.max(ROOM.x0 + 8, Math.min(ROOM.x1 - 8, p.x + Math.cos(a) * r))
        const y = Math.max(ROOM.y0 + 8, Math.min(ROOM.y1 - 6, p.y + Math.sin(a) * r * 0.7))
        strike(live, { shape: 'circle', x, y, r: 9, t: e.t + i * 0.12, dmg, by, color: ORANGE, from: e.id, after: g.isBurning ? 'burn' : '' })
      }
      break
    }
    case 'summon': {
      const n = g.addCount + (isP2 ? 1 : 0)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd(live)
        const at = nearFree(live, e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 16 + 6, 4)
        strike(live, { shape: 'circle', x: at.x, y: at.y, r: 5, t: e.t, dmg: 0, by, color: PURPLE, from: e.id, isTied: true, after: 'summon', spawn: g.adds, spawnName: g.addName })
      }
      break
    }
    case 'snipe': {
      // The heads take aim: one laser each, a beat apart.
      const n = isP2 ? 5 : 3
      const base = Math.atan2(p.y - e.y, p.x - e.x)
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.32
        // From the heads, up on their necks.
        const hx = e.x + Math.cos(a) * 9
        const hy = e.y - 15 + Math.sin(a) * 3
        const L = rayToWall(live, hx, hy, Math.cos(a), Math.sin(a), 200)
        strike(live, { shape: 'band', x: hx, y: hy, x2: hx + Math.cos(a) * L, y2: hy + Math.sin(a) * L, r: 2.5, t: e.t + Math.abs(i - (n - 1) / 2) * 0.22, dmg, by, color: RED, from: e.id, isTied: true, isLaser: true })
      }
      break
    }
    default:
      break
  }
}

function bossAct(live: Live, e: Enemy, isP2: boolean) {
  e.state = 'act'
  e.seq = 0
  const [nx, ny] = norm(e.aimX - e.x, e.aimY - e.y)
  const shot = Math.round(e.dmg * 0.6)
  switch (e.move) {
    case 'burst':
      ring(live, e, isP2 ? 16 : 12, 60, shot, live.t, 0)
      e.t = e.tMax = 0.45
      sfx(live, 'shoot')
      break
    case 'spiral':
      e.spin = rnd(live) * Math.PI * 2
      e.detour = 0
      e.t = e.tMax = isP2 ? 2.6 : 2.0
      break
    case 'fan':
      fan(live, e, nx, ny, isP2 ? 7 : 5, shot)
      e.t = e.tMax = 0.5
      break
    case 'charge':
      e.vx = nx * 175
      e.vy = ny * 175
      e.t = e.tMax = 0.8
      break
    case 'slam':
      if (isP2) ring(live, e, 10, 50, shot, 0, 1)
      e.t = e.tMax = 0.35
      break
    default:
      e.t = e.tMax = 0.35
      if (e.move === 'summon') sfx(live, 'summon')
      break
  }
}

function fan(live: Live, e: Enemy, nx: number, ny: number, n: number, dmg: number) {
  for (let i = 0; i < n; i++) {
    const [dx, dy] = rotate([nx, ny], (i - (n - 1) / 2) * 0.2)
    enemyShot(live, e, 'orb', dx, dy, 78, dmg, 1)
  }
  sfx(live, 'shoot')
}

function bossActing(live: Live, e: Enemy, isP2: boolean, dt: number) {
  const p = live.player
  const shot = Math.round(e.dmg * 0.6)
  switch (e.move) {
    case 'spiral': {
      // Arms turning out of the guardian, two-tone.
      const arms = isP2 ? (e.boss === 2 ? 5 : 3) : 2
      const every = isP2 ? 0.11 : 0.13
      e.detour += dt
      while (e.detour >= every) {
        e.detour -= every
        for (let k = 0; k < arms; k++) {
          const a = (e.spin ?? 0) + (k * Math.PI * 2) / arms
          enemyShot(live, e, 'orb', Math.cos(a), Math.sin(a), 50, shot, k % 2)
        }
        e.spin = (e.spin ?? 0) + (isP2 ? 0.24 : 0.3) * (e.boss === 1 ? -1 : 1)
        if ((e.seq = (e.seq ?? 0) + 1) % 4 === 0) sfx(live, 'shoot')
      }
      break
    }
    case 'burst':
      if (isP2 && (e.seq ?? 0) === 0 && e.t < 0.2) {
        e.seq = 1
        ring(live, e, 16, 48, shot, live.t + Math.PI / 16, 1)
      }
      break
    case 'fan':
      if (isP2 && (e.seq ?? 0) === 0 && e.t < 0.25) {
        e.seq = 1
        const [nx, ny] = norm(p.x - e.x, p.y - e.y)
        fan(live, e, nx, ny, 6, shot)
      }
      break
    case 'charge': {
      const isWall = moveBody(live, e, e.vx * dt, e.vy * dt, e.r)
      if (!e.hasHit && dist(e.x, e.y, p.x, p.y) < e.r + 4) {
        e.hasHit = true
        hurtPlayer(live, Math.round(e.dmg * 1.2), e, e.name)
      }
      if (isWall) {
        e.t = 0
        live.shake = Math.max(live.shake, 0.35)
        sparks(live, e.x, e.y - 4, 10, [222, 238, 214], 50)
        sfx(live, 'explode')
        if (isP2) ring(live, e, 8, 55, shot, rnd(live), 1)
      }
      break
    }
    default:
      break
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
        live.signals.push({ k: 'buy', item: item.tag ?? item.kind, price })
      } else if (item.t > 1) {
        item.t = 0
        num(live, item.x, item.y - 10, `${price}`, RED)
      }
      continue
    }
    if (item.kind === 'heart' && p.hp >= live.stats.maxHp) continue
    live.pickups = live.pickups.filter(one => one !== item)
    if (item.kind === 'heart') {
      const n = Math.round(live.stats.maxHp * 0.2)
      p.hp = Math.min(live.stats.maxHp, p.hp + n)
      num(live, item.x, item.y - 8, `+${n}`, RED)
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
      num(live, item.x, item.y - 8, `+${n}`, [109, 194, 202])
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
      fx.r *= Math.exp(-dt * 4)
    } else if (fx.kind === 'gib') {
      // Bits fly up, fall, bounce once or twice and settle.
      fx.x += (fx.vx ?? 0) * dt
      fx.y += (fx.vy ?? 0) * dt
      fx.z = (fx.z ?? 0) + (fx.vz ?? 0) * dt
      fx.vz = (fx.vz ?? 0) - 170 * dt
      if (fx.z < 0) {
        fx.z = 0
        fx.vz = -(fx.vz ?? 0) * 0.35
        fx.vx = (fx.vx ?? 0) * 0.5
        fx.vy = (fx.vy ?? 0) * 0.5
      }
      if (fx.x < ROOM.x0 + 1 || fx.x > ROOM.x1 - 1) fx.vx = -(fx.vx ?? 0)
    } else if (fx.kind === 'num') {
      // Numbers jump up, then hang.
      const k = fx.ttl / fx.max
      fx.y -= (6 + 46 * k * k * k) * dt
    }
  }
  live.fx = live.fx.filter(fx => fx.ttl > 0)
  if (live.fx.length > 400) live.fx.splice(0, live.fx.length - 400)
}

/**
 * Freezes the world for a beat, at most once every 0.8 s unless `isMajor` (a guardian's
 * death, a phase change): many small freezes read as a game that stutters.
 */
function freeze(live: Live, secs: number, isMajor = false) {
  if (!isMajor && live.t - (live.lastFreezeAt ?? -9) < 0.8) return
  live.hitstop = Math.max(live.hitstop, secs)
  live.lastFreezeAt = live.t
}
