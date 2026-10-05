import { expect, test } from 'claude-code/testing'

import { applyEvent, combatStats, menu, onBuy, onDeath, parseError, startRun } from '../hooks/meta'
import { frameSize, renderFrame } from '../hooks/render'
import type { Enemy, Input } from '../hooks/sim'
import { FH, FW, createRoom, inject, step } from '../hooks/sim'
import { CTX, NOW, fresh, goTo, playRun, room } from './driver'
import { exits, genFloor } from '../hooks/meta'

const IDLE: Input = { mx: 0, my: 0, attack: false, special: false, cast: false, dash: false }
const view = { biomeLabel: '', roomLabel: '1-1', eclats: 0, boons: 0, isPaused: false, isOffer: false, hint: '', scale: 2 }

function dummy(x: number, y: number, hp = 10): Enemy {
  return { id: 999, type: 'rat', kind: 'biome', name: 'Rat de node_modules', x, y, r: 4, hp, maxHp: hp, speed: 0, dmg: 1, level: 1, state: 'chase', t: 9, aimX: x, aimY: y, vx: 0, vy: 0, flash: 0, pattern: 0, hasHit: false, detour: 0, detourX: 0, detourY: 0 }
}

test('errors read from a failed command name their monster', () => {
  expect(parseError('TypeError: Cannot read properties of undefined')?.sig).toBe('TypeError')
  expect(parseError('src/a.ts(3,1): error TS2345: nope')?.sig).toBe('TSError')
  expect(parseError('all good')).toBe(null)
})

test('a run starts with the chosen weapon and a first room full of foes', () => {
  const g = goTo(menu(fresh(), { k: 'newRun' }, NOW, 5), 'normal')
  expect(g.mode).toBe('run')
  expect(g.run?.weapon).toBe('epee')
  const { live } = room(g)
  expect(live.enemies.length > 0).toBe(true)
  expect(live.player.hp).toBe(combatStats(g).maxHp)
})

test('pooled session errors come back as named elites', () => {
  let g = applyEvent(fresh(), { kind: 'fail', sig: 'TypeError', name: 'TypeError, le Spectre Indéfini' }, NOW, false)
  g = startRun(g, 3, NOW)
  expect(g.run!.floor.some(r => r.kind === 'session')).toBe(true)
  const { live } = room(goTo(g, 'session'))
  expect(live.enemies.some(e => e.kind === 'error' && e.sig === 'TypeError')).toBe(true)
})

test('a live failure spawns its monster in the room at once', () => {
  const { live } = room(goTo(startRun(fresh(), 3, NOW), 'normal'))
  const before = live.enemies.length
  inject(live, { kind: 'fail', sig: 'ENOENT', name: 'ENOENT, le Chemin Perdu' })
  expect(live.enemies.length).toBe(before + 1)
  expect(live.banner?.text).toContain('ENOENT')
})

test('the sword swing kills a weak foe in front and the room clears', () => {
  const { live } = room(goTo(startRun(fresh(), 3, NOW), 'normal'))
  live.waves = []
  live.errorQueue = []
  live.player.faceX = 0
  live.player.faceY = -1
  live.enemies = [dummy(live.player.x, live.player.y - 8, 5)]
  step(live, { ...IDLE, attack: true }, 1 / 24)
  for (let i = 0; i < 10; i++) step(live, IDLE, 1 / 24)
  expect(live.enemies.length).toBe(0)
  expect(live.isCleared).toBe(true)
  expect(live.signals.some(s => s.k === 'kill')).toBe(true)
  expect(live.signals.some(s => s.k === 'cleared')).toBe(true)
})

test('a dash makes the champion untouchable for a moment', () => {
  const { live } = room(goTo(startRun(fresh(), 3, NOW), 'normal'))
  live.enemies = []
  live.waves = []
  live.player.iframes = 0
  step(live, { ...IDLE, dash: true, mx: 1 }, 1 / 24)
  step(live, { ...IDLE, mx: 1 }, 1 / 24)
  expect(live.player.iframes > 0).toBe(true)
  expect(live.fx.some(f => f.kind === 'ghost')).toBe(true)
})

test('the cast lodges and comes back to the hand', () => {
  const { live } = room(goTo(startRun(fresh(), 3, NOW), 'normal'))
  live.enemies = []
  live.waves = []
  live.errorQueue = []
  expect(live.ammo).toBe(1)
  step(live, { ...IDLE, cast: true }, 1 / 24)
  expect(live.ammo).toBe(0)
  for (let i = 0; i < 24 * 7; i++) step(live, IDLE, 1 / 24)
  expect(live.ammo).toBe(1)
})

test('every weapon fights its way through rooms', () => {
  for (const weapon of ['epee', 'lance', 'arc', 'bouclier'] as const) {
    const result = playRun(11, { weapon, level: 6, mirror: { vigueur: 3, force: 2 } })
    expect(result.rooms > 1).toBe(true)
  }
})

test('a boon takes its slot and replaces the one already there', () => {
  let g = startRun(fresh(), 3, NOW)
  g.run!.offer = [{ id: 'grep-attack', rarity: 0 }, { id: 'sudo-special', rarity: 0 }, { id: 'fork-cast', rarity: 0 }]
  g.run!.offerQueue = 1
  g = menu(g, { k: 'pick', i: 0 }, NOW, 1)
  g.run!.offer = [{ id: 'sudo-attack', rarity: 2 }, { id: 'lint-passive', rarity: 0 }, { id: 'pipe-cast', rarity: 0 }]
  g.run!.offerQueue = 1
  g = menu(g, { k: 'pick', i: 0 }, NOW, 2)
  expect(g.run!.boons.map(b => b.id)).toEqual(['sudo-attack'])
  expect(combatStats(g).attackKnock).toBe(2)
})

test('death keeps half the loot and leaves a scar', () => {
  const g = startRun(fresh(), 3, NOW)
  g.run!.eclats = 40
  const after = onDeath(g, 'TypeError, le Spectre Indéfini', NOW)
  expect(after.lineage.eclats).toBe(20)
  expect(after.champion.scars).toContain('TypeError')
  expect(after.mode).toBe('epilogue')
})

test('three commits forge a relic, a locked weapon is bought with shards', () => {
  let g = fresh()
  for (const message of ['feat: a', 'fix: b', 'chore: c']) g = applyEvent(g, { kind: 'commit', message }, NOW, false)
  expect(g.lineage.vault.length).toBe(1)
  g.lineage.eclats = 30
  g = menu(g, { k: 'weapon', id: 'lance' }, NOW, 1)
  expect(g.lineage.weapons).toContain('lance')
  expect(g.lineage.weapon).toBe('lance')
  expect(g.lineage.eclats).toBe(0)
})

test('frames draw the room, the hud, the pause and the guardian', () => {
  const buf = new Uint8Array(FW * FH * 4)
  const { live } = room(goTo(startRun(fresh(), 3, NOW), 'normal'))
  renderFrame(live, view, buf)
  let lit = 0
  for (let i = 0; i < buf.length; i += 4) if (buf[i]! + buf[i + 1]! + buf[i + 2]! > 120) lit++
  expect(lit > 500).toBe(true)
  renderFrame(live, { ...view, isPaused: true, hint: 'touche' }, buf)
  renderFrame(null, view, buf)
  const g = goTo(startRun(fresh(), 9, NOW), 'boss')
  const boss = room(g, 9).live
  expect(boss.enemies.some(e => e.type === 'boss')).toBe(true)
  for (let i = 0; i < 24 * 4; i++) step(boss, IDLE, 1 / 24)
  renderFrame(boss, view, buf)
  expect(CTX.repoName).toBe('forge')
  // The picture mode: twice as fine, textured and lit, the torches burning on the north wall.
  const size = frameSize(2)
  const fine = new Uint8Array(size.width * size.height * 4)
  renderFrame(boss, { ...view, res: 2 }, fine)
  expect([size.width, size.height]).toEqual([320, 180])
  const colours = new Set<number>()
  for (let i = 0; i < fine.length; i += 4) colours.add((fine[i]! << 16) | (fine[i + 1]! << 8) | fine[i + 2]!)
  expect(colours.size > 400).toBe(true)
})

test('a floor is an Isaac map: branching rooms, the guardian at the far end, treasure and shop', () => {
  const g = startRun(fresh(), 21, NOW)
  const floor = g.run!.floor
  expect(floor.length).toBe(8)
  for (const kind of ['start', 'boss', 'treasure', 'shop']) expect(floor.filter(r => r.kind === kind).length).toBe(1)
  // Special rooms are dead ends: one door each.
  for (const kind of ['boss', 'treasure', 'shop']) expect(exits(floor, floor.findIndex(r => r.kind === kind)).length).toBe(1)
  // The start room is safe, its neighbours already on the map.
  expect(floor[0]!.isCleared).toBe(true)
  expect(exits(floor, 0).every(e => floor[e.to]!.isSeen)).toBe(true)
  expect(genFloor(g, 2, 5, 'x').length).toBe(12)
})

test('doors stay barred until the room is clear, then lead to the next room', () => {
  const g = goTo(startRun(fresh(), 3, NOW), 'normal')
  const { live } = room(g)
  expect(live.doors.length > 0).toBe(true)
  const door = live.doors[0]!
  live.player.x = door.x
  live.player.y = door.side === 'n' ? door.y + 6 : door.side === 's' ? door.y - 4 : door.y + 4
  if (door.side === 'w') live.player.x = door.x + 6
  if (door.side === 'e') live.player.x = door.x - 6
  step(live, IDLE, 1 / 24)
  expect(live.signals.some(s => s.k === 'door')).toBe(false)
  live.enemies = []
  live.waves = []
  live.errorQueue = []
  live.t = 1
  step(live, IDLE, 1 / 24)
  step(live, IDLE, 1 / 24)
  expect(live.signals.some(s => s.k === 'door')).toBe(true)
})

test('the second stick swings where it points, not where the champion walks', () => {
  const { live } = room(goTo(startRun(fresh(), 3, NOW), 'normal'))
  live.waves = []
  live.errorQueue = []
  live.enemies = [dummy(live.player.x + 10, live.player.y, 5)]
  step(live, { ...IDLE, my: -1, ax: 1, attack: true }, 1 / 24)
  for (let i = 0; i < 6; i++) step(live, IDLE, 1 / 24)
  expect(live.enemies.length).toBe(0)
})

test('the shop sells with the shards in hand', () => {
  let g = goTo(startRun(fresh(), 3, NOW), 'shop')
  g.run!.eclats = 50
  const { live } = room(g)
  const heart = live.pickups.find(p => p.kind === 'shopHeart')!
  live.player.x = heart.x
  live.player.y = heart.y
  step(live, IDLE, 1 / 24)
  const buy = live.signals.find(s => s.k === 'buy')
  expect(buy).toBeDefined()
  if (buy?.k === 'buy') g = onBuy(g, buy.item, buy.price)
  expect(g.run!.eclats).toBe(50 - (heart.price ?? 0))
  expect(g.run!.floor[g.run!.cur]!.loot).not.toContain('shopHeart')
})
