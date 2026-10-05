import type { CombatStats, Src } from './data'
import type { RGB } from './art'
import type { Enemy, Live, Proj } from './sim'

// Build effects: statuses, extra shots, familiars, shields, on-kill bursts.
// The sim calls these at a few hook points; everything else lives here, so
// the sim stays the combat agent's and the build stays data.

/** What a foe carries: timers in seconds, burn/poison in damage a second. */
export type Status = {
  burn: number
  burnT: number
  poison: number
  poisonT: number
  chill: number
  chillT: number
  markT: number
  freezeT: number
  tick: number
  vis: number
  orbitCd: number
  baseSpeed: number
}

type HitSrc = Src | 'other' | 'chain' | 'dot' | 'nova' | 'orbit'

/** What a player projectile remembers about the move that threw it. */
export type ProjFx = { src: HitSrc; homing: number; ricochet: number; pierce: boolean }

type Job =
  | { k: 'chain'; x: number; y: number; hit: number[]; dmg: number; jumps: number }
  | { k: 'nova'; x: number; y: number; r: number; dmg: number; color: RGB; poison: number }
  | { k: 'spread'; x: number; y: number; poison: number }

/** Per-room build state, kept on the Live. */
export type FxState = {
  shield: number
  charges: number
  chargeT: number
  orbitA: number
  src: HitSrc
  pending: { id: number; src: HitSrc } | null
  jobs: Job[]
  dashBuffT: number
  isBuffUsed: boolean
  vis: number
}

type DamageFn = (live: Live, e: Enemy, amount: number, isCrit: boolean, kx: number, ky: number) => void

const C_BURN: RGB = [210, 125, 44]
const C_POISON: RGB = [109, 170, 44]
const C_CHILL: RGB = [109, 194, 202]
const C_MARK: RGB = [218, 212, 94]
const C_ZAP: RGB = [222, 238, 214]
const C_SHIELD: RGB = [89, 125, 206]

// ---------- helpers ----------

/** The sim's own generator, so a seeded room plays the same. */
function rnd(live: Live): number {
  let t = (live.rng = (live.rng + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)
const norm = (x: number, y: number): [number, number] => {
  const d = Math.hypot(x, y)
  return d < 1e-6 ? [0, 0] : [x / d, y / d]
}
const isBoss = (e: Enemy) => e.kind === 'boss' || e.kind === 'nemesis'
const isMove = (src: HitSrc): src is Src => src === 'attack' || src === 'special' || src === 'cast' || src === 'dash'

export function state(live: Live): FxState {
  if (!live.effects) {
    live.effects = {
      shield: live.stats.shield ?? 0, charges: live.stats.dashCharges ?? 0, chargeT: 0, orbitA: 0, src: 'other',
      pending: null, jobs: [], dashBuffT: 0, isBuffUsed: false, vis: 0,
    }
  }
  return live.effects
}

function statusOf(e: Enemy): Status {
  if (!e.status) e.status = { burn: 0, burnT: 0, poison: 0, poisonT: 0, chill: 0, chillT: 0, markT: 0, freezeT: 0, tick: 0, vis: 0, orbitCd: 0, baseSpeed: e.speed }
  return e.status
}

function nearest(live: Live, x: number, y: number, range: number, skip: number[] = []): Enemy | null {
  let best: Enemy | null = null
  let bestD = range
  for (const e of live.enemies) {
    if (e.state === 'spawn' || e.hp <= 0 || skip.includes(e.id)) continue
    const d = dist(x, y, e.x, e.y)
    if (d < bestD) { best = e; bestD = d }
  }
  return best
}

function num(live: Live, x: number, y: number, text: string, color: RGB) {
  live.fx.push({ kind: 'num', x, y, ttl: 0.6, max: 0.6, color, text })
}

function heal(live: Live, n: number) {
  const s = live.stats
  const p = live.player
  const over = p.hp + n - s.maxHp
  p.hp = Math.min(s.maxHp, p.hp + n)
  if (over > 0 && s.healToShield) {
    const fx = state(live)
    fx.shield = Math.min(shieldCap(s), fx.shield + over)
  }
}

const shieldCap = (s: CombatStats) => Math.max(s.shield, 15)

function chill(st: Status, v: number) {
  st.chill = Math.min(0.7, Math.max(st.chill, v))
  st.chillT = 2.5
}

function freeze(live: Live, e: Enemy, st: Status) {
  if (isBoss(e)) { chill(st, 0.5); return }
  st.freezeT = 1.2
  e.state = 'stun'
  e.t = Math.max(e.t, 1.2)
  e.vx = 0
  e.vy = 0
  num(live, e.x, e.y - e.r - 6, 'gel', C_CHILL)
}

function stun(e: Enemy, t: number) {
  if (isBoss(e) || e.hp <= 0) return
  e.state = 'stun'
  e.t = Math.max(e.t, t)
  e.vx = 0
  e.vy = 0
}

function addAlly(live: Live, x: number, y: number) {
  if (live.allies.length >= 5) return
  live.allies.push({ x, y, t: 0, dmg: Math.round(6 * live.stats.dmg) })
}

// ---------- hook points ----------

/** createRoom, last: shields up, familiars summoned. */
export function onRoomStart(live: Live) {
  const fx = state(live)
  const s = live.stats
  fx.shield = s.shield
  fx.charges = s.dashCharges
  for (let i = 0; i < s.summons; i++) addAlly(live, live.player.x - 8 + i * 4, live.player.y - 4)
}

/** doAttack, first: the swing's hits are 'attack'; extra shots fly. */
export function onAttack(live: Live) {
  const fx = state(live)
  const s = live.stats
  fx.src = 'attack'
  const n = Math.round(s.extraShots)
  if (n <= 0) return
  const p = live.player
  const target = nearest(live, p.x, p.y, 140)
  const [dx, dy] = target ? norm(target.x - p.x, target.y - p.y) : [p.faceX, p.faceY]
  const isArc = live.weapon === 'arc'
  const dmg = (isArc ? 10 : 8) * s.dmg * s.attackMult
  for (let i = 0; i < n; i++) {
    // The bow's own arrow flies straight: extra ones fan out around it.
    const k = isArc ? i + 1 : i
    const a = (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * 0.2
    const vx = dx * Math.cos(a) - dy * Math.sin(a)
    const vy = dx * Math.sin(a) + dy * Math.cos(a)
    const pr: Proj = {
      id: live.nextId++, kind: 'arrow', team: 'p', x: p.x + vx * 5, y: p.y - 3 + vy * 5, vx: vx * 220, vy: vy * 220,
      r: 2, dmg, ttl: isArc ? 1.0 : 0.55, pierce: false, hits: [], isReturning: false, bounces: 0, isLodging: false, heal: 0,
    }
    live.projs.push(pr)
    onShoot(live, pr)
  }
}

/** doSpecial, first. */
export function onSpecial(live: Live) {
  state(live).src = 'special'
}

/** doCast, once the bolt is paid for. */
export function onCast(live: Live) {
  state(live).src = 'cast'
}

/** doDash, last: charges, shield, lightning, the next swing's buff. */
export function onDash(live: Live) {
  const fx = state(live)
  const s = live.stats
  const p = live.player
  fx.src = 'dash'
  if (fx.charges > 0) {
    fx.charges -= 1
    p.dashCd = Math.min(p.dashCd, 0.12)
  }
  if (s.dashShield > 0) fx.shield = Math.min(shieldCap(s), fx.shield + s.dashShield)
  if (s.dashAttackBuff > 0) fx.dashBuffT = 1.5
  if (s.dashZap > 0) fx.jobs.push({ k: 'chain', x: p.x, y: p.y, hit: [], dmg: 8 * s.dmg, jumps: Math.round(s.dashZap) })
}

/** shoot, after the push: tag the projectile and grow it. */
export function onShoot(live: Live, pr: Proj | undefined) {
  if (!pr || pr.team !== 'p') return
  const s = live.stats
  const isShot = pr.kind === 'arrow' || pr.kind === 'bolt'
  if (isShot && s.pierce) pr.pierce = true
  pr.fx = { src: state(live).src, homing: isShot ? s.homing : 0, ricochet: isShot ? Math.round(s.ricochet) : 0, pierce: pr.pierce }
  pr.r += s.projSize
  if (pr.kind === 'shield') pr.bounces += Math.round(s.shieldBounce)
}

/** A player projectile is about to hit `e`: the hit takes its source; it may ricochet. */
export function onProjHit(live: Live, pr: Proj, e: Enemy) {
  const fx = state(live)
  const info = pr.fx
  fx.pending = { id: e.id, src: info?.src ?? 'other' }
  // Piercing shots go through anyway; the others jump while they can.
  if (!info || info.pierce) return
  const next = info.ricochet > 0 ? nearest(live, e.x, e.y, 70, [...pr.hits, e.id]) : null
  if (!next) { pr.pierce = false; return }
  info.ricochet -= 1
  const speed = Math.max(150, Math.hypot(pr.vx, pr.vy))
  const [nx, ny] = norm(next.x - pr.x, next.y - pr.y)
  pr.vx = nx * speed
  pr.vy = ny * speed
  pr.ttl = Math.max(pr.ttl, 0.6)
  pr.pierce = true
}

function srcFor(fx: FxState, e: Enemy): HitSrc {
  return fx.pending && fx.pending.id === e.id ? fx.pending.src : fx.src
}

/** damageEnemy, in the damage line: marks, chills, bosses, crits, the dash buff. */
export function damageMult(live: Live, e: Enemy, isCrit: boolean): number {
  const s = live.stats
  const fx = state(live)
  const st = e.status
  let m = 1
  if (st && st.markT > 0) m += s.markBonus
  if (st && st.chillT > 0) m += s.chillDmg
  if (isBoss(e)) m += s.bossDmg
  if (e.hp >= e.maxHp) m += s.freshDmg
  if (live.player.hp <= s.maxHp * 0.35) m += s.lowHpDmg
  if (fx.dashBuffT > 0 && srcFor(fx, e) === 'attack') {
    m += s.dashAttackBuff
    fx.isBuffUsed = true
  }
  if (isCrit) m *= s.critDmg / 2
  return m
}

/** damageEnemy, after the hp drops (before the kill check): statuses, chains, executes. */
export function onPlayerHit(live: Live, e: Enemy, dmg: number, isCrit: boolean) {
  const fx = state(live)
  const src = srcFor(fx, e)
  if (fx.pending && fx.pending.id === e.id) fx.pending = null
  if (!isMove(src)) return
  const s = live.stats
  const h = s.onHit[src]
  if (src === 'attack' && s.hitHeal > 0) heal(live, s.hitHeal)
  if (src === 'special' && s.shieldOnHit > 0) fx.shield = Math.min(shieldCap(s), fx.shield + s.shieldOnHit)
  if (h.chain > 0) fx.jobs.push({ k: 'chain', x: e.x, y: e.y, hit: [e.id], dmg: Math.max(1, dmg * s.chainDmg), jumps: Math.round(h.chain + s.chainBonus) })
  if (e.hp <= 0) return
  const st = statusOf(e)
  if (h.burn > 0) {
    st.burn = Math.max(st.burn, h.burn)
    st.burnT = 3
    if (s.burnMarks) st.markT = Math.max(st.markT, 3)
  }
  if (h.poison > 0) {
    st.poison = Math.max(st.poison, Math.min(st.poison + h.poison, h.poison * 5))
    st.poisonT = 4
    if (s.poisonChill > 0) chill(st, s.poisonChill)
  }
  if (h.mark > 0) {
    st.markT = Math.max(st.markT, h.mark)
    if (s.markChill > 0) chill(st, s.markChill)
  }
  if (h.chill > 0) chill(st, h.chill)
  const freezeChance = h.freeze + (st.chillT > 0 ? s.chillFreeze : 0)
  if (freezeChance > 0 && st.freezeT <= 0 && rnd(live) < freezeChance) freeze(live, e, st)
  if (h.stun > 0) stun(e, h.stun)
  if (s.execute > 0 && !isBoss(e) && e.hp < e.maxHp * s.execute) {
    e.hp = 0
    num(live, e.x, e.y - e.r - 8, 'exécuté', C_BURN)
  }
  if (isCrit && s.burnMarks && st.burnT > 0) st.markT = Math.max(st.markT, 3)
}

/** killEnemy, first: bursts, spreading poison, new familiars, a fresh dash. */
export function onKill(live: Live, e: Enemy) {
  const fx = state(live)
  const s = live.stats
  if (s.lifesteal > 0 && s.healToShield) {
    const over = live.player.hp + s.lifesteal - s.maxHp
    if (over > 0) fx.shield = Math.min(shieldCap(s), fx.shield + over)
  }
  if (s.explodeOnKill > 0) fx.jobs.push({ k: 'nova', x: e.x, y: e.y, r: 20, dmg: s.explodeOnKill * s.dmg, color: C_BURN, poison: 0 })
  if (s.poisonSpread && e.status && e.status.poisonT > 0 && e.status.poison > 0) fx.jobs.push({ k: 'spread', x: e.x, y: e.y, poison: e.status.poison })
  if (s.killSummon > 0 && e.kind !== 'minion' && rnd(live) < s.killSummon) addAlly(live, e.x, e.y)
  if (s.dashOnKill) live.player.dashCd = 0
}

/** hurtPlayer, after the dodge: armour, then the shield. Returns what gets through. */
export function onPlayerHurt(live: Live, amount: number, from: Enemy | null): number {
  const fx = state(live)
  const s = live.stats
  const p = live.player
  let left = s.armor > 0 ? Math.max(1, Math.round(amount * (1 - Math.min(0.6, s.armor)))) : amount
  if (s.hurtNova > 0) fx.jobs.push({ k: 'nova', x: p.x, y: p.y, r: 22, dmg: s.hurtNova * s.dmg, color: C_BURN, poison: 0 })
  if (s.hurtPoison > 0) fx.jobs.push({ k: 'nova', x: p.x, y: p.y, r: 26, dmg: 0, color: C_POISON, poison: s.hurtPoison })
  if (fx.shield > 0) {
    const took = Math.min(fx.shield, left)
    fx.shield -= took
    left -= took
    live.fx.push({ kind: 'ring', x: p.x, y: p.y - 3, ttl: 0.2, max: 0.2, color: C_SHIELD, r: 8 })
    if (left <= 0) {
      p.iframes = Math.max(p.iframes, 0.4)
      num(live, p.x, p.y - 12, 'bloqué', C_SHIELD)
      if (from && s.thorns > 0) fx.jobs.push({ k: 'nova', x: from.x, y: from.y, r: 2, dmg: s.thorns, color: C_POISON, poison: 0 })
      return 0
    }
  }
  return left
}

// ---------- the tick ----------

/** step, right after the player moved: jobs, statuses, orbitals, homing, then the hit source resets. */
export function tickEffects(live: Live, dt: number, damage: DamageFn) {
  const fx = state(live)
  const s = live.stats
  const p = live.player

  // Swing speed: the sim counts the cooldown down at 1, we add the rest.
  if (s.attackSpeed !== 1 && p.atkCd > 0) p.atkCd = Math.max(0, p.atkCd - dt * (s.attackSpeed - 1))
  if (fx.charges < s.dashCharges) {
    fx.chargeT += dt
    if (fx.chargeT >= 1.4) { fx.chargeT = 0; fx.charges += 1 }
  }
  if (fx.isBuffUsed) { fx.dashBuffT = 0; fx.isBuffUsed = false }
  fx.dashBuffT = Math.max(0, fx.dashBuffT - dt)
  if (s.shieldRegen > 0 && fx.shield < s.shield) fx.shield = Math.min(s.shield, fx.shield + s.shieldRegen * dt * 0.5)

  runJobs(live, fx, damage)
  tickStatuses(live, fx, dt, damage)
  tickOrbitals(live, fx, dt, damage)
  tickHoming(live, dt)

  fx.vis -= dt
  if (fx.vis <= 0) {
    fx.vis = 0.6
    if (fx.shield >= 1) live.fx.push({ kind: 'ring', x: p.x, y: p.y - 3, ttl: 0.3, max: 0.3, color: C_SHIELD, r: 7 })
  }
  fx.src = p.dashT > 0 ? 'dash' : 'other'
  fx.pending = null
}

function runJobs(live: Live, fx: FxState, damage: DamageFn) {
  const s = live.stats
  for (let guard = 0; fx.jobs.length > 0 && guard < 60; guard++) {
    const job = fx.jobs.shift()!
    if (job.k === 'chain') {
      let x = job.x
      let y = job.y
      for (let j = 0; j < job.jumps; j++) {
        const t = nearest(live, x, y, 52, job.hit)
        if (!t) break
        job.hit.push(t.id)
        live.fx.push({ kind: 'line', x, y: y - 2, x2: t.x, y2: t.y - 2, ttl: 0.14, max: 0.14, color: C_ZAP })
        fx.src = 'chain'
        damage(live, t, job.dmg, false, 0, 0)
        if (s.chainBurn > 0 && t.hp > 0) {
          const st = statusOf(t)
          st.burn = Math.max(st.burn, s.chainBurn)
          st.burnT = 3
        }
        x = t.x
        y = t.y
      }
    } else if (job.k === 'nova') {
      live.fx.push({ kind: 'ring', x: job.x, y: job.y - 2, ttl: 0.25, max: 0.25, color: job.color, r: job.r })
      for (const e of [...live.enemies]) {
        if (e.state === 'spawn' || dist(job.x, job.y, e.x, e.y) > job.r + e.r) continue
        if (job.poison > 0 && e.hp > 0) {
          const st = statusOf(e)
          st.poison = Math.max(st.poison, job.poison)
          st.poisonT = 4
        }
        if (job.dmg > 0) {
          fx.src = 'nova'
          const [nx, ny] = norm(e.x - job.x, e.y - job.y)
          damage(live, e, job.dmg, false, nx * 3, ny * 3)
        }
      }
    } else {
      for (const e of live.enemies) {
        if (e.state === 'spawn' || dist(job.x, job.y, e.x, e.y) > 26 + e.r) continue
        const st = statusOf(e)
        st.poison = Math.max(st.poison, job.poison)
        st.poisonT = 4
      }
      live.fx.push({ kind: 'ring', x: job.x, y: job.y - 2, ttl: 0.3, max: 0.3, color: C_POISON, r: 26 })
    }
  }
  fx.jobs = []
}

function tickStatuses(live: Live, fx: FxState, dt: number, damage: DamageFn) {
  const s = live.stats
  for (const e of [...live.enemies]) {
    const st = e.status
    if (!st || e.hp <= 0) continue
    st.burnT = Math.max(0, st.burnT - dt)
    st.poisonT = Math.max(0, st.poisonT - dt)
    st.markT = Math.max(0, st.markT - dt)
    st.orbitCd = Math.max(0, st.orbitCd - dt)
    if (st.freezeT > 0) {
      st.freezeT -= dt
      if (e.state !== 'spawn') e.state = 'stun'
      e.t = Math.max(e.t, st.freezeT)
    }
    st.chillT = Math.max(0, st.chillT - dt)
    if (st.chillT > 0) e.speed = st.baseSpeed * (1 - st.chill)
    else if (st.chill > 0) { st.chill = 0; e.speed = st.baseSpeed }
    if (st.burnT <= 0) st.burn = 0
    if (st.poisonT <= 0) st.poison = 0

    st.tick += dt
    if (st.tick >= 0.5) {
      st.tick -= 0.5
      const both = s.toxicFire && st.burn > 0 && st.poison > 0 ? 2 : 1
      const dot = (st.burn * s.burnMult + st.poison * s.poisonMult) * 0.5 * both
      if (dot > 0) {
        const amount = Math.max(1, Math.round(dot * damageMult(live, e, false)))
        const color = st.burn > 0 ? C_BURN : C_POISON
        if (e.hp - amount <= 0) {
          fx.src = 'dot'
          damage(live, e, amount, false, 0, 0)
          continue
        }
        e.hp -= amount
        e.flash = Math.max(e.flash, 0.05)
        num(live, e.x + (rnd(live) - 0.5) * 6, e.y - e.r - 4, `${amount}`, color)
      }
    }
    st.vis -= dt
    if (st.vis <= 0) {
      st.vis = 0.3
      const color = st.freezeT > 0 || st.chillT > 0 ? C_CHILL : st.burnT > 0 ? C_BURN : st.poisonT > 0 ? C_POISON : st.markT > 0 ? C_MARK : null
      if (color) live.fx.push({ kind: 'spark', x: e.x + (rnd(live) - 0.5) * e.r * 2, y: e.y - e.r, ttl: 0.4, max: 0.4, color, a: -Math.PI / 2, r: 12 })
      if (st.markT > 0 && color !== C_MARK) live.fx.push({ kind: 'spark', x: e.x, y: e.y - e.r - 5, ttl: 0.3, max: 0.3, color: C_MARK, a: -Math.PI / 2, r: 4 })
    }
  }
}

function tickOrbitals(live: Live, fx: FxState, dt: number, damage: DamageFn) {
  const s = live.stats
  const n = Math.round(s.orbitals)
  if (n <= 0) return
  const p = live.player
  fx.orbitA += dt * 3.4
  for (let i = 0; i < n; i++) {
    const a = fx.orbitA + (i / n) * Math.PI * 2
    const ox = p.x + Math.cos(a) * 13
    const oy = p.y - 3 + Math.sin(a) * 10
    live.fx.push({ kind: 'spark', x: ox, y: oy, ttl: 0.07, max: 0.07, color: C_ZAP, a: 0, r: 0 })
    live.fx.push({ kind: 'spark', x: ox - Math.cos(a + 0.3) * 2, y: oy - Math.sin(a + 0.3) * 2, ttl: 0.12, max: 0.12, color: C_CHILL, a: 0, r: 0 })
    for (const e of [...live.enemies]) {
      if (e.state === 'spawn' || e.hp <= 0 || dist(ox, oy, e.x, e.y - 2) > e.r + 3) continue
      const st = statusOf(e)
      if (st.orbitCd > 0) continue
      st.orbitCd = 0.45
      fx.src = 'orbit'
      damage(live, e, s.orbitDmg * s.dmg, false, 0, 0)
    }
  }
}

function tickHoming(live: Live, dt: number) {
  for (const pr of live.projs) {
    const h = pr.fx?.homing ?? 0
    if (h <= 0 || pr.team !== 'p' || pr.isReturning) continue
    const t = nearest(live, pr.x, pr.y, 90, pr.hits)
    if (!t) continue
    const speed = Math.hypot(pr.vx, pr.vy)
    const [cx, cy] = norm(pr.vx, pr.vy)
    const [tx, ty] = norm(t.x - pr.x, t.y - 2 - pr.y)
    const [nx, ny] = norm(cx + tx * h * dt, cy + ty * h * dt)
    pr.vx = nx * speed
    pr.vy = ny * speed
  }
}
