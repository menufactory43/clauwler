import type {
  BoonInst, Champion, ClassId, Ctx, ErrorSpawn, Feed, FloorRoom, GameState, Lineage, MenuAction, Nemesis, Relic,
  RoomKind, RunProgress, Save, SessionEvent, Side, WeaponId,
} from '../types'
import type { BoonDef, CombatStats } from './data'
import {
  ASPECTS, BOONS, BOSSES, CLASSES, DEFAULT_BIOMES, DEFAULT_CHAMBERS, DUO_BOONS, DUO_RARITY, ERROR_EPITHETS, ERROR_NAMES,
  GOD_BOONS, ITEMS, ITEM_RARITY, MIRROR, RARITY, RELIC_EFFECTS, SLOT_LABEL, WEAPONS, applyRelic, baseStats,
  boonValue, championName, godStatus, hash, relicLabel,
} from './data'
import { tr } from './i18n'
import type { BossSpec, RoomSpec } from './sim'

export const BIOMES = 3
export const RELIC_SLOTS = (level: number) => 2 + (level >= 5 ? 1 : 0) + (level >= 10 ? 1 : 0)
export const SEALS_PER_RELIC = 3
export const EDITS_PER_RUNE = 6
export const READS_PER_SCROLL = 8

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

function rng(seed: number) {
  let s = seed | 0
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- fresh records ----------

export function newFeed(): Feed {
  return {
    reads: 0, edits: 0, fails: 0, tests: 0, agents: 0, webs: 0, compactions: 0, commits: 0,
    touched: [], errorPool: [], chestPool: 0, familiarPool: 0, portalPool: 0, scrollPool: 0,
    runeCharge: 0, runeOffers: 0, seals: 0,
  }
}

export function newLineage(): Lineage {
  return { eclats: 0, mirror: {}, vault: [], chronicle: [], runs: 0, weapons: ['epee'], weapon: 'epee' }
}

export function newChampion(ctx: Ctx, cls: ClassId): Champion {
  return {
    key: ctx.repoKey, repoName: ctx.repoName, name: championName(ctx.repoKey), cls,
    level: 1, xp: 0, scars: [], equipped: [], nemeses: [], runs: 0, deaths: 0, victories: 0,
  }
}

export function championTitle(c: Champion): string {
  const label = CLASSES[c.cls].label
  return tr(`${c.name} ${/^[AEIOUÉ]/.test(label) ? "l'" : 'le '}${label}`, `${c.name} the ${label}`)
}

export const xpToLevel = (level: number) => 10 + level * 8

// ---------- stats ----------

export function combatStats(g: GameState): CombatStats {
  const c = g.champion
  const s = baseStats()
  CLASSES[c.cls].apply(s)
  s.maxHp += (c.level - 1) * 3
  s.dmg += (c.level - 1) * 0.02
  const m = g.lineage.mirror
  s.maxHp += 8 * (m.vigueur ?? 0)
  s.dmg += 0.08 * (m.force ?? 0)
  s.crit += 0.05 * (m.chance ?? 0)
  for (const id of c.equipped) {
    const relic = g.lineage.vault.find(one => one.id === id)
    if (relic) applyRelic(s, relic.effect, relic.value)
  }
  const run = g.run
  if (run) {
    s.maxHp += run.bonusHp
    const aspect = ASPECTS.find(one => one.id === run.aspect && one.weapon === run.weapon)
    if (aspect) aspect.apply(s)
    for (const boon of run.boons) {
      const def = BOONS.find(one => one.id === boon.id)
      if (def) def.apply(s, boonValue(def, boon.rarity, boon.level))
    }
    for (const id of run.items ?? []) ITEMS.find(one => one.id === id)?.apply(s, 1)
  }
  s.crit = Math.min(s.crit, 0.6)
  s.dodge = Math.min(s.dodge, 0.5)
  s.armor = Math.min(s.armor, 0.6)
  s.attackSpeed = Math.max(0.5, s.attackSpeed)
  s.maxHp = Math.max(10, s.maxHp)
  s.extraShots = Math.min(s.extraShots, 6)
  s.orbitals = Math.min(s.orbitals, 4)
  s.summons = Math.min(s.summons, 4)
  return s
}

export const fortune = (g: GameState) => 1 + 0.2 * (g.lineage.mirror.fortune ?? 0)

// ---------- logging ----------

function say(run: RunProgress, line: string) {
  run.log.push(line)
  if (run.log.length > 30) run.log.splice(0, run.log.length - 30)
}

export function log(g: GameState, line: string): GameState {
  const next = clone(g)
  if (next.run) say(next.run, line)
  return next
}

function notice(g: GameState, line: string) {
  g.notice.push(line)
  if (g.notice.length > 6) g.notice.splice(0, g.notice.length - 6)
}

function chronicle(g: GameState, at: string, text: string) {
  g.lineage.chronicle.push({ at, champ: championTitle(g.champion), repo: g.ctx.repoName, text })
  if (g.lineage.chronicle.length > 40) g.lineage.chronicle.splice(0, g.lineage.chronicle.length - 40)
}

// ---------- reading the session ----------

export function parseError(text: string): ErrorSpawn | null {
  for (const [re, sig, epithet] of ERROR_NAMES) {
    if (re.test(text)) {
      const name = sig === 'Error' ? ERROR_EPITHETS[hash(text.slice(0, 80)) % ERROR_EPITHETS.length]! : epithet
      return { sig, name: `${sig}, ${name}` }
    }
  }
  return null
}

export function isTestCommand(command: string): boolean {
  return /\b(jest|vitest|pytest|mocha|rspec|phpunit)\b|\b(npm|pnpm|yarn|bun)( run)? test\b|\b(cargo|go|swift|deno|mix) test\b|xcodebuild\b.*\btest\b|plugin test\b/.test(command)
}

export function commitMessage(command: string): string | null {
  if (!/\bgit\s+commit\b/.test(command)) return null
  const m = command.match(/-m\s+(?:"([^"]+)"|'([^']+)'|(\S+))/)
  const msg = (m?.[1] ?? m?.[2] ?? m?.[3] ?? 'commit').split('\n')[0]!.trim()
  return msg.length > 32 ? msg.slice(0, 31) + '…' : msg
}

// ---------- boot / end ----------

export type BootInput = {
  sessionId: string
  ctx: Ctx
  lineage: Lineage | undefined
  champion: Champion | undefined
  cls: ClassId
  save: Save | undefined
  now: string
}

export function boot(input: BootInput): GameState {
  const lineage = input.lineage ? { ...newLineage(), ...input.lineage } : newLineage()
  if (!lineage.weapons.includes('epee')) lineage.weapons.unshift('epee')
  const g: GameState = {
    sessionId: input.sessionId,
    ctx: input.ctx,
    mode: 'hall',
    champion: input.champion ?? newChampion(input.ctx, input.cls),
    lineage,
    run: null,
    feed: newFeed(),
    notice: [],
    epilogue: [],
    isPaused: true,
  }
  if (!input.champion) {
    notice(g, tr(`Un nouveau champion s'éveille pour ${input.ctx.repoName} : ${championTitle(g.champion)}.`, `A new champion awakens for ${input.ctx.repoName}: ${championTitle(g.champion)}.`))
    chronicle(g, input.now, tr(`${championTitle(g.champion)} prête serment au dépôt ${input.ctx.repoName}.`, `${championTitle(g.champion)} swears an oath to the ${input.ctx.repoName} repo.`))
  }
  const save = input.save
  const saved = save?.run && save.run.version === 3 ? save.run : null
  if (save && save.sessionId !== input.sessionId) {
    if (!save.isEnded) {
      settleNemeses(g, save.feed)
      if (saved) chronicle(g, input.now, tr(`${championTitle(g.champion)} s'est perdu dans « ${roomName(saved)} ».`, `${championTitle(g.champion)} got lost in "${roomName(saved)}".`))
    }
    g.run = saved
    if (g.run) {
      notice(g, save.isEnded
        ? tr(`Campement trouvé : ${g.run.biomeName}, « ${roomName(g.run)} ». [r] pour reprendre.`, `Camp found: ${g.run.biomeName}, "${roomName(g.run)}". [r] to resume.`)
        : tr(`Ton champion s'était perdu dans « ${roomName(g.run)} ». Il t'attend. [r] pour reprendre.`, `Your champion got lost in "${roomName(g.run)}". They are waiting for you. [r] to resume.`))
    }
  } else if (save && save.sessionId === input.sessionId) {
    g.run = saved
    g.feed = { ...newFeed(), ...save.feed }
  }
  return g
}

export function endSession(state: GameState, now: string): GameState {
  const g = clone(state)
  settleNemeses(g, g.feed)
  const f = g.feed
  if (g.run) {
    chronicle(g, now, tr(`${championTitle(g.champion)} dressa le camp dans « ${roomName(g.run)} » (${g.run.biomeName}).`, `${championTitle(g.champion)} made camp in "${roomName(g.run)}" (${g.run.biomeName}).`))
  } else if (f.reads + f.edits + f.fails + f.tests > 0) {
    chronicle(g, now, tr(`Session calme : ${f.edits} runes gravées, ${f.fails} créatures nées, ${f.commits} sceaux posés.`, `A quiet session: ${f.edits} runes carved, ${f.fails} creatures born, ${f.commits} seals set.`))
  }
  if (g.mode === 'run') g.mode = 'hall'
  return g
}

/** Errors the session raised and nobody slew climb into the Nemesis ranks. */
function settleNemeses(g: GameState, feed: Feed) {
  const counts = new Map<string, { spawn: ErrorSpawn; n: number }>()
  for (const spawn of feed.errorPool) {
    const one = counts.get(spawn.sig) ?? { spawn, n: 0 }
    one.n += 1
    counts.set(spawn.sig, one)
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 2)
  for (const { spawn } of top) {
    const known = g.champion.nemeses.find(n => n.sig === spawn.sig)
    if (known) {
      known.rank = Math.min(known.rank + 1, 9)
      notice(g, tr(`☠ ${known.name} a survécu. Il monte au rang ${known.rank}.`, `☠ ${known.name} survived. It climbs to rank ${known.rank}.`))
    } else {
      const nemesis: Nemesis = { sig: spawn.sig, name: spawn.name, glyph: spawn.sig.charAt(0).toUpperCase(), rank: 1 }
      g.champion.nemeses.push(nemesis)
      notice(g, tr(`☠ ${nemesis.name} rôde désormais dans ce dépôt (Némésis rang 1).`, `☠ ${nemesis.name} now prowls this repo (Nemesis rank 1).`))
    }
  }
  g.champion.nemeses = g.champion.nemeses.sort((a, b) => b.rank - a.rank).slice(0, 5)
  feed.errorPool = []
}

// ---------- session events ----------

/** What the session did. `isLive`: a room is being fought and takes the event itself. */
export function applyEvent(state: GameState, ev: SessionEvent, now: string, isLive: boolean): GameState {
  const g = clone(state)
  const f = g.feed
  const run = g.mode === 'run' ? g.run : null
  switch (ev.kind) {
    case 'read':
      f.reads += 1
      touch(f, ev.path)
      if (f.reads % READS_PER_SCROLL === 0 && !isLive) f.scrollPool += 1
      break
    case 'edit':
      f.edits += 1
      touch(f, ev.path)
      f.runeCharge += 1
      if (f.runeCharge >= EDITS_PER_RUNE) {
        f.runeCharge = 0
        if (run) {
          run.offerQueue += 1
          say(run, tr('✦ Les runes gravées par Claude crépitent : un bienfait t\'attend à la fin de la salle.', '✦ The runes Claude carved crackle: a boon awaits you at the end of the room.'))
        } else f.runeOffers += 1
      }
      break
    case 'fail':
      f.fails += 1
      // Live or not, the error is remembered: slain, it leaves the pool.
      f.errorPool.push({ sig: ev.sig, name: ev.name })
      if (f.errorPool.length > 12) f.errorPool.shift()
      break
    case 'test':
      f.tests += 1
      if (!isLive) f.chestPool += 1
      break
    case 'agent':
      f.agents += 1
      if (!isLive) f.familiarPool += 1
      break
    case 'web':
      f.webs += 1
      if (!isLive) f.portalPool += 1
      break
    case 'compact':
      f.compactions += 1
      break
    case 'commit': {
      f.commits += 1
      f.seals += 1
      if (f.seals >= SEALS_PER_RELIC) {
        f.seals = 0
        const relic = forgeRelic(g, tr(`Sceau de « ${ev.message} »`, `Seal of "${ev.message}"`), tr(`commit sur ${g.ctx.repoName}`, `commit on ${g.ctx.repoName}`), hash(ev.message + now))
        const line = tr(`⚒ Trois sceaux réunis : la relique « ${relic.name} » est forgée (${relicLabel(relic.effect, relic.value)}).`, `⚒ Three seals joined: the relic "${relic.name}" is forged (${relicLabel(relic.effect, relic.value)}).`)
        if (run) say(run, line)
        notice(g, line)
      } else if (run) say(run, tr(`🔏 Sceau de commit posé (${f.seals}/${SEALS_PER_RELIC}).`, `🔏 Commit seal set (${f.seals}/${SEALS_PER_RELIC}).`))
      break
    }
  }
  return g
}

function touch(f: Feed, path: string | undefined) {
  if (!path) return
  f.touched = [path, ...f.touched.filter(one => one !== path)].slice(0, 60)
}

function forgeRelic(g: GameState, name: string, origin: string, seed: number): Relic {
  const fx = RELIC_EFFECTS[seed % RELIC_EFFECTS.length]!
  const relic: Relic = { id: `r${seed.toString(36)}${g.lineage.vault.length}`, name, effect: fx.effect, value: fx.value, origin }
  g.lineage.vault.push(relic)
  if (g.lineage.vault.length > 30) {
    const dropped = g.lineage.vault.find(one => !g.champion.equipped.includes(one.id))
    if (dropped) g.lineage.vault = g.lineage.vault.filter(one => one !== dropped)
  }
  if (g.champion.equipped.length < RELIC_SLOTS(g.champion.level)) g.champion.equipped.push(relic.id)
  return relic
}

// ---------- the run: a floor of rooms on a grid ----------

const STEPS: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }
const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' }

export function roomName(run: RunProgress): string {
  return run.floor[run.cur]?.name ?? tr('Salle sans nom', 'Unnamed Room')
}

/** The rooms next to one, by the side their door is on. */
export function exits(floor: FloorRoom[], i: number): { side: Side; to: number }[] {
  const room = floor[i]
  if (!room) return []
  const out: { side: Side; to: number }[] = []
  for (const side of ['n', 's', 'e', 'w'] as const) {
    const [dx, dy] = STEPS[side]
    const to = floor.findIndex(one => one.x === room.x + dx && one.y === room.y + dy)
    if (to >= 0) out.push({ side, to })
  }
  return out
}

function biomeNameFor(g: GameState, biome: number): string {
  const dirs: string[] = []
  for (const path of g.feed.touched) {
    const top = path.includes('/') ? path.split('/')[0] + '/' : null
    if (top && !dirs.includes(top)) dirs.push(top)
  }
  const dir = dirs[biome]
  if (!dir) return DEFAULT_BIOMES[biome] ?? tr(`Profondeur ${biome + 1}`, `Depth ${biome + 1}`)
  return (tr('Les Galeries de |Les Cryptes de |Le Sanctuaire de ', 'The Galleries of |The Crypts of |The Sanctum of ').split('|')[biome] ?? '') + dir
}

/**
 * An Isaac floor: rooms grown from the start, each new one touching a single
 * other, so the map branches into dead ends. The farthest dead end holds the
 * guardian, the next ones the treasure and the shop.
 */
export function genFloor(g: GameState, biome: number, seed: number, biomeName: string): FloorRoom[] {
  const size = 8 + biome * 2
  const dir = biomeName.match(/ (\S+\/)$/)?.[1]
  const files = g.feed.touched.filter(path => (dir ? path.startsWith(dir) : true))
  for (let attempt = 0; attempt < 40; attempt++) {
    const roll = rng(seed + attempt * 7919)
    const cells: { x: number; y: number }[] = [{ x: 0, y: 0 }]
    const has = (x: number, y: number) => cells.some(c => c.x === x && c.y === y)
    const around = (x: number, y: number) => (['n', 's', 'e', 'w'] as const).filter(side => has(x + STEPS[side][0], y + STEPS[side][1])).length
    for (let tries = 0; cells.length < size && tries < 600; tries++) {
      const from = cells[Math.floor(roll() * cells.length)]!
      const side = (['n', 's', 'e', 'w'] as const)[Math.floor(roll() * 4)]!
      const x = from.x + STEPS[side][0]
      const y = from.y + STEPS[side][1]
      if (has(x, y) || around(x, y) > 1 || Math.abs(x) > 4 || Math.abs(y) > 3) continue
      cells.push({ x, y })
    }
    // Distance from the start, walking through doors.
    const far = cells.map(() => -1)
    far[0] = 0
    const queue = [0]
    while (queue.length) {
      const i = queue.shift()!
      const c = cells[i]!
      for (const side of ['n', 's', 'e', 'w'] as const) {
        const j = cells.findIndex(o => o.x === c.x + STEPS[side][0] && o.y === c.y + STEPS[side][1])
        if (j >= 0 && far[j]! < 0) { far[j] = far[i]! + 1; queue.push(j) }
      }
    }
    const ends = cells.map((c, i) => i).filter(i => i > 0 && around(cells[i]!.x, cells[i]!.y) === 1).sort((a, b) => far[b]! - far[a]!)
    if (ends.length < 3) continue
    const kinds: RoomKind[] = cells.map((_, i) => (i === 0 ? 'start' : 'normal'))
    kinds[ends[0]!] = 'boss'
    kinds[ends[1]!] = 'treasure'
    kinds[ends[2]!] = 'shop'
    if (g.feed.errorPool.length > 0) {
      const normals = kinds.map((k, i) => (k === 'normal' ? i : -1)).filter(i => i >= 0)
      const pickIt = normals[Math.floor(roll() * normals.length)]
      if (pickIt !== undefined) kinds[pickIt] = 'session'
    }
    return cells.map((c, i) => {
      const kind = kinds[i]!
      const name = kind === 'boss' ? tr('Antre du Gardien', "Guardian's Lair") : kind === 'treasure' ? tr('Salle du Trésor', 'Treasure Room') : kind === 'shop' ? tr('La Boutique', 'The Shop') : kind === 'session' ? tr('Salle des Erreurs', 'Hall of Errors') : kind === 'start' ? biomeName
        : (files.length ? files[Math.floor(roll() * files.length)]! : DEFAULT_CHAMBERS[Math.floor(roll() * DEFAULT_CHAMBERS.length)]!)
      return {
        x: c.x, y: c.y, kind, name,
        isCleared: kind === 'start' || kind === 'treasure' || kind === 'shop',
        isSeen: i === 0, isVisited: i === 0,
        loot: kind === 'treasure' ? ['altar'] : kind === 'shop' ? ['shopHeart', 'shopBoon', 'shopItem'] : [],
      }
    })
  }
  return [{ x: 0, y: 0, kind: 'boss', name: tr('Antre du Gardien', "Guardian's Lair"), isCleared: false, isSeen: true, isVisited: true, loot: [] }]
}

function reveal(run: RunProgress) {
  const room = run.floor[run.cur]
  if (!room) return
  room.isSeen = true
  room.isVisited = true
  for (const exit of exits(run.floor, run.cur)) run.floor[exit.to]!.isSeen = true
}

function newFloor(g: GameState, run: RunProgress) {
  run.biomeName = biomeNameFor(g, run.biome)
  run.floor = genFloor(g, run.biome, run.seed + run.biome * 104729, run.biomeName)
  run.cur = 0
  run.entry = null
  reveal(run)
}

export function startRun(state: GameState, seed: number, now: string): GameState {
  const g = clone(state)
  g.run = null
  const s = combatStats(g)
  const run: RunProgress = {
    version: 3, seed, weapon: g.lineage.weapon, biome: 0, depth: 0, biomeName: '', floor: [], cur: 0, entry: null,
    hp: s.maxHp, bonusHp: 0, boons: [], eclats: 0, defiance: g.lineage.mirror.defi ?? 0, offer: null,
    offerQueue: (g.lineage.mirror.eclaireur ?? 0) + g.feed.runeOffers, kills: 0, slain: [], log: [],
    items: [], itemQueue: 0, aspect: g.lineage.aspectOn?.[g.lineage.weapon],
  }
  g.feed.runeOffers = 0
  g.run = run
  g.mode = 'run'
  g.isPaused = false
  g.lineage.runs += 1
  g.champion.runs += 1
  newFloor(g, run)
  const w = WEAPONS.find(one => one.id === run.weapon)
  const aspect = ASPECTS.find(one => one.id === run.aspect)
  say(run, tr(
    `${championTitle(g.champion)} descend dans le donjon de ${g.ctx.repoName}, ${w?.title.toLowerCase()} « ${w?.name} » en main${aspect ? ` (${aspect.name})` : ''}.`,
    `${championTitle(g.champion)} descends into the ${g.ctx.repoName} dungeon, ${w?.title.toLowerCase()} "${w?.name}" in hand${aspect ? ` (${aspect.name})` : ''}.`,
  ))
  if (run.offerQueue > 0) rollOffer(run, seed, combatStats(g))
  return g
}

/** Builds the room the champion stands in, taking what the session left waiting. */
export function prepareRoom(state: GameState, seed: number): { g: GameState; spec: RoomSpec | null } {
  const g = clone(state)
  const run = g.run
  const room = run?.floor[run.cur]
  if (!run || !room) return { g, spec: null }
  const roll = rng(seed)
  const f = g.feed
  const isFight = !room.isCleared
  const isBoss = room.kind === 'boss' && isFight
  let boss: BossSpec | undefined
  if (isBoss) {
    const nemesis = g.champion.nemeses[0]
    if (nemesis && (run.biome === BIOMES - 1 || nemesis.rank >= 2 || roll() < 0.5)) {
      boss = { name: nemesis.name, rank: nemesis.rank, isNemesis: true, sig: nemesis.sig }
      say(run, tr(`☠ Ta Némésis t'attend : ${nemesis.name} (rang ${nemesis.rank}).`, `☠ Your Nemesis awaits: ${nemesis.name} (rank ${nemesis.rank}).`))
    } else {
      boss = { name: BOSSES[run.biome % BOSSES.length]!, rank: 0, isNemesis: false }
      say(run, tr(`☠ ${boss.name} garde la sortie de l'étage.`, `☠ ${boss.name} guards the way off this floor.`))
    }
  }
  const errorSpawns = !isFight || isBoss ? [] : f.errorPool.slice(0, room.kind === 'session' ? 3 : 1)
  if (errorSpawns.length) say(run, tr(`⚡ ${errorSpawns.map(one => one.sig).join(', ')} : nés de la session, ils t'attendent ici.`, `⚡ ${errorSpawns.map(one => one.sig).join(', ')}: born of the session, they wait for you here.`))
  const chests = isFight ? Math.min(f.chestPool, 2) : 0
  const portals = isFight ? Math.min(f.portalPool, 1) : 0
  const familiars = Math.min(f.familiarPool, 2)
  f.chestPool -= chests
  f.portalPool -= portals
  f.familiarPool -= familiars
  const s = combatStats(g)
  if (f.scrollPool > 0) {
    const heal = 6 * f.scrollPool
    f.scrollPool = 0
    run.hp = Math.min(s.maxHp, run.hp + heal)
    say(run, tr(`📜 Parchemins lus par Claude : +${heal} PV.`, `📜 Scrolls read by Claude: +${heal} HP.`))
  }
  const off = 1 - Math.min(0.5, s.shopDiscount)
  const items: { kind: string; price?: number; tag?: string }[] = room.loot.map(kind => kind === 'shopItem'
    // The shop's item stand shows as a boon stand; the tag says what it sells.
    ? { kind: 'shopBoon', tag: 'shopItem', price: Math.round((30 + run.biome * 10) * off) }
    : { kind, price: kind === 'shopHeart' ? Math.round((8 + run.biome * 4) * off) : kind === 'shopBoon' ? Math.round((20 + run.biome * 8) * off) : undefined })
  if (room.kind === 'boss' && room.isCleared) items.push({ kind: 'stairs' })
  const spec: RoomSpec = {
    seed, biome: run.biome, chamber: 0, depth: threat(run), isBoss, boss, errorSpawns, chests, portals,
    familiars, weapon: run.weapon, stats: s, hp: run.hp, defiance: run.defiance, scars: g.champion.scars,
    fortune: fortune(g), title: room.kind === 'start' && run.entry === null ? run.biomeName : room.name.split('/').pop() ?? room.name,
    isFight, entry: run.entry, wallet: run.eclats, items,
    doors: exits(run.floor, run.cur).map(exit => ({ ...exit, kind: run.floor[exit.to]!.isSeen ? run.floor[exit.to]!.kind : 'normal' })),
  }
  if (room.kind === 'shop') {
    const heart = items.find(i => i.kind === 'shopHeart')?.price ?? '—'
    const boon = items.find(i => i.kind === 'shopBoon' && !i.tag)?.price ?? '—'
    const item = items.find(i => i.tag === 'shopItem')?.price ?? '—'
    say(run, tr(
      `$ La Boutique : cœur ${heart} ◆ · bienfait ${boon} ◆ · objet ${item} ◆ (tu as ${run.eclats} ◆).`,
      `$ The Shop: heart ${heart} ◆ · boon ${boon} ◆ · item ${item} ◆ (you have ${run.eclats} ◆).`,
    ))
  } else if (room.kind === 'treasure' && room.loot.includes('altar')) say(run, tr('★ Salle du Trésor : un piédestal, deux objets. Un seul part avec toi.', '★ Treasure Room: one pedestal, two items. Only one leaves with you.'))
  else say(run, `— ${room.name}`)
  return { g, spec }
}

/** How hard the room hits: the floor, then how far into it the champion has fought. */
export function threat(run: RunProgress): number {
  const cleared = run.floor.filter(room => room.isCleared && (room.kind === 'normal' || room.kind === 'session')).length
  return run.biome * 5 + Math.min(4, Math.floor(cleared / 2))
}

const defOf = (id: string): BoonDef | undefined => BOONS.find(one => one.id === id)
const isItemOffer = (offer: BoonInst[] | null) => !!offer && offer.length > 0 && offer.every(o => defOf(o.id)?.isItem)

/** Held gods: the ones a duo needs. */
function heldGods(run: RunProgress): Set<string> {
  return new Set(run.boons.map(b => defOf(b.id)).filter(def => def && !def.duo && !def.isItem).map(def => def!.god))
}

/** The duos whose two gods are held and that are not taken yet. */
export function eligibleDuos(run: RunProgress): BoonDef[] {
  const gods = heldGods(run)
  return DUO_BOONS.filter(def => def.duo && gods.has(def.duo[0]) && gods.has(def.duo[1]) && !run.boons.some(b => b.id === def.id))
}

/** Held boons that can grow a level (not the one-shot ones). */
function levelable(run: RunProgress): BoonInst[] {
  return run.boons.filter(b => { const def = defOf(b.id); return !!def && !def.onPick && (b.level ?? 1) < 6 })
}

/**
 * Three gifts: mostly new boons from three gods, sometimes a level-up of one
 * held, sometimes a duo once two gods are held; now and then a whole offer of
 * level-ups (a Pom of Power).
 */
export function rollOffer(run: RunProgress, seed: number, s?: CombatStats) {
  const roll = rng(seed + run.depth * 977 + run.boons.length * 131 + run.offerQueue * 17)
  const luck = s?.luck ?? 0
  const rarity = () => {
    const r = roll() - luck
    return r < 0.03 ? 3 : r < 0.13 ? 2 : r < 0.4 ? 1 : 0
  }
  const grow = levelable(run)
  const offer: BoonInst[] = []
  const pom = grow.length >= 3 && roll() < 0.18
  if (pom) {
    for (const held of [...grow].sort(() => roll() - 0.5).slice(0, 3)) offer.push({ id: held.id, rarity: held.rarity, level: (held.level ?? 1) + 1 })
    run.offer = offer
    return
  }
  const duos = eligibleDuos(run)
  if (duos.length > 0 && roll() < 0.4) offer.push({ id: duos[Math.floor(roll() * duos.length)]!.id, rarity: DUO_RARITY })
  const held = new Set(run.boons.map(b => b.id))
  const pool = GOD_BOONS.filter(def => !held.has(def.id))
  const gods = new Set<string>(offer.map(o => defOf(o.id)?.god ?? ''))
  for (let tries = 0; offer.length < 3 && tries < 200; tries++) {
    if (grow.length > 0 && roll() < 0.2) {
      const one = grow[Math.floor(roll() * grow.length)]!
      if (offer.some(o => o.id === one.id)) continue
      offer.push({ id: one.id, rarity: Math.max(one.rarity, Math.min(3, rarity())), level: (one.level ?? 1) + 1 })
      continue
    }
    const def = pool[Math.floor(roll() * pool.length)]
    if (!def || offer.some(o => o.id === def.id) || gods.has(def.god)) continue
    gods.add(def.god)
    offer.push({ id: def.id, rarity: rarity() })
  }
  run.offer = offer
}

/** A treasure pedestal or a shop item: two items, take one. */
function rollItems(run: RunProgress, seed: number) {
  const roll = rng(seed + run.depth * 613 + (run.items?.length ?? 0) * 97)
  const offer: BoonInst[] = []
  for (let tries = 0; offer.length < 2 && tries < 100; tries++) {
    const def = ITEMS[Math.floor(roll() * ITEMS.length)]
    if (def && !offer.some(o => o.id === def.id)) offer.push({ id: def.id, rarity: ITEM_RARITY })
  }
  run.offer = offer
}

/** Whatever waits next: boons first, then items. */
function nextOffer(run: RunProgress, seed: number, s?: CombatStats) {
  if (run.offer) return
  if (run.offerQueue > 0) rollOffer(run, seed, s)
  else if ((run.itemQueue ?? 0) > 0) rollItems(run, seed)
}

// ---------- what the pane shows (pure text, in the current language) ----------

/** One offer line: `[rarity] slot · god — name : effect (note)`. */
export function offerLabel(run: RunProgress, inst: BoonInst): string {
  const def = defOf(inst.id)
  if (!def) return inst.id
  const v = boonValue(def, inst.rarity, inst.level)
  if (def.isItem) {
    const n = (run.items ?? []).filter(id => id === def.id).length
    return tr(`[Objet] ${def.name} : ${def.desc(v)}${n > 0 ? ` (tu l'as ×${n}, ça se cumule)` : ''}`, `[Item] ${def.name}: ${def.desc(v)}${n > 0 ? ` (you have ×${n}, it stacks)` : ''}`)
  }
  if (def.duo) return tr(`[Duo] ${def.god} — ${def.name} : ${def.desc(v)}`, `[Duo] ${def.god} — ${def.name}: ${def.desc(v)}`)
  const held = run.boons.find(b => b.id === def.id)
  const r = (RARITY[inst.rarity] ?? RARITY[0]!).label
  if (held) {
    const level = inst.level ?? (held.level ?? 1) + 1
    return tr(
      `[${r} · Niv. ${level}] ${SLOT_LABEL[def.slot]} · ${def.god} — ${def.name} : ${def.desc(v)} (améliore le tien)`,
      `[${r} · Lv. ${level}] ${SLOT_LABEL[def.slot]} · ${def.god} — ${def.name}: ${def.desc(v)} (upgrades yours)`,
    )
  }
  const replaced = def.slot !== 'passive' ? run.boons.map(b => defOf(b.id)).find(one => one && !one.duo && one.slot === def.slot) : undefined
  return tr(
    `[${r}] ${SLOT_LABEL[def.slot]} · ${def.god} (${godStatus(def.god)}) — ${def.name} : ${def.desc(v)}${replaced ? ` (remplace « ${replaced.name} »)` : ''}`,
    `[${r}] ${SLOT_LABEL[def.slot]} · ${def.god} (${godStatus(def.god)}) — ${def.name}: ${def.desc(v)}${replaced ? ` (replaces "${replaced.name}")` : ''}`,
  )
}

/** The header over an offer. */
export function offerTitle(run: RunProgress): string {
  const offer = run.offer ?? []
  if (isItemOffer(offer)) return tr(`★ Deux objets t'attendent : prends-en un (1 ou 2).`, '★ Two items await you: take one (1 or 2).')
  if (offer.length > 0 && offer.every(o => run.boons.some(b => b.id === o.id))) return tr('✦ Grenade de puissance : un de tes bienfaits gagne un niveau (1, 2 ou 3).', '✦ Pom of Power: one of your boons gains a level (1, 2 or 3).')
  if (offer.some(o => defOf(o.id)?.duo)) return tr("✦ Deux dieux s'accordent : un bienfait Duo est offert (1, 2 ou 3).", '✦ Two gods agree: a Duo boon is offered (1, 2 or 3).')
  return tr("✦ Un dieu du dépôt t'offre un bienfait (1, 2 ou 3) :", '✦ A god of the repo offers you a boon (1, 2 or 3):')
}

/** The build in one line: boons with levels, then items with counts. */
export function buildSummary(run: RunProgress): string {
  const boons = run.boons.map(b => {
    const def = defOf(b.id)
    return def ? `${def.name}${(b.level ?? 1) > 1 ? ` ${b.level}` : ''}` : b.id
  })
  const counts = new Map<string, number>()
  for (const id of run.items ?? []) counts.set(id, (counts.get(id) ?? 0) + 1)
  const items = [...counts].map(([id, n]) => `${defOf(id)?.name ?? id}${n > 1 ? ` ×${n}` : ''}`)
  return [boons.length ? `${tr('Bienfaits :', 'Boons:')} ${boons.join(' · ')}` : '', items.length ? `${tr('Objets :', 'Items:')} ${items.join(' · ')}` : ''].filter(Boolean).join('   ')
}

/** Arsenal lines for one weapon's aspects: what each does, owned, worn, price. */
export function aspectsFor(lineage: Lineage, weapon: WeaponId): { id: string; label: string; isOwned: boolean; isOn: boolean; cost: number }[] {
  return ASPECTS.filter(a => a.weapon === weapon).map(a => {
    const isOwned = (lineage.aspects ?? []).includes(a.id)
    const isOn = lineage.aspectOn?.[weapon] === a.id
    return { id: a.id, isOwned, isOn, cost: a.cost, label: `${isOn ? '■' : isOwned ? '□' : '🔒'} ${a.name} — ${a.desc}${isOwned ? '' : `  ◆${a.cost}`}` }
  })
}

export function onKill(state: GameState, kill: { name: string; kind: string; level: number; sig?: string }, now: string): GameState {
  const g = clone(state)
  const run = g.run
  if (!run) return g
  run.kills += 1
  const shards = Math.round((kill.kind === 'biome' || kill.kind === 'minion' ? 1 : kill.kind === 'error' ? 4 : 18) * fortune(g))
  run.eclats += shards + ((run.items ?? []).length > 0 ? combatStats(g).killShards : 0)
  if (kill.kind !== 'biome' && kill.kind !== 'minion') run.slain.push(kill.name)
  if (kill.kind === 'error' && kill.sig) {
    const i = g.feed.errorPool.findIndex(one => one.sig === kill.sig)
    if (i >= 0) g.feed.errorPool.splice(i, 1)
    say(run, tr(`Tu terrasses ${kill.name}.`, `You strike down ${kill.name}.`))
  }
  if (kill.kind === 'nemesis') {
    g.champion.nemeses = g.champion.nemeses.filter(n => n.sig !== kill.sig)
    const relic = forgeRelic(g, tr(`Trophée de ${kill.name.split(',')[0]}`, `Trophy of ${kill.name.split(',')[0]}`), tr(`némésis vaincue sur ${g.ctx.repoName}`, `nemesis slain on ${g.ctx.repoName}`), hash(kill.name + now))
    say(run, tr(`⚒ Ta Némésis est abattue ! Relique forgée : ${relic.name}.`, `⚒ Your Nemesis is slain! Relic forged: ${relic.name}.`))
    chronicle(g, now, tr(`${championTitle(g.champion)} abattit enfin sa Némésis, ${kill.name}.`, `${championTitle(g.champion)} at last slew their Nemesis, ${kill.name}.`))
  } else if (kill.kind === 'boss' && hash(now + kill.name) % 2 === 0) {
    const bare = kill.name.replace(/^(Le |La |L'|The )/, '')
    const relic = forgeRelic(g, tr(`Éclat de ${bare}`, `Shard of ${bare}`), tr(`gardien de ${g.ctx.repoName}`, `guardian of ${g.ctx.repoName}`), hash(kill.name + now))
    say(run, tr(`⚒ Relique arrachée au gardien : ${relic.name}.`, `⚒ Relic torn from the guardian: ${relic.name}.`))
  }
  const c = g.champion
  c.xp += kill.level
  while (c.xp >= xpToLevel(c.level)) {
    c.xp -= xpToLevel(c.level)
    c.level += 1
    say(run, tr(`⬆ ${c.name} passe niveau ${c.level} (+3 PV max, +2% dégâts).`, `⬆ ${c.name} reaches level ${c.level} (+3 max HP, +2% damage).`))
  }
  return g
}

export function onChest(state: GameState, n: number): GameState {
  const g = clone(state)
  if (g.run) {
    g.run.eclats += n
    say(g.run, tr(`◆ +${n} éclats.`, `◆ +${n} shards.`))
  }
  return g
}

/** A portal: a god answers. The treasure altar: an item pedestal, two items. */
export function onPortal(state: GameState): GameState {
  const g = clone(state)
  const run = g.run
  if (!run) return g
  const room = run.floor[run.cur]
  if (room?.kind === 'treasure' && room.loot.includes('altar')) {
    room.loot = room.loot.filter(one => one !== 'altar')
    run.itemQueue = (run.itemQueue ?? 0) + 1
  } else run.offerQueue += 1
  nextOffer(run, run.seed + run.kills + run.depth, combatStats(g))
  return g
}

export function onBuy(state: GameState, item: string, price: number): GameState {
  const g = clone(state)
  const run = g.run
  const room = run?.floor[run.cur]
  if (!run || !room || run.eclats < price) return g
  run.eclats -= price
  room.loot = room.loot.filter(one => one !== item)
  if (item === 'shopHeart') {
    const s = combatStats(g)
    run.hp = Math.min(s.maxHp, run.hp + Math.round(s.maxHp * 0.4))
    say(run, tr(`♥ Acheté : un cœur (−${price} ◆).`, `♥ Bought: a heart (−${price} ◆).`))
  } else if (item === 'shopItem') {
    run.itemQueue = (run.itemQueue ?? 0) + 1
    nextOffer(run, run.seed + run.depth + price, combatStats(g))
    say(run, tr(`★ Acheté : un objet (−${price} ◆).`, `★ Bought: an item (−${price} ◆).`))
  } else {
    run.offerQueue += 1
    nextOffer(run, run.seed + run.depth + price, combatStats(g))
    say(run, tr(`✦ Acheté : un bienfait (−${price} ◆).`, `✦ Bought: a boon (−${price} ◆).`))
  }
  return g
}

/** Fights on a floor after which a god offers a boon. */
export const BOON_FIGHTS = [2, 5]

/** The room is clear: doors unlock; past the guardian, the loot is safe. */
export function onCleared(state: GameState, hp: number, now: string): GameState {
  const g = clone(state)
  const run = g.run
  const room = run?.floor[run.cur]
  if (!run || !room) return g
  room.isCleared = true
  const s = combatStats(g)
  run.hp = Math.min(s.maxHp, hp + 2 + s.roomHeal)
  if (room.kind === 'boss') {
    g.lineage.eclats += run.eclats
    say(run, tr(`🏆 Gardien vaincu ! ${run.eclats} éclats mis en sûreté dans la Lignée.`, `🏆 Guardian defeated! ${run.eclats} shards stored safely in the Lineage.`))
    run.eclats = 0
    if (run.biome + 1 >= BIOMES) return victory(g, run, now)
    say(run, tr('Une trappe s\'ouvre vers l\'étage suivant.', 'A trapdoor opens to the next floor.'))
    // Isaac's boss item: the guardian leaves something behind.
    run.itemQueue = (run.itemQueue ?? 0) + 1
    say(run, tr('★ Le gardien laisse un objet derrière lui.', '★ The guardian leaves an item behind.'))
  } else if (room.kind === 'normal' || room.kind === 'session') {
    // Hades' room rewards: a god watches every few fights on a floor.
    const fights = run.floor.filter(one => one.isCleared && (one.kind === 'normal' || one.kind === 'session')).length
    if (BOON_FIGHTS.includes(fights)) {
      run.offerQueue += 1
      say(run, tr('✦ Un dieu du dépôt a vu ton combat : un bienfait t\'attend.', '✦ A god of the repo watched you fight: a boon awaits you.'))
    }
  }
  nextOffer(run, run.seed + run.depth, s)
  return g
}

export function onEnter(state: GameState, to: number, side: Side, hp: number): GameState {
  const g = clone(state)
  const run = g.run
  if (!run || !run.floor[to]) return g
  run.hp = hp
  run.cur = to
  run.entry = OPPOSITE[side]
  run.depth += 1
  reveal(run)
  return g
}

export function onDescend(state: GameState, hp: number): GameState {
  const g = clone(state)
  const run = g.run
  if (!run) return g
  run.hp = hp
  run.biome += 1
  run.depth += 1
  newFloor(g, run)
  say(run, tr(`⬇ Étage ${run.biome + 1} : ${run.biomeName}.`, `⬇ Floor ${run.biome + 1}: ${run.biomeName}.`))
  return g
}

export function onDeath(state: GameState, killer: string, now: string): GameState {
  const g = clone(state)
  const run = g.run
  if (!run) return g
  const kept = Math.floor(run.eclats / 2)
  g.lineage.eclats += kept
  g.champion.deaths += 1
  const scar = killer.split(',')[0] ?? killer
  if (!g.champion.scars.includes(scar)) g.champion.scars = [scar, ...g.champion.scars].slice(0, 5)
  chronicle(g, now, tr(`${championTitle(g.champion)} tomba face à ${killer} dans « ${roomName(run)} ».`, `${championTitle(g.champion)} fell to ${killer} in "${roomName(run)}".`))
  g.epilogue = [
    tr('💀 TU ES TOMBÉ', '💀 YOU FELL'),
    tr(`${killer} a eu raison de ${championTitle(g.champion)} dans « ${roomName(run)} ».`, `${killer} got the better of ${championTitle(g.champion)} in "${roomName(run)}".`),
    tr(`Éclats sauvés : ${kept} sur ${run.eclats} (la moitié du butin en jeu).`, `Shards saved: ${kept} of ${run.eclats} (half the loot at stake).`),
    tr(`Nouvelle cicatrice : rancune contre ${scar} (+50% de dégâts contre lui).`, `New scar: grudge against ${scar} (+50% damage against it).`),
    tr(`${run.kills} créatures vaincues. Le champion garde ses niveaux. La Lignée continue.`, `${run.kills} creatures slain. The champion keeps their levels. The Lineage goes on.`),
  ]
  g.run = null
  g.mode = 'epilogue'
  return g
}

function victory(g: GameState, run: RunProgress, now: string): GameState {
  const relic = forgeRelic(g, tr(`Couronne de ${g.ctx.repoName}`, `Crown of ${g.ctx.repoName}`), tr(`victoire sur ${g.ctx.repoName}`, `victory on ${g.ctx.repoName}`), hash(now + g.ctx.repoKey))
  g.champion.victories += 1
  chronicle(g, now, tr(
    `${championTitle(g.champion)} a conquis les ${BIOMES} biomes de ${g.ctx.repoName} (${run.kills} victimes). La « ${relic.name} » est forgée.`,
    `${championTitle(g.champion)} conquered all ${BIOMES} biomes of ${g.ctx.repoName} (${run.kills} slain). The "${relic.name}" is forged.`,
  ))
  g.epilogue = [
    tr('🏆 VICTOIRE', '🏆 VICTORY'),
    tr(`${championTitle(g.champion)} remonte du donjon de ${g.ctx.repoName}.`, `${championTitle(g.champion)} climbs back out of the ${g.ctx.repoName} dungeon.`),
    tr(`${run.kills} créatures vaincues · ${run.boons.length} bienfaits portés.`, `${run.kills} creatures slain · ${run.boons.length} boons carried.`),
    tr(`Relique forgée : ${relic.name} (${relicLabel(relic.effect, relic.value)}).`, `Relic forged: ${relic.name} (${relicLabel(relic.effect, relic.value)}).`),
  ]
  g.run = null
  g.mode = 'epilogue'
  return g
}

export function syncHp(state: GameState, hp: number, defiance: number): GameState {
  if (!state.run || (state.run.hp === hp && state.run.defiance === defiance)) return state
  const g = clone(state)
  if (g.run) {
    g.run.hp = hp
    g.run.defiance = defiance
  }
  return g
}

// ---------- menus ----------

export function menu(state: GameState, a: MenuAction, now: string, seed: number): GameState {
  const g = clone(state)
  switch (a.k) {
    case 'mode':
      g.mode = a.mode
      if (a.mode === 'hall') g.epilogue = []
      return g
    case 'newRun':
      if (g.run) chronicle(g, now, tr(`${championTitle(g.champion)} leva le camp et repartit de zéro.`, `${championTitle(g.champion)} broke camp and started over from scratch.`))
      return startRun(g, seed, now)
    case 'resume':
      if (g.run) {
        g.mode = 'run'
        g.isPaused = false
      }
      return g
    case 'buy': {
      const def = MIRROR.find(one => one.id === a.id)
      if (!def) return g
      const rank = g.lineage.mirror[def.id] ?? 0
      const cost = def.costs[rank]
      if (cost === undefined || g.lineage.eclats < cost) return g
      g.lineage.eclats -= cost
      g.lineage.mirror[def.id] = rank + 1
      notice(g, tr(`Miroir : ${def.name} rang ${rank + 1}.`, `Mirror: ${def.name} rank ${rank + 1}.`))
      return g
    }
    case 'equip': {
      const c = g.champion
      if (c.equipped.includes(a.relicId)) c.equipped = c.equipped.filter(id => id !== a.relicId)
      else if (c.equipped.length < RELIC_SLOTS(c.level)) c.equipped.push(a.relicId)
      return g
    }
    case 'weapon': {
      const def = WEAPONS.find(one => one.id === a.id)
      if (!def) return g
      if (!g.lineage.weapons.includes(def.id)) {
        if (g.lineage.eclats < def.cost) return g
        g.lineage.eclats -= def.cost
        g.lineage.weapons.push(def.id)
        notice(g, tr(`Arsenal : ${def.title} « ${def.name} » débloquée.`, `Arsenal: ${def.title} "${def.name}" unlocked.`))
      }
      g.lineage.weapon = def.id as WeaponId
      return g
    }
    case 'aspect': {
      const def = ASPECTS.find(one => one.id === a.id)
      if (!def || !g.lineage.weapons.includes(def.weapon)) return g
      const owned = g.lineage.aspects ?? []
      if (!owned.includes(def.id)) {
        if (g.lineage.eclats < def.cost) return g
        g.lineage.eclats -= def.cost
        g.lineage.aspects = [...owned, def.id]
        notice(g, tr(`Arsenal : ${def.name} débloqué.`, `Arsenal: ${def.name} unlocked.`))
      }
      const on = { ...(g.lineage.aspectOn ?? {}) }
      if (on[def.weapon] === def.id) delete on[def.weapon]
      else on[def.weapon] = def.id
      g.lineage.aspectOn = on
      g.lineage.weapon = def.weapon
      return g
    }
    case 'pick': {
      const run = g.run
      if (!run?.offer) return g
      const chosen = run.offer[a.i]
      const def = chosen ? defOf(chosen.id) : undefined
      if (!chosen || !def) return g
      const wasItems = isItemOffer(run.offer)
      const duosBefore = eligibleDuos(run).length
      const before = combatStats(g).maxHp
      const held = run.boons.find(b => b.id === def.id)
      if (def.isItem) {
        run.items = [...(run.items ?? []), def.id]
        def.onPick?.(run, 1)
        say(run, tr(`★ Objet pris : « ${def.name} » (${def.desc(1)}).`, `★ Item taken: "${def.name}" (${def.desc(1)}).`))
      } else if (held) {
        held.level = Math.max((held.level ?? 1) + 1, chosen.level ?? 0)
        held.rarity = Math.max(held.rarity, chosen.rarity)
        say(run, tr(`✦ « ${def.name} » passe niveau ${held.level} : ${def.desc(boonValue(def, held.rarity, held.level))}.`, `✦ "${def.name}" reaches level ${held.level}: ${def.desc(boonValue(def, held.rarity, held.level))}.`))
      } else {
        if (def.slot !== 'passive') {
          const replaced = run.boons.find(b => { const one = defOf(b.id); return !!one && !one.duo && one.slot === def.slot })
          run.boons = run.boons.filter(b => b !== replaced)
          if (replaced) say(run, tr(`(${defOf(replaced.id)?.name} est remplacé.)`, `(${defOf(replaced.id)?.name} is replaced.)`))
        }
        run.boons.push({ id: chosen.id, rarity: chosen.rarity })
        def.onPick?.(run, boonValue(def, chosen.rarity))
        say(run, tr(`✦ ${def.god} t'accorde « ${def.name} » : ${def.desc(boonValue(def, chosen.rarity))}.`, `✦ ${def.god} grants you "${def.name}": ${def.desc(boonValue(def, chosen.rarity))}.`))
        if (eligibleDuos(run).length > duosBefore) say(run, tr('✦ Deux de tes dieux pourraient s\'accorder : un Duo peut t\'être offert.', '✦ Two of your gods could agree: a Duo may be offered to you.'))
      }
      const s = combatStats(g)
      const gained = s.maxHp - before
      if (gained > 0) run.hp += gained
      run.hp = Math.min(run.hp, s.maxHp)
      run.offer = null
      if (wasItems) run.itemQueue = Math.max(0, (run.itemQueue ?? 0) - 1)
      else run.offerQueue = Math.max(0, run.offerQueue - 1)
      nextOffer(run, seed, s)
      return g
    }
  }
}

export function toSave(g: GameState, isEnded = false): Save {
  return { sessionId: g.sessionId, run: g.run, feed: g.feed, isEnded }
}

export function saveKey(ctx: Ctx): string {
  return `save:${ctx.repoKey}@${ctx.branch}`
}
