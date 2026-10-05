// The retro sound effects: their names, how loud, and the mixer that keeps them sparse.
// The clips live in assets/sfx/<name>.wav (made by assets/make_sfx.py); `$.audio.play`
// plays them with afplay on macOS and plays nothing in a terminal without a player.

export const SFX = [
  'hit', 'crit', 'kill', 'dash', 'hurt', 'pickup', 'shard', 'door', 'clear', 'boss', 'phase',
  'boon', 'levelup', 'death', 'shoot', 'explode', 'menu', 'rift', 'heal', 'seal', 'narrator',
] as const
export type Sfx = (typeof SFX)[number]

/** Other names the sim or the hooks may use for the same clip. */
const ALIAS: Record<string, Sfx> = {
  'door-open': 'door', doors: 'door', open: 'door',
  'room-clear': 'clear', cleared: 'clear',
  'boss-appear': 'boss', 'boss-phase': 'phase', bossphase: 'phase',
  'level-up': 'levelup', level: 'levelup', revived: 'levelup',
  'menu-select': 'menu', select: 'menu',
  swing: 'hit', blow: 'hit', bolt: 'shoot', arrow: 'shoot', cast: 'shoot',
  heart: 'heal', chest: 'shard', coin: 'shard', buy: 'pickup',
  died: 'death', nova: 'explode', boom: 'explode', commit: 'seal', relic: 'seal',
}

export function sfxName(raw: string): Sfx | null {
  const name = raw.toLowerCase()
  if ((SFX as readonly string[]).includes(name)) return name as Sfx
  return ALIAS[name] ?? null
}

/** What a sim signal sounds like, for a sim that does not name its own sounds. */
export const SIGNAL_SFX: Partial<Record<string, Sfx>> = {
  kill: 'kill', chest: 'shard', portal: 'boon', buy: 'pickup', cleared: 'clear',
  door: 'door', descend: 'door', died: 'death', revived: 'levelup',
}

/** Linear gain per clip: modest, the long ones softer. */
const GAIN: Partial<Record<Sfx, number>> = {
  hit: 0.35, crit: 0.4, shoot: 0.3, dash: 0.3, menu: 0.35, pickup: 0.4, shard: 0.4,
  boss: 0.5, death: 0.5, explode: 0.4, phase: 0.45,
}
export const gainOf = (name: Sfx) => GAIN[name] ?? 0.45

/** These always get through the rate limit: they are rare and they matter. */
const KEY: ReadonlySet<Sfx> = new Set<Sfx>(['death', 'boss', 'phase', 'clear', 'boon', 'levelup', 'rift', 'seal'])

export type Mixer = { played: { name: Sfx; at: number }[] }

export const newMixer = (): Mixer => ({ played: [] })

/** Max this many clips a second. */
export const PER_SECOND = 6
/** The same clip twice within this many ms plays once. */
export const SAME_MS = 60

/** The busy clips wait longer before playing again: a flurry of blows is one rhythm, not a buzz. */
const GAP: Partial<Record<Sfx, number>> = { hit: 120, shoot: 120, crit: 120, dash: 150, hurt: 250, pickup: 90, shard: 90 }

/** Whether a clip may start at `t` (ms); records it when it may. */
export function admit(mixer: Mixer, name: Sfx, t: number): boolean {
  mixer.played = mixer.played.filter(one => t - one.at < 1000)
  const gap = GAP[name] ?? SAME_MS
  if (mixer.played.some(one => one.name === name && t - one.at < gap)) return false
  if (mixer.played.length >= PER_SECOND && !KEY.has(name)) return false
  mixer.played.push({ name, at: t })
  return true
}

/** Picks what plays from a burst of names: known clips, at most `max`, the key ones first. */
export function pickSounds(mixer: Mixer, raw: readonly string[], t: number, max = 3): Sfx[] {
  const names = raw.map(sfxName).filter((one): one is Sfx => one !== null)
  const ordered = [...names.filter(one => KEY.has(one)), ...names.filter(one => !KEY.has(one))]
  const out: Sfx[] = []
  for (const name of ordered) {
    if (out.length >= max) break
    if (!out.includes(name) && admit(mixer, name, t)) out.push(name)
  }
  return out
}
