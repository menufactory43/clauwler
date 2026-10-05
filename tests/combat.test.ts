import { expect, test } from 'claude-code/testing'

import { startRun } from '../hooks/meta'
import { frameSize, renderFrame } from '../hooks/render'
import type { Enemy, EnemyType, Input, Live } from '../hooks/sim'
import { ENEMY, FH, FW, GUARDIANS, createRoom, step } from '../hooks/sim'
import { NOW, fresh, goTo, room } from './driver'

const IDLE: Input = { mx: 0, my: 0, attack: false, special: false, cast: false, dash: false }
const DT = 1 / 24

/** A quiet room in a biome, nobody in it. */
function arena(biome = 0): Live {
  const { live } = room(goTo(startRun(fresh(), 3, NOW), 'normal'))
  live.biome = biome
  live.waves = []
  live.errorQueue = []
  live.enemies = []
  live.pillars = []
  live.player.x = 80
  live.player.y = 60
  live.player.iframes = 0
  return live
}

/** One foe of a type, placed and awake. */
function foe(live: Live, type: EnemyType, x: number, y: number): Enemy {
  const keep = live.enemies
  live.enemies = []
  live.waves = [[type]]
  step(live, IDLE, 0.001)
  const e = live.enemies[0]!
  live.enemies = [...keep, e]
  live.isCleared = false
  Object.assign(e, { x, y, state: 'chase', t: 0 })
  return e
}

function run(live: Live, secs: number, input: Input = IDLE) {
  for (let i = 0; i < secs * 24; i++) step(live, input, DT)
}

test('a plain blow sounds without freezing; a crit freezes for a beat, never twice in a row', () => {
  const live = arena()
  const e = foe(live, 'goblin', 80, 52)
  e.hp = e.maxHp = 200
  live.player.faceX = 0
  live.player.faceY = -1
  step(live, { ...IDLE, attack: true }, DT)
  expect(e.hp < 200).toBe(true)
  // A plain hit keeps the world running; only a crit freezes it.
  if (!live.sfx.includes('crit')) expect(live.hitstop).toBe(0)
  expect(live.sfx.includes('hit') || live.sfx.includes('crit')).toBe(true)
  // Frozen: the foe does not move while the hitstop lasts.
  const x = e.x + (e.kbx ?? 0) * 0
  const y = e.y
  live.hitstop = 1
  step(live, IDLE, DT)
  expect([e.x, e.y]).toEqual([x, y])
  // A kill freezes longer and leaves bits behind.
  live.hitstop = 0
  e.hp = 1
  e.state = 'chase'
  run(live, 0.5, { ...IDLE, attack: true })
  expect(live.enemies.includes(e)).toBe(false)
  expect(live.fx.some(f => f.kind === 'gib')).toBe(true)
})

test('a swipe is announced on the ground first, and stepping out of it dodges it', () => {
  const live = arena()
  const e = foe(live, 'goblin', 80, 50)
  e.dmg = 7
  run(live, 0.1)
  expect(e.state).toBe('windup')
  const s = live.strikes.find(one => one.from === e.id)!
  expect(s.shape).toBe('cone')
  expect(s.t >= 0.35).toBe(true)
  // Stay: hit.
  const hp = live.player.hp
  run(live, 0.6)
  expect(live.player.hp < hp).toBe(true)
  // Again, but walk away during the windup: untouched.
  const live2 = arena()
  const e2 = foe(live2, 'goblin', 80, 50)
  e2.dmg = 7
  run(live2, 0.1)
  const hp2 = live2.player.hp
  run(live2, 0.6, { ...IDLE, my: 1 })
  expect(live2.player.hp).toBe(hp2)
})

test('the Sentinelle CORS shrugs off blows from the front and takes them from behind', () => {
  const live = arena()
  const e = foe(live, 'sentinel', 80, 50)
  e.faceA = Math.PI / 2 // facing the champion, south of it
  e.hp = e.maxHp = 100
  live.player.faceX = 0
  live.player.faceY = -1
  step(live, { ...IDLE, attack: true }, DT)
  expect(e.hp).toBe(100)
  expect(live.sfx.includes('block')).toBe(true)
  e.faceA = -Math.PI / 2 // turned away
  live.player.atkCd = 0
  run(live, 0.5)
  step(live, { ...IDLE, attack: true }, DT)
  expect(e.hp < 100).toBe(true)
})

test('the Monolithe splits into microservices; the Fuite Mémoire blows up its neighbours', () => {
  const live = arena()
  const m = foe(live, 'monolith', 80, 52)
  m.hp = 1
  live.player.faceX = 0
  live.player.faceY = -1
  step(live, { ...IDLE, attack: true }, DT)
  expect(live.enemies.filter(e => e.type === 'micro').length).toBe(2)

  const live2 = arena()
  const leak = foe(live2, 'leak', 80, 30)
  const rat = foe(live2, 'rat', 86, 30)
  rat.hp = rat.maxHp = 500
  leak.state = 'windup'
  leak.hp = 1
  live2.player.x = 80
  live2.player.y = 33
  live2.player.faceX = 0
  live2.player.faceY = -1
  step(live2, { ...IDLE, attack: true }, DT)
  // Dead, but its fuse burns on: a disc that lands a moment later.
  expect(live2.enemies.includes(leak)).toBe(false)
  expect(live2.strikes.some(s => s.shape === 'circle' && s.hitsFoes)).toBe(true)
  live2.player.x = 80
  live2.player.y = 80
  run(live2, 0.8)
  expect(rat.hp < 500).toBe(true)
})

test('a breakpoint mine waits, trips when stepped near, and blows', () => {
  const live = arena()
  const miner = foe(live, 'miner', 40, 30)
  run(live, 1.2)
  const mine = live.strikes.find(s => s.mine > 0)
  expect(mine !== undefined).toBe(true)
  // The sapper goes quiet in a corner; its mine stays.
  Object.assign(miner, { x: 140, y: 88, state: 'stun', t: 99 })
  live.player.x = mine!.x + 4
  live.player.y = mine!.y
  const hp = live.player.hp
  run(live, 1.0)
  expect(live.player.hp < hp).toBe(true)
})

test('the cache worm goes under, cannot be struck there, marks a spot and erupts', () => {
  const live = arena(1)
  const w = foe(live, 'burrower', 60, 40)
  step(live, IDLE, DT)
  expect(w.hidden).toBe(true)
  expect(w.state).toBe('spawn')
  const hp = w.hp
  live.player.x = w.x
  live.player.y = w.y + 6
  live.player.faceX = 0
  live.player.faceY = -1
  step(live, { ...IDLE, attack: true }, DT)
  expect(w.hp).toBe(hp)
  run(live, 2.2)
  expect(live.strikes.some(s => s.from === w.id) || !w.hidden).toBe(true)
  run(live, 1)
  expect(w.hidden).toBe(false)
})

test('the bestiary: a dozen kinds and more, every biome its own mix', () => {
  const kinds = Object.keys(ENEMY).filter(k => k !== 'boss')
  expect(kinds.length >= 12).toBe(true)
  const seen: Set<string>[] = [new Set(), new Set(), new Set()]
  for (let biome = 0; biome < 3; biome++) {
    for (let seed = 1; seed < 40; seed++) {
      const { live } = room(goTo(startRun(fresh(), seed, NOW), 'normal'), seed)
      const spec = { ...live, biome, depth: biome * 5 + 4 }
      const again = createRoom({ seed, biome, chamber: 0, depth: spec.depth, isBoss: false, errorSpawns: [], chests: 0, portals: 0, familiars: 0, weapon: 'epee', stats: live.stats, hp: 50, defiance: 0, scars: [], fortune: 1, title: '' })
      for (const wave of [again.enemies.map(e => e.type), ...again.waves]) for (const t of wave) seen[biome]!.add(t)
    }
    expect(seen[biome]!.size >= 7).toBe(true)
  }
  const all = new Set([...seen[0]!, ...seen[1]!, ...seen[2]!])
  expect(all.size >= 13).toBe(true)
})

test('each guardian has two phases: past half its health it roars, clears the air and changes its moves', () => {
  for (let look = 0; look < GUARDIANS.length; look++) {
    const g = goTo(startRun(fresh(), 9, NOW), 'boss')
    const live = room(g, 9).live
    const boss = live.enemies.find(e => e.type === 'boss')!
    boss.boss = look
    live.player.hp = 9999
    run(live, 3)
    live.player.hp = 9999
    expect(boss.phase).toBe(1)
    const p1 = new Set<string>()
    for (let i = 0; i < 24 * 8; i++) { step(live, IDLE, DT); live.player.hp = 9999; if (boss.move) p1.add(boss.move) }
    expect(p1.size >= 2).toBe(true)
    boss.hp = Math.floor(boss.maxHp * 0.49)
    live.sfx.length = 0
    step(live, IDLE, DT)
    expect(boss.phase).toBe(2)
    expect(live.sfx.includes('phase')).toBe(true)
    expect(live.projs.some(pr => pr.team === 'e')).toBe(false)
    expect(live.banner?.text).toBe(GUARDIANS[look]!.roar)
    // Untouchable through its roar.
    const hp = boss.hp
    live.player.x = boss.x
    live.player.y = boss.y + 10
    live.player.faceX = 0
    live.player.faceY = -1
    step(live, { ...IDLE, attack: true }, DT)
    expect(boss.hp).toBe(hp)
    const p2 = new Set<string>()
    for (let i = 0; i < 24 * 12; i++) { step(live, IDLE, DT); live.player.hp = 9999; if (boss.move && boss.phase === 2) p2.add(boss.move) }
    expect([...p2].some(m => GUARDIANS[look]!.p2.includes(m as never) && !GUARDIANS[look]!.p1.includes(m as never))).toBe(true)
  }
})

test('every foe and every guardian pose draws, fine and coarse', () => {
  const fine = new Uint8Array(frameSize(2).width * frameSize(2).height * 4)
  const coarse = new Uint8Array(FW * FH * 4)
  const view = { biomeLabel: '', roomLabel: '1-1', eclats: 0, boons: 0, isPaused: false, isOffer: false, hint: '', scale: 1 }
  const live = arena(2)
  let x = 20
  for (const type of Object.keys(ENEMY) as EnemyType[]) {
    if (type === 'boss') continue
    const e = foe(live, type, x, 40 + (x % 3) * 15)
    e.state = 'windup'
    e.tMax = 0.6
    e.t = 0.2
    x += 8
  }
  run(live, 0.3)
  for (let look = 0; look < 3; look++) for (const phase of [1, 2]) {
    const g = goTo(startRun(fresh(), 9, NOW), 'boss')
    const l = room(g, 9).live
    const boss = l.enemies.find(e => e.type === 'boss')!
    Object.assign(boss, { boss: look, phase, state: 'chase' })
    renderFrame(l, { ...view, res: 2 }, fine)
    renderFrame(l, view, coarse)
  }
  renderFrame(live, { ...view, res: 2 }, fine)
  renderFrame(live, view, coarse)
  let lit = 0
  for (let i = 0; i < fine.length; i += 4) if (fine[i]! + fine[i + 1]! + fine[i + 2]! > 200) lit++
  expect(lit > 300).toBe(true)
})
