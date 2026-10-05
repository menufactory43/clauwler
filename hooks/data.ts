import type { ClassId, Slot, StatKey, WeaponId } from '../types'

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
  artificier: { label: 'Artificier', stack: 'Swift', perk: '+1 sort', apply: s => { s.castAmmo += 1 } },
  forgeron: { label: 'Forgeron', stack: 'Rust', perk: '+10 PV, épines 3', apply: s => { s.maxHp += 10; s.thorns += 3 } },
  illusionniste: { label: 'Illusionniste', stack: 'TypeScript', perk: '10% esquive', apply: s => { s.dodge += 0.1 } },
  alchimiste: { label: 'Alchimiste', stack: 'Python', perk: '+2 PV par victime', apply: s => { s.lifesteal += 2 } },
  rodeur: { label: 'Rôdeur', stack: 'Go', perk: '+10% dégâts', apply: s => { s.dmg += 0.1 } },
  vagabond: { label: 'Vagabond', stack: 'divers', perk: '+5% critique', apply: s => { s.crit += 0.05 } },
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

export const WEAPONS: WeaponDef[] = [
  { id: 'epee', name: 'Stack Trace', title: 'Épée', attack: 'combo de 3 entailles, la 3e plus lourde', special: 'onde de choc autour de toi', cost: 0 },
  { id: 'lance', name: 'Pointeur', title: 'Lance', attack: 'estoc longue portée', special: 'lancer perçant qui revient', cost: 30 },
  { id: 'arc', name: 'Ping', title: 'Arc', attack: 'flèche rapide', special: 'salve de 5 flèches', cost: 50 },
  { id: 'bouclier', name: 'Firewall', title: 'Bouclier', attack: 'coup de bouclier qui repousse', special: 'lancer qui rebondit entre les ennemis ; le dash charge', cost: 80 },
]

// ---------- weapon aspects: unlocked with shards in the Arsenal ----------

export type AspectDef = {
  id: string
  weapon: WeaponId
  name: string
  desc: string
  cost: number
  apply: (s: CombatStats) => void
}

export const ASPECTS: AspectDef[] = [
  { id: 'epee-kernel', weapon: 'epee', name: 'Aspect du Kernel', desc: 'entailles +50% mais 20% plus lentes ; chaque coup étourdit 0,3 s', cost: 40, apply: s => { s.attackMult += 0.5; s.attackSpeed -= 0.2; s.onHit.attack.stun += 0.3 } },
  { id: 'epee-thread', weapon: 'epee', name: 'Aspect du Thread', desc: 'frappe 35% plus vite, attaque −15%, chaque coup empoisonne (1/s)', cost: 70, apply: s => { s.attackSpeed += 0.35; s.attackMult -= 0.15; s.onHit.attack.poison += 1 } },
  { id: 'lance-null', weapon: 'lance', name: 'Aspect du Pointeur Nul', desc: 'spécial +40%, la lance foudroie 2 ennemis de plus', cost: 50, apply: s => { s.specialMult += 0.4; s.onHit.special.chain += 2 } },
  { id: 'lance-smart', weapon: 'lance', name: 'Aspect du Pointeur Malin', desc: "l'estoc marque 3 s et gagne +20% critique", cost: 80, apply: s => { s.onHit.attack.mark += 3; s.attackCrit += 0.2 } },
  { id: 'arc-multicast', weapon: 'arc', name: 'Aspect Multicast', desc: 'chaque tir part en 3 flèches, attaque −30%', cost: 60, apply: s => { s.extraShots += 2; s.attackMult -= 0.3 } },
  { id: 'arc-traceroute', weapon: 'arc', name: 'Aspect Traceroute', desc: 'flèches perçantes à tête chercheuse, attaque −10%', cost: 90, apply: s => { s.pierce = true; s.homing += 4; s.attackMult -= 0.1 } },
  { id: 'bouclier-actif', weapon: 'bouclier', name: 'Aspect du Pare-feu Actif', desc: 'armure 20%, épines +8, frappe 10% plus lentement', cost: 70, apply: s => { s.armor += 0.2; s.thorns += 8; s.attackSpeed -= 0.1 } },
  { id: 'bouclier-proxy', weapon: 'bouclier', name: 'Aspect du Proxy Inverse', desc: 'le bouclier lancé rebondit 3 fois de plus et ralentit de 40%', cost: 100, apply: s => { s.shieldBounce += 3; s.onHit.special.chill += 0.4 } },
]

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

const pct = (v: number) => `${Math.round(v * 100)}%`
const num = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1).replace('.', ','))

export const GODS = {
  grep: "Grep l'Œil",
  sudo: 'Sudo le Tout-Puissant',
  fork: 'Fork le Multiple',
  rebase: 'Rebase le Temporel',
  lint: 'Lint la Rigoureuse',
  cache: 'Cache la Mémoire',
  commit: 'Commit le Scellé',
  pipe: 'Pipe le Fluide',
} as const

/** Each god's signature, shown with its boons. */
export const GOD_STATUS: Record<string, string> = {
  [GODS.grep]: 'marque et critique',
  [GODS.sudo]: 'brûlure et puissance',
  [GODS.fork]: 'tirs multiples et familiers',
  [GODS.rebase]: 'ralenti, gel et esquive',
  [GODS.lint]: 'poison et épines',
  [GODS.cache]: 'soins et bouclier',
  [GODS.commit]: 'PV, armure et étourdissement',
  [GODS.pipe]: 'éclairs en chaîne et vitesse',
}

const { grep, sudo, fork, rebase, lint, cache, commit, pipe } = GODS

export const GOD_BOONS: BoonDef[] = [
  // Grep: the mark (marked foes take +30% damage) and crits.
  { id: 'grep-attack', god: grep, slot: 'attack', name: 'Attaque perçante', base: 0.3, desc: v => `attaque +${pct(v)}, +15% critique, marque 2 s`, apply: (s, v) => { s.attackMult += v; s.attackCrit += 0.15; s.onHit.attack.mark += 2 } },
  { id: 'grep-special', god: grep, slot: 'special', name: 'Spécial traqueur', base: 0.4, desc: v => `spécial +${pct(v)}, marque 4 s`, apply: (s, v) => { s.specialMult += v; s.onHit.special.mark += 4 } },
  { id: 'grep-cast', god: grep, slot: 'cast', name: 'Regard ciblé', base: 0.5, desc: v => `sort +${pct(v)}, toujours critique sur cible blessée, marque 4 s`, apply: (s, v) => { s.castMult += v; s.castWoundCrit = true; s.onHit.cast.mark += 4 } },
  { id: 'grep-dash', god: grep, slot: 'dash', name: 'Dash de recherche', base: 0.8, desc: v => `après un dash, la prochaine attaque fait +${pct(v)}`, apply: (s, v) => { s.dashAttackBuff += v } },
  { id: 'grep-crit', god: grep, slot: 'passive', name: 'Regex gourmande', base: 0.06, desc: v => `+${pct(v)} critique`, apply: (s, v) => { s.crit += v } },
  { id: 'grep-mark', god: grep, slot: 'passive', name: 'Œil du lynx', base: 0.2, desc: v => `les ennemis marqués subissent +${pct(v)} de plus`, apply: (s, v) => { s.markBonus += v } },
  { id: 'grep-fresh', god: grep, slot: 'passive', name: 'Premier match', base: 0.5, desc: v => `+${pct(v)} dégâts sur les ennemis intacts`, apply: (s, v) => { s.freshDmg += v } },

  // Sudo: burn and raw power.
  { id: 'sudo-attack', god: sudo, slot: 'attack', name: 'Frappe root', base: 0.2, desc: v => `attaque +${pct(v)}, repousse fort`, apply: (s, v) => { s.attackMult += v; s.attackKnock += 1 } },
  { id: 'sudo-burn', god: sudo, slot: 'attack', name: 'Attaque incendiaire', base: 3, desc: v => `l'attaque brûle (${num(v)}/s pendant 3 s), +10%`, apply: (s, v) => { s.onHit.attack.burn += v; s.attackMult += 0.1 } },
  { id: 'sudo-special', god: sudo, slot: 'special', name: 'Spécial privilégié', base: 0.6, desc: v => `spécial +${pct(v)}`, apply: (s, v) => { s.specialMult += v } },
  { id: 'sudo-cast', god: sudo, slot: 'cast', name: 'Sort incendiaire', base: 6, desc: v => `le sort brûle (${num(v)}/s), +20%`, apply: (s, v) => { s.onHit.cast.burn += v; s.castMult += 0.2 } },
  { id: 'sudo-dash', god: sudo, slot: 'dash', name: 'Dash brûlant', base: 10, desc: v => `onde de feu à l'arrivée (${num(v)} dégâts) qui brûle`, apply: (s, v) => { s.dashNova += v; s.onHit.dash.burn += 4 } },
  { id: 'sudo-boss', god: sudo, slot: 'passive', name: 'Privilèges élevés', base: 0.25, desc: v => `+${pct(v)} dégâts aux gardiens`, apply: (s, v) => { s.bossDmg += v } },
  { id: 'sudo-kill', god: sudo, slot: 'passive', name: 'kill -9', base: 0.12, desc: v => `exécute les ennemis sous ${pct(v)} de PV`, apply: (s, v) => { s.execute += v } },

  // Fork: more shots, more bodies.
  { id: 'fork-attack', god: fork, slot: 'attack', name: 'Attaque dupliquée', base: 1, desc: v => `chaque attaque tire ${num(v)} projectile${v > 1 ? 's' : ''} en plus`, apply: (s, v) => { s.extraShots += v } },
  { id: 'fork-special', god: fork, slot: 'special', name: 'Spécial en écho', base: 0.2, desc: v => `le spécial se répète, +${pct(v)}`, apply: (s, v) => { s.specialEcho = true; s.specialMult += v } },
  { id: 'fork-cast', god: fork, slot: 'cast', name: 'Sort forké', base: 0.2, desc: v => `le sort part en 3, +${pct(v)}`, apply: (s, v) => { s.castSplit = true; s.castMult += v } },
  { id: 'fork-dash', god: fork, slot: 'dash', name: 'Dash forké', base: 1, desc: v => `+${num(v)} charge${v > 1 ? 's' : ''} de dash`, apply: (s, v) => { s.dashCharges += v } },
  { id: 'fork-child', god: fork, slot: 'passive', name: 'Processus enfant', base: 1, desc: v => `${num(v)} familier${v > 1 ? 's' : ''} t'accompagne${v > 1 ? 'nt' : ''} dans chaque salle`, apply: (s, v) => { s.summons += v } },
  { id: 'fork-bomb', god: fork, slot: 'passive', name: 'Fork bomb', base: 0.15, desc: v => `${pct(v)} de chance qu'une victime devienne un familier`, apply: (s, v) => { s.killSummon += v } },

  // Rebase: time slows, freezes, slips away.
  { id: 'rebase-attack', god: rebase, slot: 'attack', name: 'Attaque rétroactive', base: 0.3, desc: v => `l'attaque ralentit de ${pct(v)}, +10%`, apply: (s, v) => { s.onHit.attack.chill += v; s.attackMult += 0.1 } },
  { id: 'rebase-special', god: rebase, slot: 'special', name: 'Spécial figé', base: 0.25, desc: v => `le spécial ralentit de 50% et gèle ${pct(v)} du temps`, apply: (s, v) => { s.onHit.special.chill += 0.5; s.onHit.special.freeze += v } },
  { id: 'rebase-cast', god: rebase, slot: 'cast', name: 'Sort de stase', base: 0.6, desc: v => `le sort gèle (${pct(v)} de chance), +15%`, apply: (s, v) => { s.onHit.cast.freeze += v; s.castMult += 0.15 } },
  { id: 'rebase-dash', god: rebase, slot: 'dash', name: 'Dash temporel', base: 12, desc: v => `dash plus court à recharger, onde de ${num(v)} dégâts`, apply: (s, v) => { s.dashCd *= 0.6; s.dashIframes += 0.1; s.dashNova += v; s.onHit.dash.chill += 0.3 } },
  { id: 'rebase-passive', god: rebase, slot: 'passive', name: 'Esquive temporelle', base: 0.12, desc: v => `+${pct(v)} esquive`, apply: (s, v) => { s.dodge += v } },
  { id: 'rebase-slow', god: rebase, slot: 'passive', name: 'Bisect', base: 0.3, desc: v => `+${pct(v)} dégâts aux ennemis ralentis`, apply: (s, v) => { s.chillDmg += v } },

  // Lint: poison that stacks, thorns.
  { id: 'lint-attack', god: lint, slot: 'attack', name: 'Attaque toxique', base: 2, desc: v => `l'attaque empoisonne (${num(v)}/s, cumulable ×5)`, apply: (s, v) => { s.onHit.attack.poison += v } },
  { id: 'lint-special', god: lint, slot: 'special', name: 'Spécial strict', base: 4, desc: v => `le spécial empoisonne (${num(v)}/s), +15%`, apply: (s, v) => { s.onHit.special.poison += v; s.specialMult += 0.15 } },
  { id: 'lint-cast', god: lint, slot: 'cast', name: 'Sort de diagnostic', base: 5, desc: v => `le sort empoisonne (${num(v)}/s), +20%`, apply: (s, v) => { s.onHit.cast.poison += v; s.castMult += 0.2 } },
  { id: 'lint-dash', god: lint, slot: 'dash', name: 'Dash épineux', base: 8, desc: v => `le dash laisse des piques (${num(v)} dégâts)`, apply: (s, v) => { s.dashTrail += v } },
  { id: 'lint-passive', god: lint, slot: 'passive', name: 'Épines de style', base: 6, desc: v => `renvoie ${num(v)} dégâts au contact`, apply: (s, v) => { s.thorns += v } },
  { id: 'lint-strict', god: lint, slot: 'passive', name: 'Mode strict', base: 0.4, desc: v => `poison +${pct(v)}`, apply: (s, v) => { s.poisonMult += v } },

  // Cache: heals and shields.
  { id: 'cache-attack', god: cache, slot: 'attack', name: 'Attaque mémorisée', base: 0.5, desc: v => `l'attaque soigne de ${num(v)} PV par touche, +10%`, apply: (s, v) => { s.hitHeal += v; s.attackMult += 0.1 } },
  { id: 'cache-special', god: cache, slot: 'special', name: 'Spécial persistant', base: 2, desc: v => `chaque touche du spécial donne ${num(v)} de bouclier, +15%`, apply: (s, v) => { s.shieldOnHit += v; s.specialMult += 0.15 } },
  { id: 'cache-cast', god: cache, slot: 'cast', name: 'Sort en cache', base: 3, desc: v => `le sort soigne de ${num(v)} par touche`, apply: (s, v) => { s.castHeal += v } },
  { id: 'cache-dash', god: cache, slot: 'dash', name: 'Dash en cache', base: 4, desc: v => `chaque dash donne ${num(v)} de bouclier`, apply: (s, v) => { s.dashShield += v } },
  { id: 'cache-passive', god: cache, slot: 'passive', name: 'Récupération', base: 4, desc: v => `+${num(v)} PV par victime`, apply: (s, v) => { s.lifesteal += v } },
  { id: 'cache-shield', god: cache, slot: 'passive', name: 'Cache chaud', base: 10, desc: v => `bouclier de ${num(v)} au début de chaque salle, se recharge lentement`, apply: (s, v) => { s.shield += v; s.shieldRegen += 1 } },

  // Commit: health, armour, stun.
  { id: 'commit-attack', god: commit, slot: 'attack', name: 'Frappe atomique', base: 0.2, desc: v => `attaque +${pct(v)}, critiques +50%`, apply: (s, v) => { s.attackMult += v; s.critDmg += 0.5 } },
  { id: 'commit-special', god: commit, slot: 'special', name: 'Spécial scellé', base: 0.3, desc: v => `spécial +${pct(v)}, étourdit`, apply: (s, v) => { s.specialMult += v; s.specialStun += 0.8; s.onHit.special.stun += 0.8 } },
  { id: 'commit-cast', god: commit, slot: 'cast', name: 'Sort signé', base: 0.4, desc: v => `sort +${pct(v)}, étourdit 1 s`, apply: (s, v) => { s.castMult += v; s.onHit.cast.stun += 1 } },
  { id: 'commit-dash', god: commit, slot: 'dash', name: 'Dash scellé', base: 6, desc: v => `onde à l'arrivée (${num(v)} dégâts) qui étourdit 0,8 s`, apply: (s, v) => { s.dashNova += v; s.onHit.dash.stun += 0.8 } },
  { id: 'commit-passive', god: commit, slot: 'passive', name: 'Constitution', base: 20, desc: v => `+${num(v)} PV max`, apply: (s, v) => { s.maxHp += v } },
  { id: 'commit-armor', god: commit, slot: 'passive', name: 'Armure signée', base: 0.12, desc: v => `réduit les dégâts subis de ${pct(v)}`, apply: (s, v) => { s.armor += v } },
  { id: 'commit-rollback', god: commit, slot: 'passive', name: 'Rollback', base: 1, desc: () => '+1 Défi de la mort pour cette descente', apply: () => {}, onPick: run => { run.defiance += 1 } },

  // Pipe: lightning that jumps, speed.
  { id: 'pipe-attack', god: pipe, slot: 'attack', name: 'Attaque pipelinée', base: 0.2, desc: v => `frappe ${pct(v)} plus vite, un éclair saute à un voisin`, apply: (s, v) => { s.attackSpeed += v; s.onHit.attack.chain += 1 } },
  { id: 'pipe-special', god: pipe, slot: 'special', name: 'Spécial en tube', base: 2, desc: v => `le spécial lance un éclair qui saute ${num(v)} fois`, apply: (s, v) => { s.onHit.special.chain += v } },
  { id: 'pipe-cast', god: pipe, slot: 'cast', name: 'Flux continu', base: 0.5, desc: v => `+1 sort, sort +${pct(v)}`, apply: (s, v) => { s.castAmmo += 1; s.castMult += v } },
  { id: 'pipe-dash', god: pipe, slot: 'dash', name: 'Dash électrique', base: 3, desc: v => `le dash foudroie ${num(v)} ennemis proches`, apply: (s, v) => { s.dashZap += v; s.dashCd *= 0.85 } },
  { id: 'pipe-passive', god: pipe, slot: 'passive', name: 'Débit', base: 0.1, desc: v => `+${pct(v)} dégâts`, apply: (s, v) => { s.dmg += v } },
  { id: 'pipe-tee', god: pipe, slot: 'passive', name: 'tee', base: 0.25, desc: v => `éclairs +${pct(v)} et +1 saut`, apply: (s, v) => { s.chainDmg += v; s.chainBonus += 1 } },
]

/** Duo boons: offered once you hold a boon from each of two gods. */
export const DUO_BOONS: BoonDef[] = [
  { id: 'duo-grep-sudo', god: `${grep} ✕ ${sudo}`, duo: [grep, sudo], slot: 'passive', name: 'Œil de root', base: 0.25, desc: v => `ce qui brûle est marqué ; marque +${pct(v)}`, apply: (s, v) => { s.burnMarks = true; s.markBonus += v } },
  { id: 'duo-sudo-lint', god: `${sudo} ✕ ${lint}`, duo: [sudo, lint], slot: 'passive', name: 'Fumées toxiques', base: 0.2, desc: v => `brûlé et empoisonné à la fois : les deux font double ; brûlure +${pct(v)}`, apply: (s, v) => { s.toxicFire = true; s.burnMult += v } },
  { id: 'duo-rebase-commit', god: `${rebase} ✕ ${commit}`, duo: [rebase, commit], slot: 'passive', name: 'Gel du dépôt', base: 0.2, desc: v => `chaque coup sur un ennemi ralenti a ${pct(v)} de chance de le geler`, apply: (s, v) => { s.chillFreeze += v } },
  { id: 'duo-fork-pipe', god: `${fork} ✕ ${pipe}`, duo: [fork, pipe], slot: 'passive', name: 'Éclairs parallèles', base: 2, desc: v => `les éclairs sautent ${num(v)} fois de plus, l'attaque en lance un`, apply: (s, v) => { s.chainBonus += v; s.onHit.attack.chain += 1 } },
  { id: 'duo-cache-commit', god: `${cache} ✕ ${commit}`, duo: [cache, commit], slot: 'passive', name: 'Sauvegarde incrémentale', base: 10, desc: v => `les soins en trop deviennent bouclier ; bouclier +${num(v)}`, apply: (s, v) => { s.healToShield = true; s.shield += v } },
  { id: 'duo-grep-fork', god: `${grep} ✕ ${fork}`, duo: [grep, fork], slot: 'passive', name: 'Recherche parallèle', base: 1, desc: v => `+${num(v)} projectile par attaque, tous à tête chercheuse et marquants`, apply: (s, v) => { s.extraShots += v; s.homing += 3; s.onHit.attack.mark += 1.5 } },
  { id: 'duo-lint-rebase', god: `${lint} ✕ ${rebase}`, duo: [lint, rebase], slot: 'passive', name: 'Régression lente', base: 0.3, desc: v => `le poison ralentit de ${pct(v)} et se propage à la mort`, apply: (s, v) => { s.poisonChill += v; s.poisonSpread = true } },
  { id: 'duo-pipe-sudo', god: `${pipe} ✕ ${sudo}`, duo: [pipe, sudo], slot: 'passive', name: 'Surtension', base: 6, desc: v => `les éclairs brûlent (${num(v)}/s), +1 saut`, apply: (s, v) => { s.chainBurn += v; s.chainBonus += 1 } },
  { id: 'duo-fork-cache', god: `${fork} ✕ ${cache}`, duo: [fork, cache], slot: 'passive', name: 'Processus orphelins', base: 1, desc: v => `+${num(v)} familier par salle, +3 PV par victime`, apply: (s, v) => { s.summons += v; s.lifesteal += 3 } },
  { id: 'duo-rebase-grep', god: `${rebase} ✕ ${grep}`, duo: [rebase, grep], slot: 'passive', name: 'git bisect', base: 0.25, desc: v => `marquer ralentit de 30% ; +${pct(v)} dégâts aux ralentis`, apply: (s, v) => { s.markChill += 0.3; s.chillDmg += v } },
  { id: 'duo-commit-lint', god: `${commit} ✕ ${lint}`, duo: [commit, lint], slot: 'passive', name: 'Hook pre-commit', base: 4, desc: v => `blessé, tu empoisonnes tout autour (${num(v)}/s) ; épines ×2`, apply: (s, v) => { s.hurtPoison += v; s.thorns *= 2 } },
  { id: 'duo-pipe-rebase', god: `${pipe} ✕ ${rebase}`, duo: [pipe, rebase], slot: 'passive', name: 'Flux tendu', base: 0.15, desc: v => `chaque victime recharge le dash ; frappe ${pct(v)} plus vite`, apply: (s, v) => { s.dashOnKill = true; s.attackSpeed += v } },
  { id: 'duo-sudo-commit', god: `${sudo} ✕ ${commit}`, duo: [sudo, commit], slot: 'passive', name: 'Force majeure', base: 0.08, desc: v => `exécute ${pct(v)} plus haut ; les critiques font +50%`, apply: (s, v) => { s.execute += v; s.critDmg += 0.5 } },
]

/** Isaac items: treasure pedestals and the shop. Taken twice, they stack. */
export const ITEMS: BoonDef[] = ([
  { id: 'i-double', name: 'Double tir', desc: 'chaque attaque tire un projectile de plus', apply: s => { s.extraShots += 1 } },
  { id: 'i-homing', name: 'Tête chercheuse', desc: 'les projectiles suivent les ennemis', apply: s => { s.homing += 4 } },
  { id: 'i-big', name: 'Gros fichier', desc: 'projectiles plus gros, +10% dégâts', apply: s => { s.projSize += 1; s.dmg += 0.1 } },
  { id: 'i-pierce', name: '--force', desc: 'les flèches et les sorts transpercent', apply: s => { s.pierce = true; s.castMult += 0.1 } },
  { id: 'i-ricochet', name: 'Rebond réseau', desc: 'les projectiles rebondissent vers un autre ennemi', apply: s => { s.ricochet += 1 } },
  { id: 'i-orbital', name: 'Daemon orbital', desc: 'une lame tourne autour de toi', apply: s => { s.orbitals += 1 } },
  { id: 'i-explode', name: 'rm -rf', desc: 'les ennemis explosent en mourant (10 dégâts)', apply: s => { s.explodeOnKill += 10 } },
  { id: 'i-dash', name: 'Second souffle', desc: '+1 charge de dash', apply: s => { s.dashCharges += 1 } },
  { id: 'i-freeze', name: 'Glaçon', desc: 'chaque coup a 8% de chance de geler', apply: s => { for (const src of SRCS) s.onHit[src].freeze += 0.08 } },
  { id: 'i-burn', name: 'Allumette', desc: 'tous tes coups brûlent (2/s)', apply: s => { for (const src of SRCS) s.onHit[src].burn += 2 } },
  { id: 'i-poison', name: 'Seringue', desc: 'tous tes coups empoisonnent (1/s)', apply: s => { for (const src of SRCS) s.onHit[src].poison += 1 } },
  { id: 'i-chain', name: 'Bobine Tesla', desc: 'attaque et sort lancent un éclair', apply: s => { s.onHit.attack.chain += 1; s.onHit.cast.chain += 1 } },
  { id: 'i-crit', name: 'Trèfle', desc: '+8% critique', apply: s => { s.crit += 0.08 } },
  { id: 'i-critdmg', name: 'Loupe', desc: 'critiques +60%', apply: s => { s.critDmg += 0.6 } },
  { id: 'i-heart', name: 'Cœur de rechange', desc: '+15 PV max', apply: s => { s.maxHp += 15 } },
  { id: 'i-armor', name: 'Casque', desc: 'réduit les dégâts subis de 10%', apply: s => { s.armor += 0.1 } },
  { id: 'i-shield', name: "Bouclier d'énergie", desc: 'bouclier de 8 à chaque salle, se recharge', apply: s => { s.shield += 8; s.shieldRegen += 0.5 } },
  { id: 'i-speed', name: 'Café', desc: 'frappe 15% plus vite', apply: s => { s.attackSpeed += 0.15 } },
  { id: 'i-vamp', name: 'Dent de vampire', desc: '+2 PV par victime', apply: s => { s.lifesteal += 2 } },
  { id: 'i-familiar', name: 'Petit démon', desc: 'un familier de plus dans chaque salle', apply: s => { s.summons += 1 } },
  { id: 'i-greed', name: 'Tirelire', desc: '+1 éclat par victime, +15 éclats tout de suite', apply: s => { s.killShards += 1 }, onPick: run => { run.eclats += 15 } },
  { id: 'i-regen', name: 'Bandage', desc: '+5 PV à chaque salle nettoyée', apply: s => { s.roomHeal += 5 } },
  { id: 'i-boss', name: 'Tueur de gardiens', desc: '+25% dégâts aux gardiens', apply: s => { s.bossDmg += 0.25 } },
  { id: 'i-glass', name: 'Canon de verre', desc: '+40% dégâts, −15 PV max', apply: s => { s.dmg += 0.4; s.maxHp -= 15 } },
  { id: 'i-mark', name: 'Lunette', desc: 'tous tes coups marquent 2 s', apply: s => { for (const src of SRCS) s.onHit[src].mark += 2 } },
  { id: 'i-panic', name: 'Mode panique', desc: '+50% dégâts sous 35% de PV', apply: s => { s.lowHpDmg += 0.5 } },
  { id: 'i-ammo', name: 'Munitions', desc: '+1 sort', apply: s => { s.castAmmo += 1 } },
  { id: 'i-nova', name: 'Retour de flamme', desc: 'blessé, tu repousses une onde de 15 dégâts', apply: s => { s.hurtNova += 15 } },
  { id: 'i-luck', name: 'Patte de lapin', desc: 'bienfaits plus rares, −15% en boutique', apply: s => { s.luck += 0.15; s.shopDiscount += 0.15 } },
] as { id: string; name: string; desc: string; apply: (s: CombatStats) => void; onPick?: BoonDef['onPick'] }[]).map(item => ({
  id: item.id, god: 'Trésor', slot: 'item' as Slot, name: item.name, base: 1, isItem: true,
  desc: () => item.desc, apply: (s: CombatStats) => item.apply(s), onPick: item.onPick,
}))

/** Every offerable thing, by id: god boons, duos, then items. */
export const BOONS: BoonDef[] = [...GOD_BOONS, ...DUO_BOONS, ...ITEMS]

export const SLOT_LABEL: Record<Slot, string> = {
  attack: 'Attaque', special: 'Spécial', cast: 'Sort', dash: 'Dash', passive: 'Passif', item: 'Objet',
}

/** Rarities by index: 3 heroic is rare, 4 marks a duo, 5 an item. */
export const RARITY = [
  { label: 'Commun', mult: 1 },
  { label: 'Rare', mult: 1.5 },
  { label: 'Épique', mult: 2 },
  { label: 'Héroïque', mult: 2.5 },
  { label: 'Duo', mult: 1 },
  { label: 'Objet', mult: 1 },
]
export const DUO_RARITY = 4
export const ITEM_RARITY = 5

/** A boon's value at a rarity and a level (each level adds 40% of the base). */
export function boonValue(def: BoonDef, rarity: number, level = 1): number {
  const v = def.base * (RARITY[rarity] ?? RARITY[0]!).mult * (1 + 0.4 * (Math.max(1, level) - 1))
  return def.base < 1 ? Math.round(v * 100) / 100 : Math.round(v)
}

// ---------- meta ----------

export type MirrorDef = { id: string; name: string; desc: string; costs: number[] }

export const MIRROR: MirrorDef[] = [
  { id: 'vigueur', name: 'Vigueur', desc: '+8 PV max par rang', costs: [10, 20, 35, 55, 80] },
  { id: 'force', name: 'Force', desc: '+8% dégâts par rang', costs: [25, 50, 90] },
  { id: 'chance', name: 'Chance', desc: '+5% critique par rang', costs: [15, 30, 50] },
  { id: 'defi', name: 'Défi de la mort', desc: 'revient à 50% PV une fois par rang', costs: [60, 120] },
  { id: 'fortune', name: 'Fortune', desc: '+20% éclats par rang', costs: [20, 40, 70] },
  { id: 'eclaireur', name: 'Éclaireur', desc: 'commence avec un bienfait', costs: [40] },
]

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
    case 'atk': return `+${value * 10}% dégâts`
    case 'maxHp': return `+${value} PV max`
    case 'crit': return `+${pct(value)} critique`
    case 'lifesteal': return `+${value} PV par victime`
    case 'thorns': return `épines ${value}`
    case 'dodge': return `+${pct(value)} esquive`
    case 'nectar': return `+${value} sort`
  }
}

/** Error signatures: what a failed command spawns. */
export const ERROR_NAMES: [RegExp, string, string][] = [
  [/\bTypeError\b/, 'TypeError', 'le Spectre Indéfini'],
  [/\bReferenceError\b/, 'ReferenceError', 'le Fantôme Non Déclaré'],
  [/\bSyntaxError\b/, 'SyntaxError', 'la Chimère Mal Fermée'],
  [/\berror TS\d+/, 'TSError', 'le Golem Mal Typé'],
  [/\bENOENT\b|No such file or directory/, 'ENOENT', 'le Chemin Perdu'],
  [/\bEADDRINUSE\b/, 'EADDRINUSE', 'le Squatteur de Port'],
  [/\bECONNREFUSED\b/, 'ECONNREFUSED', 'la Porte Close'],
  [/\bEACCES\b|Permission denied/, 'EACCES', 'le Gardien Jaloux'],
  [/command not found/, 'CommandNotFound', "l'Écho Sans Commande"],
  [/Traceback \(most recent call last\)/, 'Traceback', 'le Serpent Tracé'],
  [/\bpanicked at\b|\bpanic:/, 'Panic', 'la Rouille Hurlante'],
  [/Segmentation fault/, 'Segfault', 'le Déchireur de Mémoire'],
  [/timed? ?out\b|Timeout/i, 'Timeout', 'la Liche du Délai'],
  [/\bFAIL\b|failed\b.*\btests?\b|\btests? failed/i, 'TestFail', 'le Juge Rouge'],
  [/CONFLICT|merge conflict/i, 'Conflict', 'le Merge Maudit'],
  [/error:/i, 'Error', 'la Bête Anonyme'],
]

export const ERROR_EPITHETS = [
  'la Goule Asynchrone', 'le Rongeur de Pile', "l'Ombre du Cache", 'la Larve Nulle',
  'le Démon du Build', "l'Âme Non Typée", 'le Ver de Dépendance',
]

export const BOSSES = ['Le Merge Conflict', 'Le Démon de la Prod', "L'Hydre des Dépendances"]

export const DEFAULT_BIOMES = ['Les Racines du Dépôt', 'Les Abysses de node_modules', 'Le Cœur du Monolithe']

export const DEFAULT_CHAMBERS = [
  'Salle des Logs', 'Couloir des Imports', 'Crypte des Tests', 'Archives du Changelog',
  'Puits du Cache', 'Galerie des Types', 'Forge du Build', 'Chapelle du Linter',
]

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
