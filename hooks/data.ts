import type { ClassId, Slot, StatKey, WeaponId } from '../types'
import { L, Pair, localize, localizeAll, num, pct, tr } from './i18n'

// ---------- combat stats ----------

/** Where a hit comes from: statuses ride on the move that lands them. */
export type Src = 'attack' | 'special' | 'cast' | 'dash'
export const SRCS: Src[] = ['attack', 'special', 'cast', 'dash']

/**
 * What a hit leaves on a foe. burn: damage a second for 3 s (the strongest
 * wins); poison: damage a second that stacks up to 5 doses; chill: slow (0..0.7);
 * mark: seconds the foe takes more damage; chain: lightning jumps; freeze:
 * chance to freeze 1.2 s; stun: seconds stunned.
 */
export type OnHit = { burn: number; poison: number; chill: number; mark: number; chain: number; freeze: number; stun: number }

export const noHit = (): OnHit => ({ burn: 0, poison: 0, chill: 0, mark: 0, chain: 0, freeze: 0, stun: 0 })

export type CombatStats = {
  maxHp: number
  dmg: number
  attackMult: number
  specialMult: number
  castMult: number
  crit: number
  attackCrit: number
  lifesteal: number
  thorns: number
  dodge: number
  castAmmo: number
  castSplit: boolean
  castHeal: number
  castWoundCrit: boolean
  dashCd: number
  dashIframes: number
  dashNova: number
  dashTrail: number
  specialEcho: boolean
  specialStun: number
  attackKnock: number
  // Statuses each move applies, and how hard they bite.
  onHit: Record<Src, OnHit>
  markBonus: number
  chillDmg: number
  critDmg: number
  burnMult: number
  poisonMult: number
  chainDmg: number
  chainBonus: number
  execute: number
  bossDmg: number
  freshDmg: number
  lowHpDmg: number
  // Defence.
  armor: number
  shield: number
  shieldRegen: number
  shieldOnHit: number
  dashShield: number
  hitHeal: number
  healToShield: boolean
  hurtNova: number
  hurtPoison: number
  // On kill.
  explodeOnKill: number
  killSummon: number
  dashOnKill: boolean
  poisonSpread: boolean
  // Shots and bodies.
  attackSpeed: number
  extraShots: number
  homing: number
  projSize: number
  pierce: boolean
  ricochet: number
  shieldBounce: number
  orbitals: number
  orbitDmg: number
  summons: number
  dashCharges: number
  dashZap: number
  dashAttackBuff: number
  // Duo synergies.
  burnMarks: boolean
  toxicFire: boolean
  chillFreeze: number
  chainBurn: number
  poisonChill: number
  markChill: number
  // Between rooms (meta).
  roomHeal: number
  killShards: number
  luck: number
  shopDiscount: number
}

export function baseStats(): CombatStats {
  return {
    maxHp: 50, dmg: 1, attackMult: 1, specialMult: 1, castMult: 1, crit: 0.03, attackCrit: 0,
    lifesteal: 0, thorns: 0, dodge: 0, castAmmo: 1, castSplit: false, castHeal: 0, castWoundCrit: false,
    dashCd: 0.45, dashIframes: 0.2, dashNova: 0, dashTrail: 0, specialEcho: false, specialStun: 0, attackKnock: 1,
    onHit: { attack: noHit(), special: noHit(), cast: noHit(), dash: noHit() },
    markBonus: 0.3, chillDmg: 0, critDmg: 2, burnMult: 1, poisonMult: 1, chainDmg: 0.5, chainBonus: 0,
    execute: 0, bossDmg: 0, freshDmg: 0, lowHpDmg: 0,
    armor: 0, shield: 0, shieldRegen: 0, shieldOnHit: 0, dashShield: 0, hitHeal: 0, healToShield: false, hurtNova: 0, hurtPoison: 0,
    explodeOnKill: 0, killSummon: 0, dashOnKill: false, poisonSpread: false,
    attackSpeed: 1, extraShots: 0, homing: 0, projSize: 0, pierce: false, ricochet: 0, shieldBounce: 0,
    orbitals: 0, orbitDmg: 6, summons: 0, dashCharges: 0, dashZap: 0, dashAttackBuff: 0,
    burnMarks: false, toxicFire: false, chillFreeze: 0, chainBurn: 0, poisonChill: 0, markChill: 0,
    roomHeal: 0, killShards: 0, luck: 0, shopDiscount: 0,
  }
}

/** Adds a status to every move at once. */
export function hitAll(s: CombatStats, key: keyof OnHit, v: number) {
  for (const src of SRCS) s.onHit[src][key] += v
}

export const CLASSES: Record<ClassId, { label: string; stack: string; perk: string; apply: (s: CombatStats) => void }> = {
  artificier: localize({ label: L('Artificier', 'Artificer'), stack: 'Swift', perk: L('+1 sort', '+1 cast'), apply: (s: CombatStats) => { s.castAmmo += 1 } }),
  forgeron: localize({ label: L('Forgeron', 'Smith'), stack: 'Rust', perk: L('+10 PV, épines 3', '+10 HP, thorns 3'), apply: (s: CombatStats) => { s.maxHp += 10; s.thorns += 3 } }),
  illusionniste: localize({ label: L('Illusionniste', 'Illusionist'), stack: 'TypeScript', perk: L('10% esquive', '10% dodge'), apply: (s: CombatStats) => { s.dodge += 0.1 } }),
  alchimiste: localize({ label: L('Alchimiste', 'Alchemist'), stack: 'Python', perk: L('+2 PV par victime', '+2 HP per kill'), apply: (s: CombatStats) => { s.lifesteal += 2 } }),
  rodeur: localize({ label: L('Rôdeur', 'Ranger'), stack: 'Go', perk: L('+10% dégâts', '+10% damage'), apply: (s: CombatStats) => { s.dmg += 0.1 } }),
  vagabond: localize({ label: L('Vagabond', 'Wanderer'), stack: L('divers', 'mixed'), perk: L('+5% critique', '+5% crit'), apply: (s: CombatStats) => { s.crit += 0.05 } }),
}

// ---------- weapons ----------

export type WeaponDef = {
  id: WeaponId
  name: string
  title: string
  attack: string
  special: string
  cost: number
}

export const WEAPONS: WeaponDef[] = localizeAll([
  { id: 'epee', name: 'Stack Trace', title: L('Épée', 'Sword'), attack: L('combo de 3 entailles, la 3e plus lourde', '3-slash combo, the 3rd one heavier'), special: L('onde de choc autour de toi', 'shockwave all around you'), cost: 0 },
  { id: 'lance', name: L('Pointeur', 'Pointer'), title: L('Lance', 'Spear'), attack: L('estoc longue portée', 'long-reach thrust'), special: L('lancer perçant qui revient', 'piercing throw that comes back'), cost: 30 },
  { id: 'arc', name: 'Ping', title: L('Arc', 'Bow'), attack: L('flèche rapide', 'quick arrow'), special: L('salve de 5 flèches', 'volley of 5 arrows'), cost: 50 },
  { id: 'bouclier', name: 'Firewall', title: L('Bouclier', 'Shield'), attack: L('coup de bouclier qui repousse', 'shield bash that knocks back'), special: L('lancer qui rebondit entre les ennemis ; le dash charge', 'throw that bounces between foes; the dash charges'), cost: 80 },
])

// ---------- weapon aspects: unlocked with shards in the Arsenal ----------

export type AspectDef = {
  id: string
  weapon: WeaponId
  name: string
  desc: string
  cost: number
  apply: (s: CombatStats) => void
}

export const ASPECTS: AspectDef[] = localizeAll([
  { id: 'epee-kernel', weapon: 'epee', name: L('Aspect du Kernel', 'Aspect of the Kernel'), desc: L('entailles +50% mais 20% plus lentes ; chaque coup étourdit 0,3 s', 'slashes +50% but 20% slower; every blow stuns 0.3 s'), cost: 40, apply: s => { s.attackMult += 0.5; s.attackSpeed -= 0.2; s.onHit.attack.stun += 0.3 } },
  { id: 'epee-thread', weapon: 'epee', name: L('Aspect du Thread', 'Aspect of the Thread'), desc: L('frappe 35% plus vite, attaque −15%, chaque coup empoisonne (1/s)', 'strikes 35% faster, attack −15%, every blow poisons (1/s)'), cost: 70, apply: s => { s.attackSpeed += 0.35; s.attackMult -= 0.15; s.onHit.attack.poison += 1 } },
  { id: 'lance-null', weapon: 'lance', name: L('Aspect du Pointeur Nul', 'Aspect of the Null Pointer'), desc: L('spécial +40%, la lance foudroie 2 ennemis de plus', 'special +40%, the spear zaps 2 more foes'), cost: 50, apply: s => { s.specialMult += 0.4; s.onHit.special.chain += 2 } },
  { id: 'lance-smart', weapon: 'lance', name: L('Aspect du Pointeur Malin', 'Aspect of the Smart Pointer'), desc: L("l'estoc marque 3 s et gagne +20% critique", 'the thrust marks for 3 s and gains +20% crit'), cost: 80, apply: s => { s.onHit.attack.mark += 3; s.attackCrit += 0.2 } },
  { id: 'arc-multicast', weapon: 'arc', name: L('Aspect Multicast', 'Multicast Aspect'), desc: L('chaque tir part en 3 flèches, attaque −30%', 'every shot leaves as 3 arrows, attack −30%'), cost: 60, apply: s => { s.extraShots += 2; s.attackMult -= 0.3 } },
  { id: 'arc-traceroute', weapon: 'arc', name: L('Aspect Traceroute', 'Traceroute Aspect'), desc: L('flèches perçantes à tête chercheuse, attaque −10%', 'piercing homing arrows, attack −10%'), cost: 90, apply: s => { s.pierce = true; s.homing += 4; s.attackMult -= 0.1 } },
  { id: 'bouclier-actif', weapon: 'bouclier', name: L('Aspect du Pare-feu Actif', 'Aspect of the Active Firewall'), desc: L('armure 20%, épines +8, frappe 10% plus lentement', 'armor 20%, thorns +8, strikes 10% slower'), cost: 70, apply: s => { s.armor += 0.2; s.thorns += 8; s.attackSpeed -= 0.1 } },
  { id: 'bouclier-proxy', weapon: 'bouclier', name: L('Aspect du Proxy Inverse', 'Aspect of the Reverse Proxy'), desc: L('le bouclier lancé rebondit 3 fois de plus et ralentit de 40%', 'the thrown shield bounces 3 more times and slows by 40%'), cost: 100, apply: s => { s.shieldBounce += 3; s.onHit.special.chill += 0.4 } },
])

// ---------- boons: one per slot, passives stack, held ones level up ----------

export type BoonDef = {
  id: string
  god: string
  slot: Slot
  name: string
  base: number
  desc: (v: number) => string
  apply: (s: CombatStats, v: number) => void
  /** Duo boons: the two gods whose boons must be held. */
  duo?: [string, string]
  /** Item: found in treasure rooms and shops, stacks when taken again. */
  isItem?: boolean
  /** Once, when taken (not each time stats are built). */
  onPick?: (run: { hp: number; eclats: number; defiance: number }, v: number) => void
}

/** The gods, each in both languages. */
const G = {
  grep: new Pair("Grep l'Œil", 'Grep the Eye'),
  sudo: new Pair('Sudo le Tout-Puissant', 'Sudo the Almighty'),
  fork: new Pair('Fork le Multiple', 'Fork the Many'),
  rebase: new Pair('Rebase le Temporel', 'Rebase the Timeless'),
  lint: new Pair('Lint la Rigoureuse', 'Lint the Strict'),
  cache: new Pair('Cache la Mémoire', 'Cache the Keeper'),
  commit: new Pair('Commit le Scellé', 'Commit the Sealed'),
  pipe: new Pair('Pipe le Fluide', 'Pipe the Flowing'),
} as const

/** The gods' names, in the current language. */
export const GODS = localize({ ...G } as unknown as Record<keyof typeof G, string>)

/** Each god's signature, shown with its boons. */
const GOD_SIGNS: Record<keyof typeof G, Pair> = {
  grep: new Pair('marque et critique', 'mark and crit'),
  sudo: new Pair('brûlure et puissance', 'burn and power'),
  fork: new Pair('tirs multiples et familiers', 'multishot and familiars'),
  rebase: new Pair('ralenti, gel et esquive', 'slow, freeze and dodge'),
  lint: new Pair('poison et épines', 'poison and thorns'),
  cache: new Pair('soins et bouclier', 'heals and shield'),
  commit: new Pair('PV, armure et étourdissement', 'HP, armor and stun'),
  pipe: new Pair('éclairs en chaîne et vitesse', 'chain lightning and speed'),
}

/** A god's signature, from its name in either language; empty when unknown. */
export function godStatus(god: string): string {
  for (const key of Object.keys(G) as (keyof typeof G)[]) {
    if (G[key].fr === god || G[key].en === god) return GOD_SIGNS[key].toString()
  }
  return ''
}

/** A god as a table field: reads as its name once the table is localized. */
const god = (p: Pair) => p as unknown as string
const duoGod = (a: Pair, b: Pair) => L(`${a.fr} ✕ ${b.fr}`, `${a.en} ✕ ${b.en}`)

const grep = god(G.grep)
const sudo = god(G.sudo)
const fork = god(G.fork)
const rebase = god(G.rebase)
const lint = god(G.lint)
const cache = god(G.cache)
const commit = god(G.commit)
const pipe = god(G.pipe)

export const GOD_BOONS: BoonDef[] = localizeAll<BoonDef>([
  // Grep: the mark (marked foes take +30% damage) and crits.
  { id: 'grep-attack', god: grep, slot: 'attack', name: L('Attaque perçante', 'Piercing Attack'), base: 0.3, desc: v => tr(`attaque +${pct(v)}, +15% critique, marque 2 s`, `attack +${pct(v)}, +15% crit, marks for 2 s`), apply: (s, v) => { s.attackMult += v; s.attackCrit += 0.15; s.onHit.attack.mark += 2 } },
  { id: 'grep-special', god: grep, slot: 'special', name: L('Spécial traqueur', 'Tracker Special'), base: 0.4, desc: v => tr(`spécial +${pct(v)}, marque 4 s`, `special +${pct(v)}, marks for 4 s`), apply: (s, v) => { s.specialMult += v; s.onHit.special.mark += 4 } },
  { id: 'grep-cast', god: grep, slot: 'cast', name: L('Regard ciblé', 'Targeted Gaze'), base: 0.5, desc: v => tr(`sort +${pct(v)}, toujours critique sur cible blessée, marque 4 s`, `cast +${pct(v)}, always crits wounded targets, marks for 4 s`), apply: (s, v) => { s.castMult += v; s.castWoundCrit = true; s.onHit.cast.mark += 4 } },
  { id: 'grep-dash', god: grep, slot: 'dash', name: L('Dash de recherche', 'Search Dash'), base: 0.8, desc: v => tr(`après un dash, la prochaine attaque fait +${pct(v)}`, `after a dash, the next attack deals +${pct(v)}`), apply: (s, v) => { s.dashAttackBuff += v } },
  { id: 'grep-crit', god: grep, slot: 'passive', name: L('Regex gourmande', 'Greedy Regex'), base: 0.06, desc: v => tr(`+${pct(v)} critique`, `+${pct(v)} crit`), apply: (s, v) => { s.crit += v } },
  { id: 'grep-mark', god: grep, slot: 'passive', name: L('Œil du lynx', 'Lynx Eye'), base: 0.2, desc: v => tr(`les ennemis marqués subissent +${pct(v)} de plus`, `marked foes take +${pct(v)} more`), apply: (s, v) => { s.markBonus += v } },
  { id: 'grep-fresh', god: grep, slot: 'passive', name: L('Premier match', 'First Match'), base: 0.5, desc: v => tr(`+${pct(v)} dégâts sur les ennemis intacts`, `+${pct(v)} damage to unhurt foes`), apply: (s, v) => { s.freshDmg += v } },

  // Sudo: burn and raw power.
  { id: 'sudo-attack', god: sudo, slot: 'attack', name: L('Frappe root', 'Root Strike'), base: 0.2, desc: v => tr(`attaque +${pct(v)}, repousse fort`, `attack +${pct(v)}, heavy knockback`), apply: (s, v) => { s.attackMult += v; s.attackKnock += 1 } },
  { id: 'sudo-burn', god: sudo, slot: 'attack', name: L('Attaque incendiaire', 'Incendiary Attack'), base: 3, desc: v => tr(`l'attaque brûle (${num(v)}/s pendant 3 s), +10%`, `the attack burns (${num(v)}/s for 3 s), +10%`), apply: (s, v) => { s.onHit.attack.burn += v; s.attackMult += 0.1 } },
  { id: 'sudo-special', god: sudo, slot: 'special', name: L('Spécial privilégié', 'Privileged Special'), base: 0.6, desc: v => tr(`spécial +${pct(v)}`, `special +${pct(v)}`), apply: (s, v) => { s.specialMult += v } },
  { id: 'sudo-cast', god: sudo, slot: 'cast', name: L('Sort incendiaire', 'Incendiary Cast'), base: 6, desc: v => tr(`le sort brûle (${num(v)}/s), +20%`, `the cast burns (${num(v)}/s), +20%`), apply: (s, v) => { s.onHit.cast.burn += v; s.castMult += 0.2 } },
  { id: 'sudo-dash', god: sudo, slot: 'dash', name: L('Dash brûlant', 'Scorching Dash'), base: 10, desc: v => tr(`onde de feu à l'arrivée (${num(v)} dégâts) qui brûle`, `wave of fire on landing (${num(v)} damage) that burns`), apply: (s, v) => { s.dashNova += v; s.onHit.dash.burn += 4 } },
  { id: 'sudo-boss', god: sudo, slot: 'passive', name: L('Privilèges élevés', 'Elevated Privileges'), base: 0.25, desc: v => tr(`+${pct(v)} dégâts aux gardiens`, `+${pct(v)} damage to guardians`), apply: (s, v) => { s.bossDmg += v } },
  { id: 'sudo-kill', god: sudo, slot: 'passive', name: 'kill -9', base: 0.12, desc: v => tr(`exécute les ennemis sous ${pct(v)} de PV`, `executes foes under ${pct(v)} HP`), apply: (s, v) => { s.execute += v } },

  // Fork: more shots, more bodies.
  { id: 'fork-attack', god: fork, slot: 'attack', name: L('Attaque dupliquée', 'Duplicated Attack'), base: 1, desc: v => tr(`chaque attaque tire ${num(v)} projectile${v > 1 ? 's' : ''} en plus`, `every attack fires ${num(v)} more projectile${v > 1 ? 's' : ''}`), apply: (s, v) => { s.extraShots += v } },
  { id: 'fork-special', god: fork, slot: 'special', name: L('Spécial en écho', 'Echo Special'), base: 0.2, desc: v => tr(`le spécial se répète, +${pct(v)}`, `the special repeats, +${pct(v)}`), apply: (s, v) => { s.specialEcho = true; s.specialMult += v } },
  { id: 'fork-cast', god: fork, slot: 'cast', name: L('Sort forké', 'Forked Cast'), base: 0.2, desc: v => tr(`le sort part en 3, +${pct(v)}`, `the cast splits in 3, +${pct(v)}`), apply: (s, v) => { s.castSplit = true; s.castMult += v } },
  { id: 'fork-dash', god: fork, slot: 'dash', name: L('Dash forké', 'Forked Dash'), base: 1, desc: v => tr(`+${num(v)} charge${v > 1 ? 's' : ''} de dash`, `+${num(v)} dash charge${v > 1 ? 's' : ''}`), apply: (s, v) => { s.dashCharges += v } },
  { id: 'fork-child', god: fork, slot: 'passive', name: L('Processus enfant', 'Child Process'), base: 1, desc: v => tr(`${num(v)} familier${v > 1 ? 's' : ''} t'accompagne${v > 1 ? 'nt' : ''} dans chaque salle`, `${num(v)} familiar${v > 1 ? 's' : ''} join${v > 1 ? '' : 's'} you in every room`), apply: (s, v) => { s.summons += v } },
  { id: 'fork-bomb', god: fork, slot: 'passive', name: 'Fork bomb', base: 0.15, desc: v => tr(`${pct(v)} de chance qu'une victime devienne un familier`, `${pct(v)} chance a kill becomes a familiar`), apply: (s, v) => { s.killSummon += v } },

  // Rebase: time slows, freezes, slips away.
  { id: 'rebase-attack', god: rebase, slot: 'attack', name: L('Attaque rétroactive', 'Retroactive Attack'), base: 0.3, desc: v => tr(`l'attaque ralentit de ${pct(v)}, +10%`, `the attack slows by ${pct(v)}, +10%`), apply: (s, v) => { s.onHit.attack.chill += v; s.attackMult += 0.1 } },
  { id: 'rebase-special', god: rebase, slot: 'special', name: L('Spécial figé', 'Frozen Special'), base: 0.25, desc: v => tr(`le spécial ralentit de 50% et gèle ${pct(v)} du temps`, `the special slows by 50% and freezes ${pct(v)} of the time`), apply: (s, v) => { s.onHit.special.chill += 0.5; s.onHit.special.freeze += v } },
  { id: 'rebase-cast', god: rebase, slot: 'cast', name: L('Sort de stase', 'Stasis Cast'), base: 0.6, desc: v => tr(`le sort gèle (${pct(v)} de chance), +15%`, `the cast freezes (${pct(v)} chance), +15%`), apply: (s, v) => { s.onHit.cast.freeze += v; s.castMult += 0.15 } },
  { id: 'rebase-dash', god: rebase, slot: 'dash', name: L('Dash temporel', 'Time Dash'), base: 12, desc: v => tr(`dash plus court à recharger, onde de ${num(v)} dégâts`, `dash recharges faster, ${num(v)}-damage wave`), apply: (s, v) => { s.dashCd *= 0.6; s.dashIframes += 0.1; s.dashNova += v; s.onHit.dash.chill += 0.3 } },
  { id: 'rebase-passive', god: rebase, slot: 'passive', name: L('Esquive temporelle', 'Temporal Dodge'), base: 0.12, desc: v => tr(`+${pct(v)} esquive`, `+${pct(v)} dodge`), apply: (s, v) => { s.dodge += v } },
  { id: 'rebase-slow', god: rebase, slot: 'passive', name: 'Bisect', base: 0.3, desc: v => tr(`+${pct(v)} dégâts aux ennemis ralentis`, `+${pct(v)} damage to slowed foes`), apply: (s, v) => { s.chillDmg += v } },

  // Lint: poison that stacks, thorns.
  { id: 'lint-attack', god: lint, slot: 'attack', name: L('Attaque toxique', 'Toxic Attack'), base: 2, desc: v => tr(`l'attaque empoisonne (${num(v)}/s, cumulable ×5)`, `the attack poisons (${num(v)}/s, stacks ×5)`), apply: (s, v) => { s.onHit.attack.poison += v } },
  { id: 'lint-special', god: lint, slot: 'special', name: L('Spécial strict', 'Strict Special'), base: 4, desc: v => tr(`le spécial empoisonne (${num(v)}/s), +15%`, `the special poisons (${num(v)}/s), +15%`), apply: (s, v) => { s.onHit.special.poison += v; s.specialMult += 0.15 } },
  { id: 'lint-cast', god: lint, slot: 'cast', name: L('Sort de diagnostic', 'Diagnostic Cast'), base: 5, desc: v => tr(`le sort empoisonne (${num(v)}/s), +20%`, `the cast poisons (${num(v)}/s), +20%`), apply: (s, v) => { s.onHit.cast.poison += v; s.castMult += 0.2 } },
  { id: 'lint-dash', god: lint, slot: 'dash', name: L('Dash épineux', 'Thorny Dash'), base: 8, desc: v => tr(`le dash laisse des piques (${num(v)} dégâts)`, `the dash leaves spikes (${num(v)} damage)`), apply: (s, v) => { s.dashTrail += v } },
  { id: 'lint-passive', god: lint, slot: 'passive', name: L('Épines de style', 'Style Thorns'), base: 6, desc: v => tr(`renvoie ${num(v)} dégâts au contact`, `deals ${num(v)} damage back on contact`), apply: (s, v) => { s.thorns += v } },
  { id: 'lint-strict', god: lint, slot: 'passive', name: L('Mode strict', 'Strict Mode'), base: 0.4, desc: v => tr(`poison +${pct(v)}`, `poison +${pct(v)}`), apply: (s, v) => { s.poisonMult += v } },

  // Cache: heals and shields.
  { id: 'cache-attack', god: cache, slot: 'attack', name: L('Attaque mémorisée', 'Memoized Attack'), base: 0.5, desc: v => tr(`l'attaque soigne de ${num(v)} PV par touche, +10%`, `the attack heals ${num(v)} HP per hit, +10%`), apply: (s, v) => { s.hitHeal += v; s.attackMult += 0.1 } },
  { id: 'cache-special', god: cache, slot: 'special', name: L('Spécial persistant', 'Persistent Special'), base: 2, desc: v => tr(`chaque touche du spécial donne ${num(v)} de bouclier, +15%`, `every special hit gives ${num(v)} shield, +15%`), apply: (s, v) => { s.shieldOnHit += v; s.specialMult += 0.15 } },
  { id: 'cache-cast', god: cache, slot: 'cast', name: L('Sort en cache', 'Cached Cast'), base: 3, desc: v => tr(`le sort soigne de ${num(v)} par touche`, `the cast heals ${num(v)} per hit`), apply: (s, v) => { s.castHeal += v } },
  { id: 'cache-dash', god: cache, slot: 'dash', name: L('Dash en cache', 'Cached Dash'), base: 4, desc: v => tr(`chaque dash donne ${num(v)} de bouclier`, `every dash gives ${num(v)} shield`), apply: (s, v) => { s.dashShield += v } },
  { id: 'cache-passive', god: cache, slot: 'passive', name: L('Récupération', 'Recovery'), base: 4, desc: v => tr(`+${num(v)} PV par victime`, `+${num(v)} HP per kill`), apply: (s, v) => { s.lifesteal += v } },
  { id: 'cache-shield', god: cache, slot: 'passive', name: L('Cache chaud', 'Warm Cache'), base: 10, desc: v => tr(`bouclier de ${num(v)} au début de chaque salle, se recharge lentement`, `${num(v)} shield at the start of every room, slowly recharges`), apply: (s, v) => { s.shield += v; s.shieldRegen += 1 } },

  // Commit: health, armour, stun.
  { id: 'commit-attack', god: commit, slot: 'attack', name: L('Frappe atomique', 'Atomic Strike'), base: 0.2, desc: v => tr(`attaque +${pct(v)}, critiques +50%`, `attack +${pct(v)}, crits +50%`), apply: (s, v) => { s.attackMult += v; s.critDmg += 0.5 } },
  { id: 'commit-special', god: commit, slot: 'special', name: L('Spécial scellé', 'Sealed Special'), base: 0.3, desc: v => tr(`spécial +${pct(v)}, étourdit`, `special +${pct(v)}, stuns`), apply: (s, v) => { s.specialMult += v; s.specialStun += 0.8; s.onHit.special.stun += 0.8 } },
  { id: 'commit-cast', god: commit, slot: 'cast', name: L('Sort signé', 'Signed Cast'), base: 0.4, desc: v => tr(`sort +${pct(v)}, étourdit 1 s`, `cast +${pct(v)}, stuns for 1 s`), apply: (s, v) => { s.castMult += v; s.onHit.cast.stun += 1 } },
  { id: 'commit-dash', god: commit, slot: 'dash', name: L('Dash scellé', 'Sealed Dash'), base: 6, desc: v => tr(`onde à l'arrivée (${num(v)} dégâts) qui étourdit 0,8 s`, `wave on landing (${num(v)} damage) that stuns for 0.8 s`), apply: (s, v) => { s.dashNova += v; s.onHit.dash.stun += 0.8 } },
  { id: 'commit-passive', god: commit, slot: 'passive', name: 'Constitution', base: 20, desc: v => tr(`+${num(v)} PV max`, `+${num(v)} max HP`), apply: (s, v) => { s.maxHp += v } },
  { id: 'commit-armor', god: commit, slot: 'passive', name: L('Armure signée', 'Signed Armor'), base: 0.12, desc: v => tr(`réduit les dégâts subis de ${pct(v)}`, `cuts damage taken by ${pct(v)}`), apply: (s, v) => { s.armor += v } },
  { id: 'commit-rollback', god: commit, slot: 'passive', name: 'Rollback', base: 1, desc: () => tr('+1 Défi de la mort pour cette descente', '+1 Death Defiance for this run'), apply: () => {}, onPick: run => { run.defiance += 1 } },

  // Pipe: lightning that jumps, speed.
  { id: 'pipe-attack', god: pipe, slot: 'attack', name: L('Attaque pipelinée', 'Pipelined Attack'), base: 0.2, desc: v => tr(`frappe ${pct(v)} plus vite, un éclair saute à un voisin`, `strikes ${pct(v)} faster, lightning jumps to a neighbour`), apply: (s, v) => { s.attackSpeed += v; s.onHit.attack.chain += 1 } },
  { id: 'pipe-special', god: pipe, slot: 'special', name: L('Spécial en tube', 'Piped Special'), base: 2, desc: v => tr(`le spécial lance un éclair qui saute ${num(v)} fois`, `the special casts lightning that jumps ${num(v)} times`), apply: (s, v) => { s.onHit.special.chain += v } },
  { id: 'pipe-cast', god: pipe, slot: 'cast', name: L('Flux continu', 'Continuous Stream'), base: 0.5, desc: v => tr(`+1 sort, sort +${pct(v)}`, `+1 cast, cast +${pct(v)}`), apply: (s, v) => { s.castAmmo += 1; s.castMult += v } },
  { id: 'pipe-dash', god: pipe, slot: 'dash', name: L('Dash électrique', 'Electric Dash'), base: 3, desc: v => tr(`le dash foudroie ${num(v)} ennemis proches`, `the dash zaps ${num(v)} nearby foes`), apply: (s, v) => { s.dashZap += v; s.dashCd *= 0.85 } },
  { id: 'pipe-passive', god: pipe, slot: 'passive', name: L('Débit', 'Throughput'), base: 0.1, desc: v => tr(`+${pct(v)} dégâts`, `+${pct(v)} damage`), apply: (s, v) => { s.dmg += v } },
  { id: 'pipe-tee', god: pipe, slot: 'passive', name: 'tee', base: 0.25, desc: v => tr(`éclairs +${pct(v)} et +1 saut`, `lightning +${pct(v)} and +1 jump`), apply: (s, v) => { s.chainDmg += v; s.chainBonus += 1 } },
])

/** Duo boons: offered once you hold a boon from each of two gods. */
export const DUO_BOONS: BoonDef[] = localizeAll<BoonDef>([
  { id: 'duo-grep-sudo', god: duoGod(G.grep, G.sudo), duo: [grep, sudo], slot: 'passive', name: L('Œil de root', 'Root Eye'), base: 0.25, desc: v => tr(`ce qui brûle est marqué ; marque +${pct(v)}`, `whatever burns is marked; mark +${pct(v)}`), apply: (s, v) => { s.burnMarks = true; s.markBonus += v } },
  { id: 'duo-sudo-lint', god: duoGod(G.sudo, G.lint), duo: [sudo, lint], slot: 'passive', name: L('Fumées toxiques', 'Toxic Fumes'), base: 0.2, desc: v => tr(`brûlé et empoisonné à la fois : les deux font double ; brûlure +${pct(v)}`, `burned and poisoned at once: both deal double; burn +${pct(v)}`), apply: (s, v) => { s.toxicFire = true; s.burnMult += v } },
  { id: 'duo-rebase-commit', god: duoGod(G.rebase, G.commit), duo: [rebase, commit], slot: 'passive', name: L('Gel du dépôt', 'Repo Freeze'), base: 0.2, desc: v => tr(`chaque coup sur un ennemi ralenti a ${pct(v)} de chance de le geler`, `every hit on a slowed foe has a ${pct(v)} chance to freeze it`), apply: (s, v) => { s.chillFreeze += v } },
  { id: 'duo-fork-pipe', god: duoGod(G.fork, G.pipe), duo: [fork, pipe], slot: 'passive', name: L('Éclairs parallèles', 'Parallel Lightning'), base: 2, desc: v => tr(`les éclairs sautent ${num(v)} fois de plus, l'attaque en lance un`, `lightning jumps ${num(v)} more times, the attack casts one`), apply: (s, v) => { s.chainBonus += v; s.onHit.attack.chain += 1 } },
  { id: 'duo-cache-commit', god: duoGod(G.cache, G.commit), duo: [cache, commit], slot: 'passive', name: L('Sauvegarde incrémentale', 'Incremental Backup'), base: 10, desc: v => tr(`les soins en trop deviennent bouclier ; bouclier +${num(v)}`, `overhealing turns into shield; shield +${num(v)}`), apply: (s, v) => { s.healToShield = true; s.shield += v } },
  { id: 'duo-grep-fork', god: duoGod(G.grep, G.fork), duo: [grep, fork], slot: 'passive', name: L('Recherche parallèle', 'Parallel Search'), base: 1, desc: v => tr(`+${num(v)} projectile par attaque, tous à tête chercheuse et marquants`, `+${num(v)} projectile per attack, all homing and marking`), apply: (s, v) => { s.extraShots += v; s.homing += 3; s.onHit.attack.mark += 1.5 } },
  { id: 'duo-lint-rebase', god: duoGod(G.lint, G.rebase), duo: [lint, rebase], slot: 'passive', name: L('Régression lente', 'Slow Regression'), base: 0.3, desc: v => tr(`le poison ralentit de ${pct(v)} et se propage à la mort`, `poison slows by ${pct(v)} and spreads on death`), apply: (s, v) => { s.poisonChill += v; s.poisonSpread = true } },
  { id: 'duo-pipe-sudo', god: duoGod(G.pipe, G.sudo), duo: [pipe, sudo], slot: 'passive', name: L('Surtension', 'Power Surge'), base: 6, desc: v => tr(`les éclairs brûlent (${num(v)}/s), +1 saut`, `lightning burns (${num(v)}/s), +1 jump`), apply: (s, v) => { s.chainBurn += v; s.chainBonus += 1 } },
  { id: 'duo-fork-cache', god: duoGod(G.fork, G.cache), duo: [fork, cache], slot: 'passive', name: L('Processus orphelins', 'Orphan Processes'), base: 1, desc: v => tr(`+${num(v)} familier par salle, +3 PV par victime`, `+${num(v)} familiar per room, +3 HP per kill`), apply: (s, v) => { s.summons += v; s.lifesteal += 3 } },
  { id: 'duo-rebase-grep', god: duoGod(G.rebase, G.grep), duo: [rebase, grep], slot: 'passive', name: 'git bisect', base: 0.25, desc: v => tr(`marquer ralentit de 30% ; +${pct(v)} dégâts aux ralentis`, `marking slows by 30%; +${pct(v)} damage to slowed foes`), apply: (s, v) => { s.markChill += 0.3; s.chillDmg += v } },
  { id: 'duo-commit-lint', god: duoGod(G.commit, G.lint), duo: [commit, lint], slot: 'passive', name: 'Hook pre-commit', base: 4, desc: v => tr(`blessé, tu empoisonnes tout autour (${num(v)}/s) ; épines ×2`, `when hurt, you poison all around (${num(v)}/s); thorns ×2`), apply: (s, v) => { s.hurtPoison += v; s.thorns *= 2 } },
  { id: 'duo-pipe-rebase', god: duoGod(G.pipe, G.rebase), duo: [pipe, rebase], slot: 'passive', name: L('Flux tendu', 'Just in Time'), base: 0.15, desc: v => tr(`chaque victime recharge le dash ; frappe ${pct(v)} plus vite`, `every kill recharges the dash; strikes ${pct(v)} faster`), apply: (s, v) => { s.dashOnKill = true; s.attackSpeed += v } },
  { id: 'duo-sudo-commit', god: duoGod(G.sudo, G.commit), duo: [sudo, commit], slot: 'passive', name: L('Force majeure', 'Force Majeure'), base: 0.08, desc: v => tr(`exécute ${pct(v)} plus haut ; les critiques font +50%`, `executes ${pct(v)} higher; crits deal +50%`), apply: (s, v) => { s.execute += v; s.critDmg += 0.5 } },
])

/** Isaac items: treasure pedestals and the shop. Taken twice, they stack. */
export const ITEMS: BoonDef[] = localizeAll(([
  { id: 'i-double', name: L('Double tir', 'Double Shot'), desc: L('chaque attaque tire un projectile de plus', 'every attack fires one more projectile'), apply: s => { s.extraShots += 1 } },
  { id: 'i-homing', name: L('Tête chercheuse', 'Homing Head'), desc: L('les projectiles suivent les ennemis', 'projectiles follow foes'), apply: s => { s.homing += 4 } },
  { id: 'i-big', name: L('Gros fichier', 'Big File'), desc: L('projectiles plus gros, +10% dégâts', 'bigger projectiles, +10% damage'), apply: s => { s.projSize += 1; s.dmg += 0.1 } },
  { id: 'i-pierce', name: '--force', desc: L('les flèches et les sorts transpercent', 'arrows and casts pierce'), apply: s => { s.pierce = true; s.castMult += 0.1 } },
  { id: 'i-ricochet', name: L('Rebond réseau', 'Network Bounce'), desc: L('les projectiles rebondissent vers un autre ennemi', 'projectiles bounce to another foe'), apply: s => { s.ricochet += 1 } },
  { id: 'i-orbital', name: L('Daemon orbital', 'Orbital Daemon'), desc: L('une lame tourne autour de toi', 'a blade circles around you'), apply: s => { s.orbitals += 1 } },
  { id: 'i-explode', name: 'rm -rf', desc: L('les ennemis explosent en mourant (10 dégâts)', 'foes explode when they die (10 damage)'), apply: s => { s.explodeOnKill += 10 } },
  { id: 'i-dash', name: L('Second souffle', 'Second Wind'), desc: L('+1 charge de dash', '+1 dash charge'), apply: s => { s.dashCharges += 1 } },
  { id: 'i-freeze', name: L('Glaçon', 'Ice Cube'), desc: L('chaque coup a 8% de chance de geler', 'every hit has an 8% chance to freeze'), apply: s => { for (const src of SRCS) s.onHit[src].freeze += 0.08 } },
  { id: 'i-burn', name: L('Allumette', 'Matchstick'), desc: L('tous tes coups brûlent (2/s)', 'all your hits burn (2/s)'), apply: s => { for (const src of SRCS) s.onHit[src].burn += 2 } },
  { id: 'i-poison', name: L('Seringue', 'Syringe'), desc: L('tous tes coups empoisonnent (1/s)', 'all your hits poison (1/s)'), apply: s => { for (const src of SRCS) s.onHit[src].poison += 1 } },
  { id: 'i-chain', name: L('Bobine Tesla', 'Tesla Coil'), desc: L('attaque et sort lancent un éclair', 'attack and cast throw lightning'), apply: s => { s.onHit.attack.chain += 1; s.onHit.cast.chain += 1 } },
  { id: 'i-crit', name: L('Trèfle', 'Clover'), desc: L('+8% critique', '+8% crit'), apply: s => { s.crit += 0.08 } },
  { id: 'i-critdmg', name: L('Loupe', 'Magnifier'), desc: L('critiques +60%', 'crits +60%'), apply: s => { s.critDmg += 0.6 } },
  { id: 'i-heart', name: L('Cœur de rechange', 'Spare Heart'), desc: L('+15 PV max', '+15 max HP'), apply: s => { s.maxHp += 15 } },
  { id: 'i-armor', name: L('Casque', 'Helmet'), desc: L('réduit les dégâts subis de 10%', 'cuts damage taken by 10%'), apply: s => { s.armor += 0.1 } },
  { id: 'i-shield', name: L("Bouclier d'énergie", 'Energy Shield'), desc: L('bouclier de 8 à chaque salle, se recharge', '8 shield every room, recharges'), apply: s => { s.shield += 8; s.shieldRegen += 0.5 } },
  { id: 'i-speed', name: L('Café', 'Coffee'), desc: L('frappe 15% plus vite', 'strikes 15% faster'), apply: s => { s.attackSpeed += 0.15 } },
  { id: 'i-vamp', name: L('Dent de vampire', 'Vampire Fang'), desc: L('+2 PV par victime', '+2 HP per kill'), apply: s => { s.lifesteal += 2 } },
  { id: 'i-familiar', name: L('Petit démon', 'Little Demon'), desc: L('un familier de plus dans chaque salle', 'one more familiar in every room'), apply: s => { s.summons += 1 } },
  { id: 'i-greed', name: L('Tirelire', 'Piggy Bank'), desc: L('+1 éclat par victime, +15 éclats tout de suite', '+1 shard per kill, +15 shards right now'), apply: s => { s.killShards += 1 }, onPick: run => { run.eclats += 15 } },
  { id: 'i-regen', name: L('Bandage', 'Bandage'), desc: L('+5 PV à chaque salle nettoyée', '+5 HP for every room cleared'), apply: s => { s.roomHeal += 5 } },
  { id: 'i-boss', name: L('Tueur de gardiens', 'Guardian Slayer'), desc: L('+25% dégâts aux gardiens', '+25% damage to guardians'), apply: s => { s.bossDmg += 0.25 } },
  { id: 'i-glass', name: L('Canon de verre', 'Glass Cannon'), desc: L('+40% dégâts, −15 PV max', '+40% damage, −15 max HP'), apply: s => { s.dmg += 0.4; s.maxHp -= 15 } },
  { id: 'i-mark', name: L('Lunette', 'Scope'), desc: L('tous tes coups marquent 2 s', 'all your hits mark for 2 s'), apply: s => { for (const src of SRCS) s.onHit[src].mark += 2 } },
  { id: 'i-panic', name: L('Mode panique', 'Panic Mode'), desc: L('+50% dégâts sous 35% de PV', '+50% damage under 35% HP'), apply: s => { s.lowHpDmg += 0.5 } },
  { id: 'i-ammo', name: L('Munitions', 'Ammo'), desc: L('+1 sort', '+1 cast'), apply: s => { s.castAmmo += 1 } },
  { id: 'i-nova', name: L('Retour de flamme', 'Backfire'), desc: L('blessé, tu repousses une onde de 15 dégâts', 'when hurt, you push out a 15-damage wave'), apply: s => { s.hurtNova += 15 } },
  { id: 'i-luck', name: L('Patte de lapin', "Rabbit's Foot"), desc: L('bienfaits plus rares, −15% en boutique', 'rarer boons, −15% in the shop'), apply: s => { s.luck += 0.15; s.shopDiscount += 0.15 } },
] as { id: string; name: string; desc: string; apply: (s: CombatStats) => void; onPick?: BoonDef['onPick'] }[]).map(item => ({
  // `name` and `desc` are still two-language here: the table is localized once mapped.
  id: item.id, god: L('Trésor', 'Treasure'), slot: 'item' as Slot, name: item.name, base: 1, isItem: true,
  desc: () => String(item.desc), apply: (s: CombatStats) => item.apply(s), onPick: item.onPick,
})))

/** Every offerable thing, by id: god boons, duos, then items. */
export const BOONS: BoonDef[] = [...GOD_BOONS, ...DUO_BOONS, ...ITEMS]

export const SLOT_LABEL: Record<Slot, string> = localize({
  attack: L('Attaque', 'Attack'), special: L('Spécial', 'Special'), cast: L('Sort', 'Cast'), dash: 'Dash', passive: L('Passif', 'Passive'), item: L('Objet', 'Item'),
})

/** Rarities by index: 3 heroic is rare, 4 marks a duo, 5 an item. */
export const RARITY = localizeAll([
  { label: L('Commun', 'Common'), mult: 1 },
  { label: 'Rare', mult: 1.5 },
  { label: L('Épique', 'Epic'), mult: 2 },
  { label: L('Héroïque', 'Heroic'), mult: 2.5 },
  { label: 'Duo', mult: 1 },
  { label: L('Objet', 'Item'), mult: 1 },
])
export const DUO_RARITY = 4
export const ITEM_RARITY = 5

/** A boon's value at a rarity and a level (each level adds 40% of the base). */
export function boonValue(def: BoonDef, rarity: number, level = 1): number {
  const v = def.base * (RARITY[rarity] ?? RARITY[0]!).mult * (1 + 0.4 * (Math.max(1, level) - 1))
  return def.base < 1 ? Math.round(v * 100) / 100 : Math.round(v)
}

// ---------- meta ----------

export type MirrorDef = { id: string; name: string; desc: string; costs: number[] }

export const MIRROR: MirrorDef[] = localizeAll([
  { id: 'vigueur', name: L('Vigueur', 'Vigor'), desc: L('+8 PV max par rang', '+8 max HP per rank'), costs: [10, 20, 35, 55, 80] },
  { id: 'force', name: L('Force', 'Strength'), desc: L('+8% dégâts par rang', '+8% damage per rank'), costs: [25, 50, 90] },
  { id: 'chance', name: L('Chance', 'Luck'), desc: L('+5% critique par rang', '+5% crit per rank'), costs: [15, 30, 50] },
  { id: 'defi', name: L('Défi de la mort', 'Death Defiance'), desc: L('revient à 50% PV une fois par rang', 'back at 50% HP once per rank'), costs: [60, 120] },
  { id: 'fortune', name: 'Fortune', desc: L('+20% éclats par rang', '+20% shards per rank'), costs: [20, 40, 70] },
  { id: 'eclaireur', name: L('Éclaireur', 'Scout'), desc: L('commence avec un bienfait', 'start with a boon'), costs: [40] },
])

export const RELIC_EFFECTS: { effect: StatKey; value: number }[] = [
  { effect: 'atk', value: 1 },
  { effect: 'maxHp', value: 10 },
  { effect: 'crit', value: 0.08 },
  { effect: 'lifesteal', value: 2 },
  { effect: 'thorns', value: 4 },
  { effect: 'dodge', value: 0.06 },
  { effect: 'nectar', value: 1 },
]

export function applyRelic(s: CombatStats, effect: StatKey, value: number) {
  switch (effect) {
    case 'atk': s.dmg += 0.1 * value; break
    case 'maxHp': s.maxHp += value; break
    case 'crit': s.crit += value; break
    case 'lifesteal': s.lifesteal += value; break
    case 'thorns': s.thorns += value; break
    case 'dodge': s.dodge += value; break
    case 'nectar': s.castAmmo += value; break
  }
}

export function relicLabel(effect: StatKey, value: number): string {
  switch (effect) {
    case 'atk': return tr(`+${value * 10}% dégâts`, `+${value * 10}% damage`)
    case 'maxHp': return tr(`+${value} PV max`, `+${value} max HP`)
    case 'crit': return tr(`+${pct(value)} critique`, `+${pct(value)} crit`)
    case 'lifesteal': return tr(`+${value} PV par victime`, `+${value} HP per kill`)
    case 'thorns': return tr(`épines ${value}`, `thorns ${value}`)
    case 'dodge': return tr(`+${pct(value)} esquive`, `+${pct(value)} dodge`)
    case 'nectar': return tr(`+${value} sort`, `+${value} cast`)
  }
}

/** Error signatures: what a failed command spawns. The epithet reads in the current language. */
export const ERROR_NAMES: [RegExp, string, string][] = ([
  [/\bTypeError\b/, 'TypeError', L('le Spectre Indéfini', 'the Undefined Specter')],
  [/\bReferenceError\b/, 'ReferenceError', L('le Fantôme Non Déclaré', 'the Undeclared Ghost')],
  [/\bSyntaxError\b/, 'SyntaxError', L('la Chimère Mal Fermée', 'the Unclosed Chimera')],
  [/\berror TS\d+/, 'TSError', L('le Golem Mal Typé', 'the Mistyped Golem')],
  [/\bENOENT\b|No such file or directory/, 'ENOENT', L('le Chemin Perdu', 'the Lost Path')],
  [/\bEADDRINUSE\b/, 'EADDRINUSE', L('le Squatteur de Port', 'the Port Squatter')],
  [/\bECONNREFUSED\b/, 'ECONNREFUSED', L('la Porte Close', 'the Closed Door')],
  [/\bEACCES\b|Permission denied/, 'EACCES', L('le Gardien Jaloux', 'the Jealous Warden')],
  [/command not found/, 'CommandNotFound', L("l'Écho Sans Commande", 'the Commandless Echo')],
  [/Traceback \(most recent call last\)/, 'Traceback', L('le Serpent Tracé', 'the Traced Serpent')],
  [/\bpanicked at\b|\bpanic:/, 'Panic', L('la Rouille Hurlante', 'the Howling Rust')],
  [/Segmentation fault/, 'Segfault', L('le Déchireur de Mémoire', 'the Memory Ripper')],
  [/timed? ?out\b|Timeout/i, 'Timeout', L('la Liche du Délai', 'the Timeout Lich')],
  [/\bFAIL\b|failed\b.*\btests?\b|\btests? failed/i, 'TestFail', L('le Juge Rouge', 'the Red Judge')],
  [/CONFLICT|merge conflict/i, 'Conflict', L('le Merge Maudit', 'the Cursed Merge')],
  [/error:/i, 'Error', L('la Bête Anonyme', 'the Nameless Beast')],
] as [RegExp, string, string][]).map(entry => localize(entry))

export const ERROR_EPITHETS: string[] = localize([
  L('la Goule Asynchrone', 'the Async Ghoul'), L('le Rongeur de Pile', 'the Stack Gnawer'), L("l'Ombre du Cache", 'the Cache Shade'),
  L('la Larve Nulle', 'the Null Larva'), L('le Démon du Build', 'the Build Demon'), L("l'Âme Non Typée", 'the Untyped Soul'),
  L('le Ver de Dépendance', 'the Dependency Worm'),
])

export const BOSSES: string[] = localize([
  L('Le Merge Conflict', 'The Merge Conflict'), L('Le Démon de la Prod', 'The Prod Demon'), L("L'Hydre des Dépendances", 'The Dependency Hydra'),
])

export const DEFAULT_BIOMES: string[] = localize([
  L('Les Racines du Dépôt', 'The Roots of the Repo'), L('Les Abysses de node_modules', 'The Depths of node_modules'), L('Le Cœur du Monolithe', 'The Heart of the Monolith'),
])

export const DEFAULT_CHAMBERS: string[] = localize([
  L('Salle des Logs', 'Hall of Logs'), L('Couloir des Imports', 'Corridor of Imports'), L('Crypte des Tests', 'Crypt of Tests'),
  L('Archives du Changelog', 'Changelog Archives'), L('Puits du Cache', 'Cache Well'), L('Galerie des Types', 'Gallery of Types'),
  L('Forge du Build', 'Build Forge'), L('Chapelle du Linter', 'Linter Chapel'),
])

const SYL_A = ['Bra', 'Kel', 'Mor', 'Thi', 'Va', 'Dor', 'Ul', 'Ser', 'Ka', 'Lio', 'Fen', 'Ar', 'Is', 'Gwe']
const SYL_B = ['nn', 'dric', 'wen', 'ra', 'gor', 'lis', 'th', 'mir', 'ka', 'dan', 'el', 'ys']

export function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function championName(key: string): string {
  const h = hash(key)
  return SYL_A[h % SYL_A.length]! + SYL_B[(h >>> 8) % SYL_B.length]!
}
