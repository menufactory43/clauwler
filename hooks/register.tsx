import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Champion, ClassId, Ctx, GameState, Hud, InputPost, Lineage, MenuAction, Save, SessionEvent } from '../types'
import { BOONS, CLASSES, MIRROR, RARITY, SLOT_LABEL, WEAPONS, boonValue, relicLabel } from './data'
import {
  BIOMES, EDITS_PER_RUNE, RELIC_SLOTS, SEALS_PER_RELIC, applyEvent, boot, championTitle,
  combatStats, commitMessage, endSession, isTestCommand, log, menu, onChest, onBuy, onCleared, onDeath, onDescend, onEnter,
  onKill, onPortal, parseError, prepareRoom, roomName, saveKey, syncHp, toSave, xpToLevel,
} from './meta'
import type { View } from './render'
import { encodeIndexedPng } from './png'
import { frameSize, renderFrame, toCells, toQuads } from './render'
import type { Input, Live } from './sim'
import { FH, FW, createRoom, inject, step } from './sim'

const PANE = 'clauwler'
/** Shown in the pane, so a reload can be told from a stale module. */
const BUILD = 'v0.7'
const FPS = 24
const IDLE_MS = 8000
const game = atom({ plugin: 'clauwler', key: 'game' } as const, null)
const hudAtom = atom({ plugin: 'clauwler', key: 'hud' } as const, null)

const now = () => new Date().toISOString()
const seed = () => Math.floor(Math.random() * 2 ** 31)

// ---------- what lives between frames ----------

let root = ''
let perfPath = ''
let mirror: GameState | null = null
let live: Live | null = null
const frame = new Uint8Array(FW * FH * 4)
/** Fine pixels a world pixel in the picture mode. */
const RES = 2
const FINE_SIZE = frameSize(RES)
const fineFrame = new Uint8Array(FINE_SIZE.width * FINE_SIZE.height * 4)
let frameB64 = ''
let cellsB64 = ''
/** `quads`: 2x2 quarter blocks, the whole room. `half`: half blocks, zoomed on the champion. `image`: kitty graphics. */
let gfx: 'quads' | 'half' | 'image' = 'quads'
let hasStarted = false
let lastHud = ''
let lastHudAt = 0
let arenaCols = 80
let arenaRows = 25
let isBlitting = false
let isHandling = false
let lastTick = 0
let lastInputAt = 0
let needsFrame = true
let cellsSize = ''
/** Pictures sent to the terminal at most this often: each one is a PNG crossing the pty. */
const PICTURE_MS = 1000 / 24 - 5
let lastPictureAt = 0
let wasFocused = false
let isLooping = false
let lastPaneCheck = 0
let inputInst = 0
let lastKeyId = 0
const held = { up: 0, down: 0, left: 0, right: 0 }
const aim = { up: 0, down: 0, left: 0, right: 0 }
const edges = { attack: false, special: false, cast: false, dash: false }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  const native = (bytes as unknown as { toBase64?: () => string }).toBase64
  if (typeof native === 'function') return native.call(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    out += B64[a >> 2]! + B64[((a & 3) << 4) | (b >> 4)]! + (i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)]! : '=') + (i + 2 < bytes.length ? B64[c & 63]! : '=')
  }
  return out
}

function encodeCells(): string {
  return toBase64(gfx === 'quads' ? toQuads(frame, arenaCols, arenaRows) : toCells(frame, arenaCols, arenaRows))
}

// ---------- context ----------

function normalizeRemote(remote: string | null): string | null {
  if (!remote) return null
  return remote.trim().replace(/^[a-z+]+:\/\//, '').replace(/^[^@/]+@/, '').replace(/:(?!\d)/, '/').replace(/\.git$/, '').replace(/\/+$/, '')
}

async function git($: EngineInterface, cwd: string, args: string[]): Promise<string | null> {
  try {
    const ran = await $.process.run(['git', ...args], { cwd, timeoutMs: 3000 })
    return ran.exitCode === 0 ? ran.stdout.trim() : null
  } catch {
    return null
  }
}

async function detectClass($: EngineInterface, dir: string): Promise<ClassId> {
  let names: string[] = []
  try {
    names = (await $.fs.list(dir)).map(entry => entry.name)
  } catch {
    return 'vagabond'
  }
  const has = (test: (name: string) => boolean) => names.some(test)
  if (has(n => n === 'Package.swift' || n.endsWith('.xcodeproj') || n.endsWith('.xcworkspace'))) return 'artificier'
  if (has(n => n === 'Cargo.toml')) return 'forgeron'
  if (has(n => n === 'go.mod')) return 'rodeur'
  if (has(n => n === 'pyproject.toml' || n === 'requirements.txt' || n === 'setup.py')) return 'alchimiste'
  if (has(n => n === 'package.json' || n === 'tsconfig.json')) return 'illusionniste'
  return 'vagabond'
}

async function loadContext($: EngineInterface): Promise<{ ctx: Ctx; cls: ClassId; root: string }> {
  const repo = await $.session.repo()
  if (!repo) return { ctx: { repoKey: 'wild', repoName: 'Terres sauvages', branch: '-', isWild: true }, cls: 'vagabond', root: await $.session.root() }
  let key = normalizeRemote(repo.remote)
  if (!key) {
    const first = await git($, repo.root, ['rev-list', '--max-parents=0', 'HEAD'])
    key = first ? `local:${first.split('\n')[0]!.slice(0, 12)}` : `path:${repo.root}`
  }
  const repoName = (normalizeRemote(repo.remote) ?? repo.root).split('/').pop() || 'dépôt'
  const branch = (await git($, repo.root, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? 'main'
  return { ctx: { repoKey: key, repoName, branch, isWild: false }, cls: await detectClass($, repo.root), root: repo.root }
}

// ---------- state ----------

async function persist($: EngineInterface, g: GameState | null, isEnded = false) {
  if (!g) return
  await $.store.set('lineage', g.lineage)
  await $.store.set(`champ:${g.ctx.repoKey}`, g.champion)
  await $.store.set(saveKey(g.ctx), toSave(g, isEnded))
}

async function change($: EngineInterface, fn: (g: GameState) => GameState, isEnded = false) {
  const before = mirror
  const g = await update($, game, value => (value ? fn(value) : value))
  mirror = g
  await persist($, g, isEnded)
  const relic = g?.lineage.vault[g.lineage.vault.length - 1]
  if (before && g && relic && g.lineage.vault.length > before.lineage.vault.length) $.ui.toast(`⚒ Relique forgée : ${relic.name}`)
  if (g && live) {
    // Boons, levels and relics change the numbers mid-room.
    const s = combatStats(g)
    live.stats = s
    live.ammo = Math.min(live.ammo, s.castAmmo)
    if (g.run) {
      live.player.hp = Math.min(s.maxHp, Math.max(live.player.hp, g.run.hp))
      live.wallet = g.run.eclats
    }
  }
  needsFrame = true
  return g
}

async function enterRoom($: EngineInterface) {
  let built: ReturnType<typeof prepareRoom>['spec'] = null
  const s = seed()
  await change($, g => {
    const prepared = prepareRoom(g, s)
    built = prepared.spec
    return prepared.g
  })
  live = built ? createRoom(built) : null
  lastInputAt = (await $.clock.now())
  needsFrame = true
}

// ---------- boot ----------

function ensureLoop($: EngineInterface) {
  if (isLooping) return
  isLooping = true
  $.clock.every(Math.round(1000 / FPS), () => void tick($))
}

async function start($: EngineInterface, isOpening: boolean) {
  ensureLoop($)
  const sessionId = await $.session.id()
  const loaded = await loadContext($)
  root = loaded.root
  const home = await $.env.get('HOME').catch(() => undefined)
  if (home) perfPath = `${home}/Clauwler/.perf/${sessionId.slice(0, 8)}.log`
  // Real pixels wherever the terminal draws them, as Claude Code itself decides; a cell
  // mode picked with O or G holds for this session and in terminals without pictures.
  const saved = await $.store.get('gfx')
  const term = (await $.env.get('TERM').catch(() => undefined)) ?? ''
  const program = (await $.env.get('TERM_PROGRAM').catch(() => undefined)) ?? ''
  const canPicture = term === 'xterm-ghostty' || term.includes('kitty') || /^(ghostty|WezTerm)$/i.test(program)
  if (!hasStarted) gfx = canPicture ? 'image' : saved === 'half' ? 'half' : 'quads'
  hasStarted = true
  const stored = await read($, game)
  // State an older build of the mod left behind is rebuilt from the store.
  const isCurrent = stored !== null && Array.isArray(stored.lineage?.weapons) && (stored.run === null || stored.run.version === 3)
  const current = isCurrent ? stored : null
  if (current && current.sessionId === sessionId) {
    mirror = current
  } else {
    const ctx = loaded.ctx
    const g = boot({
      sessionId,
      ctx,
      cls: loaded.cls,
      lineage: (await $.store.get('lineage')) as Lineage | undefined,
      champion: (await $.store.get(`champ:${ctx.repoKey}`)) as Champion | undefined,
      save: (await $.store.get(saveKey(ctx))) as Save | undefined,
      now: now(),
    })
    await update($, game, () => g)
    mirror = g
    await persist($, g)
  }
  // A reload drops the room being fought: it starts again, same run.
  if (mirror?.mode === 'run' && mirror.run) {
    await change($, g => ({ ...g, isPaused: true }))
    await enterRoom($)
  }
  if (isOpening) void $.ui.open({ id: PANE, title: 'Clauwler' })
}

// ---------- the loop ----------

/** Isaac without the second stick: aim and swing at whatever is closest, once it is in reach. */
function autoAim(input: Input) {
  if (!live || live.isCleared) return
  const p = live.player
  const reach = live.weapon === 'arc' ? 80 : live.weapon === 'lance' ? 24 : 16
  let best: { x: number; y: number } | undefined
  let bd = Infinity
  for (const e of live.enemies) {
    if (e.state === 'spawn') continue
    const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r
    if (d < bd) { bd = d; best = e }
  }
  if (!best || bd > reach) return
  const dx = best.x - p.x
  const dy = best.y - p.y
  const n = Math.hypot(dx, dy) || 1
  input.ax = dx / n
  input.ay = dy / n
  input.attack = true
}

function moveInput(t: number): Input {
  const on = (k: keyof typeof held) => held[k] > t
  const at = (k: keyof typeof aim) => aim[k] > t
  const input: Input = {
    mx: (on('right') ? 1 : 0) - (on('left') ? 1 : 0),
    my: (on('down') ? 1 : 0) - (on('up') ? 1 : 0),
    ax: (at('right') ? 1 : 0) - (at('left') ? 1 : 0),
    ay: (at('down') ? 1 : 0) - (at('up') ? 1 : 0),
    ...edges,
  }
  // Holding a fire key keeps firing; with none held the champion strikes the nearest foe in reach.
  if (input.ax !== 0 || input.ay !== 0) input.attack = true
  else autoAim(input)
  // One power key: the special, and the cast with it.
  if (input.special) input.cast = true
  edges.attack = edges.special = edges.cast = edges.dash = false
  return input
}

function viewOf(g: GameState): View {
  const run = g.run
  return {
    biomeLabel: run?.biomeName ?? '',
    roomLabel: run ? `${run.biome + 1}-${run.depth + 1}` : '',
    eclats: run?.eclats ?? 0,
    boons: run?.boons.length ?? 0,
    isPaused: g.isPaused,
    isOffer: !!run?.offer,
    hint: 'une touche',
    scale: 1,
    hasPixelHud: false,
    hasWorldText: gfx !== 'quads',
    ...(gfx === 'half' ? { vw: arenaCols, vh: arenaRows * 2 } : gfx === 'quads' ? { vw: arenaCols * 2, vh: arenaRows * 4 } : { res: RES }),
  }
}

/** What the loop costs, written to .perf.log beside the mod every two seconds. */
const perf = { since: 0, lastT: 0, ticks: 0, tickGap: 0, blits: 0, render: 0, encode: 0, blit: 0, bytes: 0, panes: 0, lines: [] as string[] }

async function flushPerf($: EngineInterface, t: number) {
  const secs = (t - perf.since) / 1000
  const n = Math.max(1, perf.blits)
  perf.lines.push(`${new Date(t).toISOString().slice(11, 19)} ${gfx} ticks/s ${(perf.ticks / secs).toFixed(1)} maxGap ${perf.tickGap}ms pictures/s ${(perf.blits / secs).toFixed(1)} render ${(perf.render / n).toFixed(1)}ms encode ${(perf.encode / n).toFixed(1)}ms blit ${(perf.blit / n).toFixed(1)}ms ${Math.round(perf.bytes / n / 1024)}KB paneDraws/s ${(perf.panes / secs).toFixed(1)}`)
  perf.lines = perf.lines.slice(-60)
  Object.assign(perf, { since: t, ticks: 0, tickGap: 0, blits: 0, render: 0, encode: 0, blit: 0, bytes: 0, panes: 0 })
  if (perfPath) await $.fs.write(perfPath, perf.lines.join('\n') + '\n').catch(() => undefined)
}

async function tick($: EngineInterface) {
  const g = mirror
  const t = (await $.clock.now())
  const dt = lastTick ? (t - lastTick) / 1000 : 1 / FPS
  lastTick = t
  if (!g || g.mode !== 'run' || !live) return
  const isPlaying = !g.isPaused && !g.run?.offer && !live.isDead
  // Giving the keys back to Claude pauses the fight.
  if (t - lastPaneCheck > 400) {
    lastPaneCheck = t
    const isFocused = (await $.ui.panes()).some(pane => pane.id === PANE && pane.isFocused)
    if (wasFocused && !isFocused && isPlaying) await change($, s => ({ ...s, isPaused: true }))
    wasFocused = isFocused
  }
  if (isPlaying && mirror && !mirror.isPaused) {
    if (t - lastInputAt > IDLE_MS && !live.isCleared) {
      await change($, s => ({ ...s, isPaused: true }))
    } else {
      step(live, moveInput(t), dt)
      needsFrame = true
      if (live.signals.length > 0 && !isHandling) {
        isHandling = true
        try {
          await handleSignals($)
        } finally {
          isHandling = false
        }
      }
    }
  }
  if (live && t - lastHudAt > 250) {
    const s = live.stats
    const boss = live.enemies.find(e => e.type === 'boss' && e.state !== 'spawn')
    const hud: Hud = {
      hp: Math.max(0, Math.ceil(live.player.hp)),
      maxHp: s.maxHp,
      ammo: live.ammo,
      maxAmmo: s.castAmmo,
      isDashReady: live.player.dashCd <= 0,
      boss: boss ? { name: boss.name.split(',')[0] ?? boss.name, pct: Math.round((20 * boss.hp) / boss.maxHp) * 5 } : null,
      banner: live.banner?.text ?? null,
    }
    const key = JSON.stringify(hud)
    if (key !== lastHud) {
      lastHud = key
      lastHudAt = t
      await update($, hudAtom, () => hud)
    }
  }
  perf.ticks++
  perf.tickGap = Math.max(perf.tickGap, t - perf.lastT)
  perf.lastT = t
  if (t - perf.since > 2000) await flushPerf($, t)
  if (!needsFrame || isBlitting || !mirror || !live) return
  if (gfx === 'image' && t - lastPictureAt < PICTURE_MS) return
  lastPictureAt = t
  needsFrame = false
  const r0 = Date.now()
  renderFrame(live, viewOf(mirror), gfx === 'image' ? fineFrame : frame)
  perf.render += Date.now() - r0
  isBlitting = true
  try {
    if (gfx === 'image') {
      const e0 = Date.now()
      frameB64 = toBase64(encodeIndexedPng(fineFrame, FINE_SIZE.width, FINE_SIZE.height))
      perf.encode += Date.now() - e0
      perf.bytes += frameB64.length
      const b0 = Date.now()
      await $.ui.blit({ requestId: PANE, key: 'arena', source: { png: frameB64 } })
      perf.blit += Date.now() - b0
      perf.blits++
    } else {
      cellsB64 = encodeCells()
      await $.ui.blit({ requestId: PANE, key: 'arena', cells: cellsB64 })
    }
  } catch {
    // Not drawn right now: the next frame tries again.
  } finally {
    isBlitting = false
  }
}

async function handleSignals($: EngineInterface) {
  while (live && live.signals.length > 0) {
    const sig = live.signals.shift()!
    const hp = Math.max(0, Math.round(live.player.hp))
    switch (sig.k) {
      case 'kill': await change($, g => onKill(g, sig, now())); break
      case 'chest': await change($, g => onChest(g, sig.n)); break
      case 'portal': await change($, g => onPortal(syncHp(g, hp, live?.player.defiance ?? 0))); break
      case 'log': await change($, g => log(g, sig.text)); break
      case 'revived': await change($, g => log(syncHp(g, hp, live?.player.defiance ?? 0), '✟ Défi de la mort : tu te relèves !')); break
      case 'cleared': {
        const g = await change($, s => onCleared(syncHp(s, hp, live?.player.defiance ?? 0), hp, now()))
        if (!g?.run) {
          live = null
          $.ui.status(undefined)
          return
        }
        if (live) live.player.hp = g.run.hp
        break
      }
      case 'door':
        await change($, g => onEnter(syncHp(g, hp, live?.player.defiance ?? 0), sig.to, sig.side, hp))
        await enterRoom($)
        return
      case 'descend':
        await change($, g => onDescend(syncHp(g, hp, live?.player.defiance ?? 0), hp))
        await enterRoom($)
        return
      case 'buy':
        await change($, g => onBuy(syncHp(g, hp, live?.player.defiance ?? 0), sig.item, sig.price))
        break
      case 'died':
        await change($, g => onDeath(g, sig.killer, now()))
        live = null
        $.ui.status(undefined)
        return
    }
  }
  if (live && mirror?.run) $.ui.status(`⚔ ${mirror.champion.name} ${Math.ceil(live.player.hp)}/${live.stats.maxHp} PV · ◆${mirror.run.eclats}`)
}

// ---------- keys ----------

const DIRS: Record<string, keyof typeof held> = {
  z: 'up', w: 'up', up: 'up', s: 'down', down: 'down', q: 'left', a: 'left', left: 'left', d: 'right', right: 'right',
}
const OPPOSITE: Record<keyof typeof held, keyof typeof held> = { up: 'down', down: 'up', left: 'right', right: 'left' }
const PERPENDICULAR: Record<keyof typeof held, (keyof typeof held)[]> = { up: ['left', 'right'], down: ['left', 'right'], left: ['up', 'down'], right: ['up', 'down'] }
const ACTIONS: Record<string, keyof typeof edges> = { return: 'attack', e: 'dash', r: 'special', f: 'cast', ' ': 'dash', space: 'dash' }
/** Isaac's second stick: IJKL fire (or swing) that way while you walk another. */
const SHOTS: Record<string, keyof typeof aim> = { i: 'up', k: 'down', j: 'left', l: 'right' }

const HALL_KEYS: Record<string, MenuAction> = {
  n: { k: 'newRun' }, r: { k: 'resume' }, m: { k: 'mode', mode: 'mirror' }, a: { k: 'mode', mode: 'armory' },
  v: { k: 'mode', mode: 'vault' }, c: { k: 'mode', mode: 'chronicle' }, b: { k: 'mode', mode: 'hall' }, h: { k: 'mode', mode: 'hall' },
}

async function play($: EngineInterface, a: MenuAction) {
  const before = mirror
  const g = await change($, s => menu(s, a, now(), seed()))
  if (!g) return
  const isStarting = (a.k === 'newRun' || a.k === 'resume') && g.mode === 'run'
  if (isStarting && (a.k === 'newRun' || !live || before?.mode !== 'run')) await enterRoom($)
  lastInputAt = (await $.clock.now())
}

async function onKey($: EngineInterface, key: string) {
  const g = mirror
  if (!g) return
  const t = (await $.clock.now())
  lastInputAt = t
  if (key === 'g' || key === 'o') {
    gfx = key === 'g' ? (gfx === 'image' ? 'quads' : 'image') : gfx === 'quads' ? 'half' : 'quads'
    await $.store.set('gfx', gfx)
    frameB64 = ''
    cellsB64 = ''
    await change($, s => ({ ...s }))
    return
  }
  if (g.mode === 'run' && g.run) {
    if (g.run.offer) {
      if (key === '1' || key === '2' || key === '3') await play($, { k: 'pick', i: Number(key) - 1 })
      return
    }
    if (key === 'p') {
      await change($, s => ({ ...s, isPaused: !s.isPaused }))
      return
    }
    if (key === 'h') {
      const hp = Math.round(live?.player.hp ?? g.run.hp)
      await change($, s => ({ ...syncHp(s, hp, live?.player.defiance ?? s.run?.defiance ?? 0), mode: 'hall', isPaused: true }))
      live = null
      $.ui.status(undefined)
      return
    }
    if (g.isPaused) await change($, s => ({ ...s, isPaused: false }))
    const dir = DIRS[key]
    if (dir) {
      const isRepeat = held[dir] > t
      held[dir] = t + (isRepeat ? 160 : 520)
      held[OPPOSITE[dir]] = 0
      // A key that repeats keeps the other axis it was pressed with.
      if (isRepeat) for (const other of PERPENDICULAR[dir]) if (held[other] > t) held[other] = t + 160
      return
    }
    const shot = SHOTS[key]
    if (shot) {
      const isRepeat = aim[shot] > t
      aim[shot] = t + (isRepeat ? 160 : 520)
      aim[OPPOSITE[shot]] = 0
      for (const other of PERPENDICULAR[shot]) if (!isRepeat) aim[other] = 0
      edges.attack = true
      return
    }
    const action = ACTIONS[key]
    if (action) edges[action] = true
    return
  }
  if (g.mode === 'epilogue') {
    await play($, { k: 'mode', mode: 'hall' })
    return
  }
  if (/^[1-9]$/.test(key)) {
    const i = Number(key) - 1
    if (g.mode === 'mirror' && MIRROR[i]) await play($, { k: 'buy', id: MIRROR[i]!.id })
    if (g.mode === 'armory' && WEAPONS[i]) await play($, { k: 'weapon', id: WEAPONS[i]!.id })
    const relic = g.lineage.vault.slice(-9)[i]
    if (g.mode === 'vault' && relic) await play($, { k: 'equip', relicId: relic.id })
    return
  }
  const a = HALL_KEYS[key]
  if (a && (a.k !== 'resume' || g.run)) await play($, a)
}

// ---------- reading the session ----------

function relativize(path: unknown): string | undefined {
  if (typeof path !== 'string' || path.length === 0) return undefined
  if (root && path.startsWith(root + '/')) return path.slice(root.length + 1)
  return path.startsWith('/') ? undefined : path
}

function toEvent(tool: string, input: Record<string, unknown>, ran: { deny?: string; isError?: boolean; text?: string }): SessionEvent | null {
  if (ran.deny !== undefined) return null
  switch (tool) {
    case 'Read':
    case 'Grep':
    case 'Glob':
      return { kind: 'read', path: relativize(input.file_path ?? input.path) }
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return ran.isError ? null : { kind: 'edit', path: relativize(input.file_path ?? input.notebook_path) }
    case 'Bash': {
      const command = typeof input.command === 'string' ? input.command : ''
      if (ran.isError) return { kind: 'fail', ...(parseError(ran.text ?? '') ?? { sig: 'Error', name: 'Error, la Bête Anonyme' }) }
      const message = commitMessage(command)
      if (message) return { kind: 'commit', message }
      return isTestCommand(command) ? { kind: 'test' } : null
    }
    case 'Agent':
    case 'Task':
      return { kind: 'agent' }
    case 'WebSearch':
    case 'WebFetch':
      return { kind: 'web' }
    default:
      return null
  }
}

async function feed($: EngineInterface, ev: SessionEvent) {
  const isLive = live !== null && mirror?.mode === 'run'
  await change($, g => applyEvent(g, ev, now(), isLive))
  if (isLive && live) inject(live, ev)
}

// ---------- the hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'clauwler', description: 'Ouvre le donjon de Clauwler dans un panneau' })
    await start($, true)
    return next(e)
  })

  on('command.run', { command: 'clauwler' }, async $ => {
    if (!mirror) await start($, false)
    // Straight into the dungeon, as Isaac does: the camp if there is one, else a new descent.
    if (mirror && mirror.mode !== 'run') await play($, mirror.run ? { k: 'resume' } : { k: 'newRun' })
    else if (mirror?.isPaused) await change($, g => ({ ...g, isPaused: false }))
    const opened = await $.ui.open({ id: PANE, title: 'Clauwler', focus: true, columns: 120 })
    return { text: opened.isPlaced ? 'En jeu : ZQSD bouger (tu frappes tout seul) · E esquive · R pouvoir · P pause · Esc rend la main à Claude.' : "Le panneau n'a pas pu s'ouvrir ici." }
  })

  on('ui.message', async ($, e, next) => {
    const data = e.data as InputPost | undefined
    if (!data || !Array.isArray(data.keys)) return next(e)
    if (data.inst !== inputInst) {
      inputInst = data.inst
      lastKeyId = 0
    }
    for (const k of data.keys) {
      if (typeof k?.id !== 'number' || typeof k.key !== 'string' || k.id <= lastKeyId) continue
      lastKeyId = k.id
      await onKey($, k.key)
    }
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && mirror?.mode === 'run') await change($, g => ({ ...g, isPaused: true }))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      const ev = toEvent(String(e.tool), e as unknown as Record<string, unknown>, ran)
      if (ev) await feed($, ev)
    } catch {
      // The game never gets in the way of the work.
    }
    return ran
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    await feed($, { kind: 'compact' })
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && mirror?.mode === 'run' && (await $.clock.now()) - lastInputAt < 4000) {
      $.ui.toast('Claude a fini son tour. Esc pour lui répondre (le jeu se met en pause).')
    }
    return result
  })

  on('session.end', async ($, e, next) => {
    const hp = live ? Math.round(live.player.hp) : undefined
    await change($, g => endSession(hp === undefined ? g : syncHp(g, hp, live?.player.defiance ?? 0), now()), true)
    live = null
    const result = await next(e)
    if (e.reason === 'clear') {
      await update($, game, () => null)
      mirror = null
      $.clock.after(100, () => void start($, false))
    }
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const g = await read($, game)
    if (!g) return <Text dimColor>Le donjon se réveille…</Text>
    const c = g.champion
    const cols = Math.max(20, Math.min(e.props.bodyColumns, FW))
    const press = (a: MenuAction) => () => play($, a)

    const keys = (list: [string, string, MenuAction][]) => (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {list.map(([hotkey, label, a]) => <Button key={`k-${hotkey}`} plain hotkey={hotkey} label={label} onPress={press(a)} />)}
      </Box>
    )
    const header = (
      <Text bold color="#dad45e">⚔ {championTitle(c)} <Text dimColor>· niv {c.level} · {g.ctx.repoName}{g.ctx.isWild ? '' : `@${g.ctx.branch}`}</Text></Text>
    )
    const isFocused = e.props.isFocused
    const minimap = (run: NonNullable<GameState['run']>) => {
      const seen = run.floor.filter(room => room.isSeen)
      const xs = seen.map(room => room.x)
      const ys = seen.map(room => room.y)
      const rows = []
      for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
        const cells = []
        for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
          const i = run.floor.findIndex(room => room.x === x && room.y === y && room.isSeen)
          const room = run.floor[i]
          const [glyph, color] = !room ? ['  ', undefined]
            : i === run.cur ? ['◆ ', '#dad45e']
              : room.kind === 'boss' ? ['☠ ', '#d04648']
                : room.kind === 'treasure' ? ['★ ', '#dad45e']
                  : room.kind === 'shop' ? ['$ ', '#6dc2ca']
                    : room.kind === 'session' ? ['⚡', '#d27d2c']
                      : room.isVisited ? ['■ ', '#8595a1'] : ['□ ', '#4e4a4e']
          cells.push(<Text key={`m${x},${y}`} color={color}>{glyph}</Text>)
        }
        rows.push(<Text key={`mr${y}`}>{cells}</Text>)
      }
      return <Box flexDirection="column" flexShrink={0}>{rows}</Box>
    }
    const focusLine = isFocused
      ? <Text color="#6daa2c" bold>🎮 Tu joues · Esc pour écrire à Claude <Text dimColor>· {BUILD}</Text></Text>
      : <Text color="#dad45e" bold>⌨  Claude a la main · ctrl+x tab (ou /clauwler) pour jouer</Text>
    const pad = (list: [string, string][]) => (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {list.map(([hotkey, label]) => <Button key={`p-${hotkey}`} plain hotkey={hotkey} label={label} dimColor={!isFocused} onPress={() => onKey($, hotkey)} />)}
      </Box>
    )

    perf.panes++
    if (g.mode === 'run' && g.run) {
      const run = g.run
      const rows = Math.max(8, Math.round(cols / 3.2))
      let arena = <Text dimColor>Le combat se joue dans le terminal.</Text>
      if (e.surface === 'terminal') {
        const { Image, Raster } = $.ui.resolve(e)
        if (gfx === 'image') {
          // The picture the loop last sent: a redraw of the pane (the HUD changing) sends nothing new.
          if (!frameB64) {
            renderFrame(live, viewOf(g), fineFrame)
            frameB64 = toBase64(encodeIndexedPng(fineFrame, FINE_SIZE.width, FINE_SIZE.height))
          }
          arena = <Image key="arena" source={{ png: frameB64 }} columns={cols} rows={Math.max(8, Math.round((cols * FINE_SIZE.height) / FINE_SIZE.width / 2))} alt="Pas d'image dans ce terminal." />
        } else {
          const spare = (e.viewport?.rows ?? 40) - 16
          if (gfx === 'quads') {
            // Two pixels a column, four a row: the whole room in 80 columns.
            arenaCols = Math.min(cols, FW / 2)
            arenaRows = Math.max(10, Math.min(FH / 4, spare))
          } else {
            // One pixel a half block: zoomed on the champion.
            arenaCols = Math.min(cols, FW)
            arenaRows = Math.max(16, Math.min(FH / 2, spare))
          }
          const size = `${gfx}:${arenaCols}x${arenaRows}`
          if (!cellsB64 || size !== cellsSize) {
            cellsSize = size
            renderFrame(live, viewOf(g), frame)
            cellsB64 = encodeCells()
          }
          arena = <Raster key="arena" columns={arenaCols} rows={arenaRows} cells={cellsB64} />
        }
      }
      const hud = await read($, hudAtom)
      const bar = (part: number, n: number) => {
        const full = Math.max(0, Math.min(n, Math.round(part * n)))
        return '█'.repeat(full) + '░'.repeat(n - full)
      }
      const status = g.isPaused
        ? <Text bold color="#dad45e">⏸ PAUSE · une touche pour reprendre</Text>
        : run.offer
          ? <Text bold color="#dad45e">✦ Choisis un bienfait : 1, 2 ou 3</Text>
          : hud?.banner
            ? <Text bold color="#dad45e">{hud.banner}</Text>
            : <Text> </Text>
      return (
        <Box flexDirection="column">
          {header}
          <Text dimColor wrap="truncate-end">Étage {run.biome + 1}/{BIOMES} {run.biomeName} · « {roomName(run)} »</Text>
          {hud && (
            <Text wrap="truncate-end">
              <Text color="#d04648">♥ {bar(hud.hp / Math.max(1, hud.maxHp), 12)}</Text>
              <Text bold> {hud.hp}/{hud.maxHp}</Text>
              <Text color="#6dc2ca">   ◆ {run.eclats}</Text>
              <Text color="#597dce">   R pouvoir {'▮'.repeat(hud.ammo)}{'▯'.repeat(Math.max(0, hud.maxAmmo - hud.ammo))}</Text>
              <Text color={hud.isDashReady ? '#6dc2ca' : '#4e4a4e'}>   E esquive {hud.isDashReady ? '●' : '○'}</Text>
              <Text color="#dad45e">   ✦ {run.boons.length}</Text>
            </Text>
          )}
          {hud?.boss && <Text color="#d04648" bold wrap="truncate-end">☠ {hud.boss.name} {bar(hud.boss.pct / 100, 20)} {hud.boss.pct}%</Text>}
          {status}
          {arena}
          {focusLine}
          {run.offer ? null : pad([['z', '↑'], ['q', '←'], ['s', '↓'], ['d', '→'], ['e', 'esquive'], ['r', 'pouvoir'], ['p', 'pause'], ['h', 'camp']])}
          {run.offer ? (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="#dad45e">✦ Un dieu du dépôt t'offre un bienfait (1, 2 ou 3) :</Text>
              {run.offer.map((boon, i) => {
                const def = BOONS.find(one => one.id === boon.id)
                if (!def) return null
                const r = RARITY[boon.rarity] ?? RARITY[0]!
                const replaces = def.slot !== 'passive' ? run.boons.find(b => BOONS.find(one => one.id === b.id)?.slot === def.slot) : undefined
                const label = `[${r.label}] ${SLOT_LABEL[def.slot]} · ${def.god} — ${def.name} : ${def.desc(boonValue(def, boon.rarity))}${replaces ? ' (remplace l\'actuel)' : ''}`
                return <Button key={`o-${i}`} plain hotkey={String(i + 1)} label={label} onPress={press({ k: 'pick', i })} />
              })}
            </Box>
          ) : (
            <Box flexDirection="row" marginTop={1} columnGap={2}>
              {minimap(run)}
              <Box flexDirection="column" flexShrink={1}>
                {run.log.slice(-4).map((line, i, all) => <Text key={`l${i}`} dimColor={i < all.length - 1} wrap="truncate-end">{line}</Text>)}
              </Box>
            </Box>
          )}
          {run.boons.length > 0 && (
            <Text dimColor wrap="truncate-end">Bienfaits : {run.boons.map(b => BOONS.find(one => one.id === b.id)?.name).join(' · ')}</Text>
          )}
        </Box>
      )
    }

    if (g.mode === 'epilogue') {
      return (
        <Box flexDirection="column" rowGap={1}>
          {header}
          <Box flexDirection="column">
            {g.epilogue.map((line, i) => <Text key={`ep${i}`} bold={i === 0} color={i === 0 ? '#dad45e' : undefined}>{line}</Text>)}
          </Box>
          {keys([['h', 'Retour au Hall', { k: 'mode', mode: 'hall' }]])}
          {focusLine}
        </Box>
      )
    }

    if (g.mode === 'mirror') {
      return (
        <Box flexDirection="column" rowGap={1}>
          {header}
          <Text bold>🪞 Le Miroir de la Lignée <Text color="#6dc2ca">◆ {g.lineage.eclats}</Text></Text>
          <Box flexDirection="column">
            {MIRROR.map((def, i) => {
              const rank = g.lineage.mirror[def.id] ?? 0
              const cost = def.costs[rank]
              return <Button key={`m-${def.id}`} plain hotkey={String(i + 1)} dimColor={cost === undefined || cost > g.lineage.eclats} label={`${def.name} ${'●'.repeat(rank)}${'○'.repeat(def.costs.length - rank)}  ${def.desc}  ${cost === undefined ? '(max)' : `◆${cost}`}`} onPress={press({ k: 'buy', id: def.id })} />
            })}
          </Box>
          {keys([['b', 'Retour', { k: 'mode', mode: 'hall' }]])}
          {focusLine}
        </Box>
      )
    }

    if (g.mode === 'armory') {
      return (
        <Box flexDirection="column" rowGap={1}>
          {header}
          <Text bold>⚔ L'Arsenal <Text color="#6dc2ca">◆ {g.lineage.eclats}</Text></Text>
          <Box flexDirection="column">
            {WEAPONS.map((w, i) => {
              const owned = g.lineage.weapons.includes(w.id)
              const isOn = g.lineage.weapon === w.id
              return <Button key={`w-${w.id}`} plain hotkey={String(i + 1)} dimColor={!owned && w.cost > g.lineage.eclats} label={`${isOn ? '■' : owned ? '□' : '🔒'} ${w.title} « ${w.name} » — attaque : ${w.attack} · spécial : ${w.special}${owned ? '' : `  ◆${w.cost}`}`} onPress={press({ k: 'weapon', id: w.id })} />
            })}
          </Box>
          {keys([['b', 'Retour', { k: 'mode', mode: 'hall' }]])}
          {focusLine}
        </Box>
      )
    }

    if (g.mode === 'vault') {
      const relics = g.lineage.vault.slice(-9)
      return (
        <Box flexDirection="column" rowGap={1}>
          {header}
          <Text bold>⚒ Le Coffre des Reliques <Text dimColor>({c.equipped.length}/{RELIC_SLOTS(c.level)} équipées)</Text></Text>
          <Box flexDirection="column">
            {relics.length === 0 && <Text dimColor>Aucune relique. Elles naissent des commits (3 sceaux), des gardiens et des Némésis.</Text>}
            {relics.map((relic, i) => {
              const isOn = c.equipped.includes(relic.id)
              return <Button key={`v-${relic.id}`} plain hotkey={String(i + 1)} dimColor={!isOn} label={`${isOn ? '■' : '□'} ${relic.name} — ${relicLabel(relic.effect, relic.value)} · ${relic.origin}`} onPress={press({ k: 'equip', relicId: relic.id })} />
            })}
          </Box>
          {keys([['b', 'Retour', { k: 'mode', mode: 'hall' }]])}
          {focusLine}
        </Box>
      )
    }

    if (g.mode === 'chronicle') {
      return (
        <Box flexDirection="column" rowGap={1}>
          {header}
          <Text bold>📖 Chronique de la Lignée</Text>
          <Box flexDirection="column">
            {g.lineage.chronicle.length === 0 && <Text dimColor>Rien encore. L'histoire commence.</Text>}
            {g.lineage.chronicle.slice(-12).reverse().map((entry, i) => <Text key={`c${i}`}><Text dimColor>{entry.at.slice(5, 10)} {entry.repo} · </Text>{entry.text}</Text>)}
          </Box>
          {keys([['b', 'Retour', { k: 'mode', mode: 'hall' }]])}
          {focusLine}
        </Box>
      )
    }

    const f = g.feed
    const s = combatStats({ ...g, run: null })
    const camp = g.run
    const weapon = WEAPONS.find(w => w.id === g.lineage.weapon)
    let splash = null
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      const sc = Math.min(cols, FW)
      const sr = 9
      renderFrame(null, { ...viewOf(g), vw: sc, vh: sr * 2, hint: '' }, frame)
      splash = <Raster key="splash" columns={sc} rows={sr} cells={toBase64(toCells(frame, sc, sr))} />
    }
    return (
      <Box flexDirection="column" rowGap={1}>
        {header}
        {splash}
        <Box flexDirection="column">
          <Text bold>🏰 Le Hall des Ancêtres</Text>
          <Text>{CLASSES[c.cls].label} ({CLASSES[c.cls].stack}, {CLASSES[c.cls].perk}) · PV {s.maxHp} · dégâts ×{s.dmg.toFixed(2)} · XP {c.xp}/{xpToLevel(c.level)}</Text>
          <Text>Arme : {weapon?.title} « {weapon?.name} » · <Text color="#6dc2ca">◆ {g.lineage.eclats} éclats</Text> · {c.runs} expéditions · {c.victories} victoires · {c.deaths} chutes</Text>
          {c.scars.length > 0 && <Text color="#d04648">Cicatrices : {c.scars.join(', ')}</Text>}
          {c.nemeses.map((n, i) => <Text key={`n${i}`} color="#c83ca0">☠ Némésis : {n.name} (rang {n.rank})</Text>)}
        </Box>
        <Box flexDirection="column">
          <Text dimColor>Cette session nourrit le donjon :</Text>
          <Text>📜 {f.reads} lectures · ✎ {f.edits} runes ({f.runeCharge}/{EDITS_PER_RUNE}) · ⚡ {f.fails} erreurs · $ {f.tests} tests verts</Text>
          <Text>🔏 sceaux {f.seals}/{SEALS_PER_RELIC} · ✧ {f.agents} sous-agents · ◎ {f.webs} recherches</Text>
          {(f.errorPool.length > 0 || f.runeOffers > 0 || f.chestPool > 0 || f.familiarPool > 0) && (
            <Text color="#d27d2c">En attente : {f.errorPool.length} monstres, {f.runeOffers} bienfaits, {f.chestPool} coffres, {f.familiarPool} familiers</Text>
          )}
        </Box>
        {g.notice.length > 0 && (
          <Box flexDirection="column">
            {g.notice.slice(-4).map((line, i) => <Text key={`no${i}`} color="#dad45e">{line}</Text>)}
          </Box>
        )}
        {camp && <Text color="#6daa2c">⛺ Campement : étage {camp.biome + 1}, « {roomName(camp)} » · PV {camp.hp} · ◆{camp.eclats} en jeu</Text>}
        {keys([
          ...(camp ? [['r', 'Reprendre le camp', { k: 'resume' }] as [string, string, MenuAction]] : []),
          ['n', camp ? 'Abandonner et repartir' : 'Nouvelle expédition', { k: 'newRun' }],
          ['a', 'Arsenal', { k: 'mode', mode: 'armory' }],
          ['m', 'Miroir', { k: 'mode', mode: 'mirror' }],
          ['v', 'Coffre', { k: 'mode', mode: 'vault' }],
          ['c', 'Chronique', { k: 'mode', mode: 'chronicle' }],
        ])}
          {focusLine}
      </Box>
    )
  })
}
