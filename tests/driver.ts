import type { Ctx, FloorRoom, GameState, WeaponId } from '../types'
import { boot, combatStats, exits, menu, onBuy, onChest, onCleared, onDeath, onDescend, onEnter, onKill, onPortal, prepareRoom, syncHp } from '../hooks/meta'
import type { Input, Live } from '../hooks/sim'
import { ROOM, createRoom, step } from '../hooks/sim'

export const CTX: Ctx = { repoKey: 'github.com/demo/forge', repoName: 'forge', branch: 'main', isWild: false }
export const NOW = '2026-10-05T10:00:00.000Z'

export function fresh(): GameState {
  return boot({ sessionId: 's1', ctx: CTX, cls: 'vagabond', lineage: undefined, champion: undefined, save: undefined, now: NOW })
}

export function room(g: GameState, seed = 7): { g: GameState; live: Live } {
  const prepared = prepareRoom(g, seed)
  if (!prepared.spec) throw new Error('no run')
  return { g: prepared.g, live: createRoom(prepared.spec) }
}

/** Puts the champion in the first room of a kind, as if walked in from the south. */
export function goTo(g: GameState, kind: string): GameState {
  const run = g.run!
  const i = run.floor.findIndex(r => r.kind === kind || (kind === 'normal' && r.kind === 'session'))
  run.cur = i < 0 ? run.cur : i
  run.entry = 's'
  return g
}

const IDLE: Input = { mx: 0, my: 0, attack: false, special: false, cast: false, dash: false }

const stuck = { x: 0, y: 0, since: 0, until: 0, side: 1 }

function unstick(live: Live, t: number, input: Input): Input {
  const p = live.player
  const isTrying = input.mx !== 0 || input.my !== 0
  if (t < stuck.until) return { ...input, mx: input.mx === 0 ? stuck.side : input.mx, my: input.my === 0 ? stuck.side : 0 }
  if (!isTrying || Math.hypot(p.x - stuck.x, p.y - stuck.y) > 1.5) {
    stuck.x = p.x
    stuck.y = p.y
    stuck.since = t
    return input
  }
  if (t - stuck.since > 0.3) {
    stuck.until = t + 0.6
    stuck.side = p.x > 80 ? -1 : 1
    stuck.since = t
  }
  return input
}

/** Walks toward a point along a breadth-first path on a 4px grid around the pillars. */
function toward(live: Live, x: number, y: number): Input {
  const p = live.player
  const cell = 4
  const free = (cx: number, cy: number) => {
    const px = cx * cell
    const py = cy * cell
    if (px - 5 < ROOM.x0 || px + 5 > ROOM.x1 || py - 5 < ROOM.y0 || py + 5 > ROOM.y1) return false
    return !live.pillars.some(r => px + 5 > r.x && px - 5 < r.x + r.w && py + 5 > r.y && py - 5 < r.y + r.h)
  }
  const sx = Math.round(p.x / cell)
  const sy = Math.round(p.y / cell)
  const gx = Math.round(Math.max(ROOM.x0 + 5, Math.min(ROOM.x1 - 5, x)) / cell)
  const gy = Math.round(Math.max(ROOM.y0 + 5, Math.min(ROOM.y1 - 5, y)) / cell)
  const key = (a: number, b: number) => a * 1000 + b
  const prev = new Map<number, number>([[key(sx, sy), -1]])
  const queue: [number, number][] = [[sx, sy]]
  let found = false
  while (queue.length && !found) {
    const [cx, cy] = queue.shift()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx
      const ny = cy + dy
      const k = key(nx, ny)
      if (prev.has(k) || !(free(nx, ny) || (nx === gx && ny === gy))) continue
      prev.set(k, key(cx, cy))
      if (nx === gx && ny === gy) { found = true; break }
      queue.push([nx, ny])
    }
  }
  let tx = x
  let ty = y
  if (found) {
    let cur = key(gx, gy)
    let steps = 0
    while (prev.get(cur) !== key(sx, sy) && prev.get(cur) !== -1 && steps++ < 400) cur = prev.get(cur)!
    tx = Math.floor(cur / 1000) * cell
    ty = (cur % 1000) * cell
  }
  // Past the last free cell, push on into the door.
  if (!found || (Math.abs(tx - p.x) < 1 && Math.abs(ty - p.y) < 1)) { tx = x; ty = y }
  return { ...IDLE, mx: Math.abs(tx - p.x) > 1 ? Math.sign(tx - p.x) : 0, my: Math.abs(ty - p.y) > 1 ? Math.sign(ty - p.y) : 0 }
}

/** A plain bot: clears the room with the second stick, then walks the floor toward what it has not seen. */
export function botInput(live: Live, t: number, g?: GameState): Input {
  return unstick(live, t, aim(live, t, g))
}

/** The first room on the shortest walk to the nearest unvisited room, else to the guardian. */
function nextStep(floor: FloorRoom[], from: number): number | undefined {
  const goal = (i: number) => !floor[i]!.isVisited && floor[i]!.kind !== 'boss'
  const allSeen = floor.every(r => r.isVisited || r.kind === 'boss')
  const prev = new Map<number, number>([[from, -1]])
  const queue = [from]
  while (queue.length) {
    const i = queue.shift()!
    if (i !== from && (allSeen ? floor[i]!.kind === 'boss' : goal(i))) {
      let cur = i
      while (prev.get(cur) !== from) cur = prev.get(cur)!
      return cur
    }
    for (const exit of exits(floor, i)) if (!prev.has(exit.to)) { prev.set(exit.to, i); queue.push(exit.to) }
  }
  return undefined
}

function aim(live: Live, t: number, g?: GameState): Input {
  const p = live.player
  if (live.isCleared) {
    const want = live.pickups.find(item => item.kind === 'stairs' || item.kind === 'altar' || (item.kind === 'heart' && p.hp < live.stats.maxHp) || item.kind === 'shard')
    if (want) return toward(live, want.x, want.y)
    const run = g?.run
    const next = run ? nextStep(run.floor, run.cur) : undefined
    const door = live.doors.find(d => d.to === next) ?? live.doors[0]
    if (!door) return IDLE
    const go = door.side === 'n' ? { x: door.x, y: door.y - 4 } : door.side === 's' ? { x: door.x, y: door.y + 4 } : door.side === 'w' ? { x: door.x - 4, y: door.y + 4 } : { x: door.x + 4, y: door.y + 4 }
    return toward(live, go.x, go.y)
  }
  const foes = live.enemies.filter(e => e.state !== 'spawn')
  const target = foes.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
  if (!target) return IDLE
  const dx = target.x - p.x
  const dy = target.y - p.y
  const d = Math.hypot(dx, dy)
  const threat = foes.some(e => e.state === 'windup' && Math.hypot(e.x - p.x, e.y - p.y) < 22)
  const reach = live.weapon === 'lance' ? 22 : live.weapon === 'arc' ? 70 : 12
  const input: Input = { ...IDLE }
  if (d > reach) {
    const go = toward(live, target.x, target.y)
    input.mx = go.mx
    input.my = go.my
  }
  // The second stick: fire along the main axis toward the foe.
  if (d <= reach + 6) {
    if (Math.abs(dx) > Math.abs(dy)) input.ax = Math.sign(dx)
    else input.ay = Math.sign(dy)
    input.attack = true
    if (Math.floor(t * 3) % 4 === 0) input.special = true
  }
  if (live.ammo > 0 && d < 80 && Math.floor(t * 5) % 7 === 0) input.cast = true
  if (threat) {
    input.dash = true
    input.mx = -Math.sign(dx) || 1
    input.my = -Math.sign(dy)
  }
  return input
}

export type BotResult = { isWin: boolean; depth: number; floors: number; eclats: number; rooms: number; g: GameState; live: Live | null; hurt: number; healed: number; killHealed: number; kills: number }

export function playRun(seed: number, opts: { weapon?: WeaponId; mirror?: Record<string, number>; level?: number; relics?: { effect: string; value: number }[] } = {}): BotResult {
  let g = fresh()
  for (const [i, r] of (opts.relics ?? []).entries()) {
    g.lineage.vault.push({ id: `bot${i}`, name: 'bot', effect: r.effect, value: r.value, origin: 'bot' } as never)
    g.champion.equipped.push(`bot${i}`)
  }
  let hurt = 0
  let healed = 0
  let killHealed = 0
  let kills = 0
  g.lineage.mirror = opts.mirror ?? {}
  g.champion.level = opts.level ?? 1
  if (opts.weapon) {
    g.lineage.weapons = ['epee', 'lance', 'arc', 'bouclier']
    g.lineage.weapon = opts.weapon
  }
  Object.assign(stuck, { x: 0, y: 0, since: 0, until: 0, side: 1 })
  g = menu(g, { k: 'newRun' }, NOW, seed)
  let built = room(g, seed)
  g = built.g
  let live: Live | null = built.live
  let rooms = 1
  let t = 0
  const dt = 1 / 24
  for (let i = 0; i < 24 * 60 * 30 && live && g.run; i++) {
    t += dt
    if (g.run.offer) { g = menu(g, { k: 'pick', i: 0 }, NOW, seed + i); live.stats = combatStats(g); continue }
    const before = live.player.hp
    step(live, botInput(live, t, g), dt)
    const delta = live.player.hp - before
    const killed = live.signals.filter(one => one.k === 'kill').length
    kills += killed
    if (delta < 0) hurt -= delta
    else if (delta > 0) { healed += delta; if (killed > 0) killHealed += delta }
    while (live && live.signals.length > 0) {
      const sig = live.signals.shift()!
      const hp = Math.round(live.player.hp)
      if (sig.k === 'kill') g = onKill(g, sig, NOW)
      else if (sig.k === 'chest') g = onChest(g, sig.n)
      else if (sig.k === 'portal') g = onPortal(g)
      else if (sig.k === 'buy') g = onBuy(g, sig.item, sig.price)
      else if (sig.k === 'cleared') {
        g = onCleared(syncHp(g, hp, live.player.defiance), hp, NOW)
        if (!g.run) { live = null; break }
        live.player.hp = g.run.hp
      } else if (sig.k === 'door' || sig.k === 'descend') {
        g = sig.k === 'door' ? onEnter(g, sig.to, sig.side, hp) : onDescend(g, hp)
        built = room(g, seed + rooms * 101)
        g = built.g
        live = built.live
        rooms++
      } else if (sig.k === 'died') {
        g = onDeath(g, sig.killer, NOW)
        live = null
      }
    }
    if (live && g.run) {
      live.stats = combatStats(g)
      live.wallet = g.run.eclats
    }
  }
  return { isWin: g.epilogue[0]?.includes('VICTOIRE') ?? false, depth: g.run?.depth ?? -1, floors: (g.run?.biome ?? -1) + 1, eclats: g.lineage.eclats, rooms, g, live, hurt, healed, killHealed, kills }
}
