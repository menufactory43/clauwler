// The link with the Claude session, seen from the pane: what each event becomes in the
// dungeon, the Narrator's lines, the Écho de session room. The session provides content,
// the game decides the outcome: nothing here ever costs the player for his real errors.
import type { FloorRoom, GameState, SessionEvent, Side } from '../types'
import { SEALS_PER_RELIC } from './meta'

/** The last session event and what it did in the game, for the pane's Session line. */
export type SessionNote = { icon: string; what: string; effect: string; color: string }

export const ECHO_NAME = 'Écho de session'
/** A main-loop turn this long, or this much work summed, opens an Écho de session. */
export const ECHO_TURN_MS = 60_000
export const ECHO_WORK_MS = 150_000

/** What a test run that passes gives, live: a share of max HP and shards. */
export const TEST_HEAL = 0.15
export const TEST_SHARDS = 3
/** What a commit gives, live, beside its seal. */
export const COMMIT_ECLATS = 5

const STEPS: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }

/** The pane's words for one session event: what Claude did, what the dungeon made of it. */
export function noteFor(ev: SessionEvent, at: { isLive: boolean; isOpen: boolean; seals: number; relic?: string; heal?: number }): SessionNote {
  switch (ev.kind) {
    case 'fail':
      return {
        icon: '⚡', what: ev.sig, color: '#c83ca0',
        effect: at.isOpen ? `une faille s'ouvre, ${ev.name} en sort (tue-le : XP)` : `${ev.name} rôde, il t'attend plus loin`,
      }
    case 'test':
      return { icon: '✔', what: 'tests verts', color: '#6daa2c', effect: at.isLive ? `+${at.heal ?? 0} PV, éclats et coffre` : 'un coffre t\'attend' }
    case 'commit':
      return {
        icon: '🔏', what: `commit « ${clip(ev.message, 28)} »`, color: '#dad45e',
        effect: at.relic ? `relique forgée : ${at.relic}` : `sceau ${at.seals}/${SEALS_PER_RELIC}${at.isLive ? ` · +${COMMIT_ECLATS} ◆` : ''}`,
      }
    case 'read':
      return { icon: '📜', what: `lecture${ev.path ? ` ${clip(ev.path.split('/').pop() ?? '', 22)}` : ''}`, color: '#8595a1', effect: at.isLive ? '+6 PV' : 'parchemin en réserve' }
    case 'edit':
      return { icon: '✎', what: `édition${ev.path ? ` ${clip(ev.path.split('/').pop() ?? '', 22)}` : ''}`, color: '#597dce', effect: 'une rune se grave' }
    case 'agent':
      return { icon: '✧', what: 'sous-agent', color: '#6dc2ca', effect: at.isLive ? 'un familier combat avec toi' : 'un familier t\'attend' }
    case 'web':
      return { icon: '◎', what: 'recherche web', color: '#6dc2ca', effect: at.isLive ? 'un portail à bienfait s\'ouvre' : 'un portail t\'attend' }
    case 'compact':
      return { icon: '🌋', what: 'contexte compacté', color: '#d27d2c', effect: at.isLive ? 'séisme : tes ennemis sont écrasés' : 'le donjon tremble' }
  }
}

function clip(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text
}

const NARRATOR = [
  'Claude pose sa plume. Le donjon retient son souffle.',
  'Un tour s\'achève là-haut ; ici, ta lame se fait plus légère.',
  'Le Narrateur tourne la page : ton pouvoir se recharge.',
  'Quelque part, un terminal s\'apaise. Tes blessures aussi.',
  'Les dieux du dépôt hochent la tête : le travail avance.',
  'Le scribe a fini sa ligne. À toi d\'écrire la suivante.',
  'Une réponse est née. Les ombres reculent d\'un pas.',
  'Le Narrateur murmure : « Elle attend ta réponse, mais rien ne presse. »',
]

export function narratorLine(seed: number): string {
  return NARRATOR[Math.abs(seed) % NARRATOR.length]!
}

/** A main-loop turn's work, summed until it opens an Écho. */
export function isLongWork(turnMs: number, summedMs: number): boolean {
  return turnMs >= ECHO_TURN_MS || summedMs >= ECHO_WORK_MS
}

/**
 * Opens an Écho de session on the current floor: a treasure room with an altar, grafted
 * onto the room the champion stands in when a wall is free, else onto the nearest one.
 * One per floor. Null when the floor holds one already or there is no run.
 */
export function addEcho(state: GameState): { g: GameState; at: number; side: Side; to: number } | null {
  const run = state.run
  if (!run || run.floor.some(room => room.name === ECHO_NAME)) return null
  const has = (x: number, y: number) => run.floor.some(room => room.x === x && room.y === y)
  const order = run.floor.map((_, i) => i).sort((a, b) => (a === run.cur ? -1 : b === run.cur ? 1 : dist(run.floor[a]!, run.floor[run.cur]!) - dist(run.floor[b]!, run.floor[run.cur]!)))
  for (const at of order) {
    const from = run.floor[at]!
    if (from.kind === 'boss') continue
    for (const side of ['e', 'w', 'n', 's'] as const) {
      const x = from.x + STEPS[side][0]
      const y = from.y + STEPS[side][1]
      if (has(x, y)) continue
      // Touching one room only: a dead end, as Isaac's secret rooms.
      const touching = (['n', 's', 'e', 'w'] as const).filter(s => has(x + STEPS[s][0], y + STEPS[s][1])).length
      if (touching !== 1) continue
      const g: GameState = JSON.parse(JSON.stringify(state))
      const echo: FloorRoom = { x, y, kind: 'treasure', name: ECHO_NAME, isCleared: true, isSeen: true, isVisited: false, loot: ['altar'] }
      g.run!.floor.push(echo)
      const line = `✧ Claude a longuement œuvré : un ${ECHO_NAME} apparaît sur la carte.`
      g.run!.log.push(line)
      if (g.run!.log.length > 30) g.run!.log.splice(0, g.run!.log.length - 30)
      return { g, at, side, to: g.run!.floor.length - 1 }
    }
  }
  return null
}

function dist(a: FloorRoom, b: FloorRoom): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}
