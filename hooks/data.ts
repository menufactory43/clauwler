import type { ClassId, Slot, StatKey, WeaponId } from '../types'

// ---------- combat stats ----------

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
}

export function baseStats(): CombatStats {
  return {
    maxHp: 50, dmg: 1, attackMult: 1, specialMult: 1, castMult: 1, crit: 0.03, attackCrit: 0,
    lifesteal: 0, thorns: 0, dodge: 0, castAmmo: 1, castSplit: false, castHeal: 0, castWoundCrit: false,
    dashCd: 0.45, dashIframes: 0.2, dashNova: 0, dashTrail: 0, specialEcho: false, specialStun: 0, attackKnock: 1,
  }
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

// ---------- boons: one per slot, passives stack ----------

export type BoonDef = {
  id: string
  god: string
  slot: Slot
  name: string
  base: number
  desc: (v: number) => string
  apply: (s: CombatStats, v: number) => void
}

const pct = (v: number) => `${Math.round(v * 100)}%`

export const BOONS: BoonDef[] = [
  { id: 'grep-attack', god: "Grep l'Œil", slot: 'attack', name: 'Attaque perçante', base: 0.3, desc: v => `attaque +${pct(v)}, 15% critique`, apply: (s, v) => { s.attackMult += v; s.attackCrit += 0.15 } },
  { id: 'grep-cast', god: "Grep l'Œil", slot: 'cast', name: 'Regard ciblé', base: 0.5, desc: v => `sort +${pct(v)}, toujours critique sur cible blessée`, apply: (s, v) => { s.castMult += v; s.castWoundCrit = true } },
  { id: 'sudo-special', god: 'Sudo le Tout-Puissant', slot: 'special', name: 'Spécial privilégié', base: 0.6, desc: v => `spécial +${pct(v)}`, apply: (s, v) => { s.specialMult += v } },
  { id: 'sudo-attack', god: 'Sudo le Tout-Puissant', slot: 'attack', name: 'Frappe root', base: 0.2, desc: v => `attaque +${pct(v)}, repousse fort`, apply: (s, v) => { s.attackMult += v; s.attackKnock += 1 } },
  { id: 'fork-cast', god: 'Fork le Multiple', slot: 'cast', name: 'Sort forké', base: 0.2, desc: v => `le sort part en 3, +${pct(v)}`, apply: (s, v) => { s.castSplit = true; s.castMult += v } },
  { id: 'fork-special', god: 'Fork le Multiple', slot: 'special', name: 'Spécial en écho', base: 0.2, desc: v => `le spécial se répète, +${pct(v)}`, apply: (s, v) => { s.specialEcho = true; s.specialMult += v } },
  { id: 'rebase-dash', god: 'Rebase le Temporel', slot: 'dash', name: 'Dash temporel', base: 12, desc: v => `dash plus court à recharger, onde de ${v} dégâts`, apply: (s, v) => { s.dashCd *= 0.6; s.dashIframes += 0.1; s.dashNova += v } },
  { id: 'rebase-passive', god: 'Rebase le Temporel', slot: 'passive', name: 'Esquive temporelle', base: 0.12, desc: v => `+${pct(v)} esquive`, apply: (s, v) => { s.dodge += v } },
  { id: 'lint-dash', god: 'Lint la Rigoureuse', slot: 'dash', name: 'Dash épineux', base: 8, desc: v => `le dash laisse des piques (${v} dégâts)`, apply: (s, v) => { s.dashTrail += v } },
  { id: 'lint-passive', god: 'Lint la Rigoureuse', slot: 'passive', name: 'Épines de style', base: 6, desc: v => `renvoie ${v} dégâts au contact`, apply: (s, v) => { s.thorns += v } },
  { id: 'cache-passive', god: 'Cache la Mémoire', slot: 'passive', name: 'Récupération', base: 4, desc: v => `+${v} PV par victime`, apply: (s, v) => { s.lifesteal += v } },
  { id: 'cache-cast', god: 'Cache la Mémoire', slot: 'cast', name: 'Sort en cache', base: 3, desc: v => `le sort soigne de ${v} par touche`, apply: (s, v) => { s.castHeal += v } },
  { id: 'commit-passive', god: 'Commit le Scellé', slot: 'passive', name: 'Constitution', base: 20, desc: v => `+${v} PV max`, apply: (s, v) => { s.maxHp += v } },
  { id: 'commit-special', god: 'Commit le Scellé', slot: 'special', name: 'Spécial scellé', base: 0.3, desc: v => `spécial +${pct(v)}, étourdit`, apply: (s, v) => { s.specialMult += v; s.specialStun += 0.8 } },
  { id: 'pipe-cast', god: 'Pipe le Fluide', slot: 'cast', name: 'Flux continu', base: 0.5, desc: v => `+1 sort, sort +${pct(v)}`, apply: (s, v) => { s.castAmmo += 1; s.castMult += v } },
  { id: 'pipe-passive', god: 'Pipe le Fluide', slot: 'passive', name: 'Débit', base: 0.1, desc: v => `+${pct(v)} dégâts`, apply: (s, v) => { s.dmg += v } },
]

export const SLOT_LABEL: Record<Slot, string> = {
  attack: 'Attaque', special: 'Spécial', cast: 'Sort', dash: 'Dash', passive: 'Passif',
}

export const RARITY = [
  { label: 'Commun', mult: 1 },
  { label: 'Rare', mult: 1.5 },
  { label: 'Épique', mult: 2 },
]

export function boonValue(def: BoonDef, rarity: number): number {
  const v = def.base * (RARITY[rarity] ?? RARITY[0]!).mult
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
