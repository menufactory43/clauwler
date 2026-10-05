export type Mode = 'hall' | 'mirror' | 'vault' | 'chronicle' | 'armory' | 'run' | 'epilogue'

export type ClassId = 'artificier' | 'forgeron' | 'illusionniste' | 'alchimiste' | 'rodeur' | 'vagabond'

export type WeaponId = 'epee' | 'lance' | 'arc' | 'bouclier'

export type Slot = 'attack' | 'special' | 'cast' | 'dash' | 'passive'

export type StatKey = 'maxHp' | 'atk' | 'crit' | 'lifesteal' | 'thorns' | 'dodge' | 'nectar'

export type Ctx = {
  repoKey: string
  repoName: string
  branch: string
  isWild: boolean
}

export type Nemesis = { sig: string; name: string; glyph: string; rank: number }

export type Champion = {
  key: string
  repoName: string
  name: string
  cls: ClassId
  level: number
  xp: number
  scars: string[]
  equipped: string[]
  nemeses: Nemesis[]
  runs: number
  deaths: number
  victories: number
}

export type Relic = { id: string; name: string; effect: StatKey; value: number; origin: string }

export type ChronEntry = { at: string; champ: string; repo: string; text: string }

export type Lineage = {
  eclats: number
  mirror: Record<string, number>
  vault: Relic[]
  chronicle: ChronEntry[]
  runs: number
  weapons: WeaponId[]
  weapon: WeaponId
}

export type ErrorSpawn = { sig: string; name: string }

export type Feed = {
  reads: number
  edits: number
  fails: number
  tests: number
  agents: number
  webs: number
  compactions: number
  commits: number
  touched: string[]
  errorPool: ErrorSpawn[]
  chestPool: number
  familiarPool: number
  portalPool: number
  scrollPool: number
  runeCharge: number
  runeOffers: number
  seals: number
}

export type Reward = 'boon' | 'eclats' | 'heal' | 'vigor' | 'boss' | 'none'

export type BoonInst = { id: string; rarity: number }

export type Side = 'n' | 's' | 'e' | 'w'

export type RoomKind = 'start' | 'normal' | 'treasure' | 'shop' | 'boss' | 'session'

/** One room of a floor, on the floor's grid, as the minimap knows it. */
export type FloorRoom = {
  x: number
  y: number
  kind: RoomKind
  name: string
  isCleared: boolean
  isSeen: boolean
  isVisited: boolean
  /** What is still to take here: `altar`, `shopHeart`, `shopBoon`. */
  loot: string[]
}

/** Where a run stands between rooms: what survives a reload or a camp. */
export type RunProgress = {
  version: 3
  seed: number
  weapon: WeaponId
  biome: number
  depth: number
  biomeName: string
  floor: FloorRoom[]
  cur: number
  entry: Side | null
  hp: number
  bonusHp: number
  boons: BoonInst[]
  eclats: number
  defiance: number
  offer: BoonInst[] | null
  offerQueue: number
  kills: number
  slain: string[]
  log: string[]
}

export type GameState = {
  sessionId: string
  ctx: Ctx
  mode: Mode
  champion: Champion
  lineage: Lineage
  run: RunProgress | null
  feed: Feed
  notice: string[]
  epilogue: string[]
  isPaused: boolean
}

export type Save = {
  sessionId: string
  run: RunProgress | null
  feed: Feed
  isEnded: boolean
}

export type SessionEvent =
  | { kind: 'read'; path?: string }
  | { kind: 'edit'; path?: string }
  | { kind: 'fail'; sig: string; name: string }
  | { kind: 'test' }
  | { kind: 'agent' }
  | { kind: 'web' }
  | { kind: 'compact' }
  | { kind: 'commit'; message: string }

export type MenuAction =
  | { k: 'newRun' }
  | { k: 'resume' }
  | { k: 'mode'; mode: Mode }
  | { k: 'buy'; id: string }
  | { k: 'equip'; relicId: string }
  | { k: 'weapon'; id: WeaponId }
  | { k: 'pick'; i: number }

/** What the input strip posts: the last keys, numbered, so none is lost. */
export type InputPost = { inst: number; keys: { id: number; key: string }[] }

export type InputProps = { hint: string; isLive: boolean }

/** What the pane writes as text over the arena, refreshed as it changes. */
export type Hud = {
  hp: number
  maxHp: number
  ammo: number
  maxAmmo: number
  isDashReady: boolean
  boss: { name: string; pct: number } | null
  banner: string | null
}

declare module 'claude-code' {
  interface PluginState {
    clauwler: { game: GameState | null; hud: Hud | null }
  }
}
