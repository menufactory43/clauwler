import { expect, test } from 'claude-code/testing'

import type { GameState } from '../types'
import { ASPECTS, BOONS, DUO_BOONS, GODS, GOD_BOONS, ITEMS, RARITY, boonValue } from '../hooks/data'
import {
  aspectsFor, buildSummary, combatStats, eligibleDuos, menu, offerLabel, offerTitle, onBuy, onCleared, onPortal, rollOffer, startRun,
} from '../hooks/meta'
import type { Enemy, Input } from '../hooks/sim'
import { step } from '../hooks/sim'
import { NOW, fresh, goTo, room } from './driver'

const IDLE: Input = { mx: 0, my: 0, attack: false, special: false, cast: false, dash: false }

function foe(id: number, x: number, y: number, hp = 200): Enemy {
  return { id, type: 'rat', kind: 'biome', name: 'Rat de node_modules', x, y, r: 4, hp, maxHp: hp, speed: 0, dmg: 1, level: 1, state: 'chase', t: 9, aimX: x, aimY: y, vx: 0, vy: 0, flash: 0, pattern: 0, hasHit: false, detour: 0, detourX: 0, detourY: 0 }
}

/** A quiet fighting room with the given foes, the build from `g`. */
function arena(g: GameState, foes: Enemy[]) {
  const { live } = room(goTo(g, 'normal'))
  live.waves = []
  live.errorQueue = []
  live.enemies = foes
  live.stats = combatStats(g)
  return live
}

const run = () => startRun(fresh(), 3, NOW)

test('the catalogue: 8 gods with 5+ boons over every slot, 10+ duos, 20+ items, 2 aspects a weapon', () => {
  expect(GOD_BOONS.length >= 40).toBe(true)
  for (const god of Object.values(GODS)) {
    const mine = GOD_BOONS.filter(b => b.god === god)
    expect(mine.length >= 5).toBe(true)
    for (const slot of ['attack', 'special', 'cast', 'dash', 'passive'] as const) expect(mine.some(b => b.slot === slot)).toBe(true)
  }
  expect(DUO_BOONS.length >= 10).toBe(true)
  expect(ITEMS.length >= 20).toBe(true)
  for (const weapon of ['epee', 'lance', 'arc', 'bouclier'] as const) expect(ASPECTS.filter(a => a.weapon === weapon).length).toBe(2)
  const ids = BOONS.map(b => b.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const def of BOONS) {
    for (let r = 0; r < RARITY.length; r++) expect(def.desc(boonValue(def, r)).length > 3).toBe(true)
  }
})

test('two gods held bring a duo into the offers', () => {
  const g = run()
  const r = g.run!
  r.boons = [{ id: 'sudo-burn', rarity: 0 }, { id: 'lint-cast', rarity: 0 }]
  expect(eligibleDuos(r).map(d => d.id)).toEqual(['duo-sudo-lint'])
  let seen = false
  for (let seed = 1; seed < 40 && !seen; seed++) {
    r.offer = null
    rollOffer(r, seed)
    seen = r.offer!.some(o => o.id === 'duo-sudo-lint')
  }
  expect(seen).toBe(true)
  expect(offerTitle(r)).toContain('Duo')
  expect(offerLabel(r, { id: 'duo-sudo-lint', rarity: 4 })).toContain('[Duo]')
})

test('taking a held boon again levels it up and the value grows', () => {
  let g = run()
  g.run!.boons = [{ id: 'pipe-passive', rarity: 0 }]
  const before = combatStats(g).dmg
  g.run!.offer = [{ id: 'pipe-passive', rarity: 0, level: 2 }]
  g.run!.offerQueue = 1
  expect(offerLabel(g.run!, g.run!.offer[0]!)).toContain('Niv. 2')
  g = menu(g, { k: 'pick', i: 0 }, NOW, 1)
  expect(g.run!.boons).toEqual([{ id: 'pipe-passive', rarity: 0, level: 2 }])
  expect(combatStats(g).dmg > before).toBe(true)
  expect(buildSummary(g.run!)).toContain('Débit 2')
})

test('items stack, and the treasure pedestal offers two of them', () => {
  let g = goTo(run(), 'treasure')
  g = onPortal(g)
  expect(g.run!.offer!.length).toBe(2)
  expect(g.run!.offer!.every(o => ITEMS.some(i => i.id === o.id))).toBe(true)
  expect(g.run!.floor[g.run!.cur]!.loot).not.toContain('altar')
  expect(offerTitle(g.run!)).toContain('objets')
  const id = g.run!.offer![0]!.id
  g = menu(g, { k: 'pick', i: 0 }, NOW, 1)
  expect(g.run!.items).toEqual([id])
  expect(g.run!.offer).toBe(null)
  expect(g.run!.itemQueue).toBe(0)
  g.run!.items = ['i-double', 'i-double', 'i-orbital']
  const s = combatStats(g)
  expect(s.extraShots).toBe(2)
  expect(s.orbitals).toBe(1)
  expect(buildSummary(g.run!)).toContain('Double tir ×2')
})

test('the shop sells an item stand next to the heart and the boon', () => {
  let g = goTo(run(), 'shop')
  g.run!.eclats = 200
  const { live } = room(g)
  const stand = live.pickups.find(p => p.tag === 'shopItem')!
  expect(stand).toBeDefined()
  live.player.x = stand.x
  live.player.y = stand.y
  step(live, IDLE, 1 / 24)
  const buy = live.signals.find(s => s.k === 'buy')
  expect(buy?.k === 'buy' && buy.item).toBe('shopItem')
  if (buy?.k === 'buy') g = onBuy(g, buy.item, buy.price)
  expect(g.run!.offer!.length).toBe(2)
  expect(g.run!.floor[g.run!.cur]!.loot).not.toContain('shopItem')
})

test('fights earn boons, the guardian leaves an item', () => {
  let g = goTo(run(), 'normal')
  const normals = g.run!.floor.map((r, i) => (r.kind === 'normal' ? i : -1)).filter(i => i >= 0)
  g.run!.floor[normals[1]!]!.isCleared = true
  g = onCleared(g, 40, NOW)
  expect(g.run!.offer).not.toBe(null)
  g = goTo(g, 'boss')
  g.run!.offer = null
  g.run!.offerQueue = 0
  g = onCleared(g, 40, NOW)
  expect(g.run!.offer!.every(o => ITEMS.some(i => i.id === o.id))).toBe(true)
})

test('burn, poison and the mark ride on the attack and tick down the foe', () => {
  const g = run()
  g.run!.boons = [{ id: 'sudo-burn', rarity: 0 }, { id: 'lint-attack', rarity: 0 }]
  g.run!.items = ['i-mark']
  const live = arena(g, [foe(1, 0, 0)])
  const e = live.enemies[0]!
  e.x = live.player.x
  e.y = live.player.y - 8
  live.player.faceX = 0
  live.player.faceY = -1
  step(live, { ...IDLE, attack: true }, 1 / 24)
  expect(e.status!.burn > 0).toBe(true)
  expect(e.status!.poison > 0).toBe(true)
  expect(e.status!.markT > 0).toBe(true)
  const hp = e.hp
  for (let i = 0; i < 24; i++) step(live, IDLE, 1 / 24)
  expect(e.hp < hp).toBe(true)
})

test('extra shots fly with each swing and lightning jumps to a neighbour', () => {
  const g = run()
  g.run!.boons = [{ id: 'pipe-attack', rarity: 0 }]
  g.run!.items = ['i-double']
  const live = arena(g, [foe(1, 0, 0), foe(2, 0, 0)])
  const [a, b] = live.enemies as [Enemy, Enemy]
  // Out of the sword's reach: only the extra shot gets there, and its lightning jumps on.
  a.x = live.player.x
  a.y = live.player.y - 50
  b.x = live.player.x + 16
  b.y = live.player.y - 60
  live.player.faceX = 0
  live.player.faceY = -1
  step(live, { ...IDLE, attack: true }, 1 / 24)
  expect(live.projs.some(p => p.team === 'p' && p.kind === 'arrow' && p.fx?.src === 'attack')).toBe(true)
  for (let i = 0; i < 12; i++) step(live, IDLE, 1 / 24)
  expect(a.hp < a.maxHp).toBe(true)
  expect(b.hp < b.maxHp).toBe(true)
})

test('a shield soaks a blow, armour trims it', () => {
  const g = run()
  g.run!.items = ['i-shield', 'i-armor']
  const live = arena(g, [foe(1, 0, 0)])
  live.player.iframes = 0
  const hp = live.player.hp
  const e = live.enemies[0]!
  e.dmg = 6
  e.x = live.player.x + 5
  e.y = live.player.y
  e.state = 'windup'
  e.t = 0
  step(live, IDLE, 1 / 24)
  expect(live.player.hp).toBe(hp)
  expect(live.effects!.shield < 8).toBe(true)
})

test('kill -9 executes a weak foe; rm -rf blows up its neighbour', () => {
  const g = run()
  g.run!.boons = [{ id: 'sudo-kill', rarity: 2 }]
  g.run!.items = ['i-explode', 'i-explode', 'i-explode']
  const live = arena(g, [foe(1, 0, 0, 100), foe(2, 0, 0, 20)])
  const [a, b] = live.enemies as [Enemy, Enemy]
  a.hp = 30
  a.x = live.player.x
  a.y = live.player.y - 8
  b.x = live.player.x + 10
  b.y = live.player.y - 14
  live.player.faceX = 0
  live.player.faceY = -1
  step(live, { ...IDLE, attack: true }, 1 / 24)
  step(live, IDLE, 1 / 24)
  expect(live.enemies.includes(a)).toBe(false)
  expect(b.hp < b.maxHp).toBe(true)
})

test('aspects are bought with shards, worn on their weapon, and change the run', () => {
  let g = fresh()
  g.lineage.eclats = 100
  g = menu(g, { k: 'aspect', id: 'epee-kernel' }, NOW, 1)
  expect(g.lineage.aspects).toEqual(['epee-kernel'])
  expect(g.lineage.aspectOn?.epee).toBe('epee-kernel')
  expect(g.lineage.eclats).toBe(60)
  expect(aspectsFor(g.lineage, 'epee')[0]!.isOn).toBe(true)
  // A locked weapon's aspect cannot be bought.
  expect(menu(g, { k: 'aspect', id: 'arc-multicast' }, NOW, 1).lineage.aspects).toEqual(['epee-kernel'])
  g = startRun(g, 3, NOW)
  expect(g.run!.aspect).toBe('epee-kernel')
  expect(combatStats(g).attackMult).toBe(1.5)
})

test('an old save (no items, no levels, no aspect) still plays', () => {
  let g = run()
  const r = g.run! as any
  delete r.items
  delete r.itemQueue
  delete r.aspect
  r.boons = [{ id: 'grep-attack', rarity: 1 }]
  expect(combatStats(g).attackCrit).toBe(0.15)
  g = goTo(g, 'treasure')
  g = onPortal(g)
  g = menu(g, { k: 'pick', i: 1 }, NOW, 2)
  expect(g.run!.items!.length).toBe(1)
})

test('a ricocheting bolt jumps from one foe to the next', () => {
  const g = run()
  g.run!.items = ['i-ricochet']
  const live = arena(g, [foe(1, 0, 0), foe(2, 0, 0)])
  const [a, b] = live.enemies as [Enemy, Enemy]
  a.x = live.player.x
  a.y = live.player.y - 40
  b.x = live.player.x + 40
  b.y = live.player.y - 40
  live.player.faceX = 0
  live.player.faceY = -1
  step(live, { ...IDLE, cast: true }, 1 / 24)
  for (let i = 0; i < 24; i++) step(live, IDLE, 1 / 24)
  expect(a.hp < a.maxHp).toBe(true)
  expect(b.hp < b.maxHp).toBe(true)
})
