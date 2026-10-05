import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Champion, ClassId, Ctx, GameState, Hud, InputPost, Lineage, MenuAction, Save, SessionEvent } from '../types'
import { BOONS, CLASSES, MIRROR, RARITY, SLOT_LABEL, WEAPONS, boonValue, relicLabel } from './data'
import {
  BIOMES, EDITS_PER_RUNE, RELIC_SLOTS, SEALS_PER_RELIC, applyEvent, boot, championTitle,
  combatStats, commitMessage, endSession, isTestCommand, log, menu, onChest, onBuy, onCleared, onDeath, onDescend, onEnter,
  aspectsFor, buildSummary, offerTitle, onKill, onPortal, parseError, prepareRoom, roomName, saveKey, syncHp, toSave, xpToLevel,
} from './meta'
import type { View } from './render'
import { encodeIndexedPng } from './png'
import { frameSize, renderFrame, toCells, toQuads } from './render'
import type { Input, Live } from './sim'
import { FH, FW, ROOM, createRoom, doorAt, inject, step } from './sim'
import type { SessionNote } from './session'
import { COMMIT_ECLATS, TEST_HEAL, TEST_SHARDS, addEcho, echoName, isEcho, isLongWork, narratorLine, noteFor } from './session'
import type { Sfx } from './sound'
import { SIGNAL_SFX, gainOf, newMixer, pickSounds } from './sound'
import { getLang, langFromEnv, setLang, tr } from './i18n'

const PANE = 'clauwler'
/** Shown in the pane, so a reload can be told from a stale module. */
const BUILD = 'v2.0'
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
/**
 * How many times taller than wide a terminal cell is: the picture's rows are
 * worked out from it. Ghostty's default font and line height give about 2.15 (measured on a screenshot);
 * most other terminals sit near 2.2.
 */
let cellAspect = 2.2
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
/** Pictures a second, picked with V: the terminal, not the game, decides what it can show. */
const PICTURE_RATES = [24, 15, 10]
let pictureRate = 24
let PICTURE_MS = 1000 / 24 - 5
/**
 * When Claude Code itself is busy (a long answer streaming, a big tool result), the loop's
 * ticks come late: the pictures then drop to 12 a second for a while, so the game keeps
 * its pace instead of stuttering behind a queue of frames.
 */
const BUSY_PICTURE_MS = 1000 / 12 - 5
let busyUntil = 0
let lateAvg = 1 / 24
let lastPictureAt = 0
let wasFocused = false
let isLooping = false
let lastPaneCheck = 0
let inputInst = 0
let lastKeyId = 0
const held = { up: 0, down: 0, left: 0, right: 0 }
const lastPress: Partial<Record<keyof typeof held, number>> = {}
const repeating: Partial<Record<keyof typeof held, boolean>> = {}
/** The keyboard's repeat, learned as keys arrive: macOS defaults sit near 375 ms, then 90 ms. */
let initialMs = 380
let repeatMs = 90
let keysSeen = 0
const aim = { up: 0, down: 0, left: 0, right: 0 }
const edges = { attack: false, special: false, cast: false, dash: false }

// ---------- sound ----------

/** Muted with X, kept in the store. */
let isMuted = false
/** Sounds asked for since the last flush: the sim's own (`live.sfx`) join them there. */
let pendingSfx: string[] = []
const mixer = newMixer()
/** Plays that failed in a row: a terminal with no player stops being asked. */
let audioFails = 0

function queueSfx(name: Sfx | string | undefined) {
  if (!name) return
  pendingSfx.push(name)
  if (pendingSfx.length > 12) pendingSfx = pendingSfx.slice(-12)
}

/** Starts the waiting sounds without waiting on them: never in the loop's way. */
function flushSfx($: EngineInterface, t: number, isHeard: boolean) {
  const own = (live as unknown as { sfx?: string[] } | null)?.sfx
  if (Array.isArray(own) && own.length > 0) {
    pendingSfx.push(...own)
    own.length = 0
  }
  if (pendingSfx.length === 0) return
  const names = pendingSfx
  pendingSfx = []
  if (isMuted || !isHeard || audioFails >= 3) return
  for (const name of pickSounds(mixer, names, t)) {
    try {
      void $.audio.play({ asset: `assets/sfx/${name}.wav` }, { gain: gainOf(name) }).then(() => { audioFails = 0 }, () => { audioFails += 1 })
    } catch {
      audioFails += 1
    }
  }
}

/** What the last tick saw, for a sim that does not name its own sounds (no `live.sfx`). */
const seen = { room: null as Live | null, hp: 0, isDashing: false, foeHp: 0, foes: 0, shot: 0, isBoss: false, bossPart: 1 }

/** Hears the fight from the outside: hurt, dash, hits, shots, the guardian's entrance. */
function listen(l: Live) {
  if (Array.isArray((l as unknown as { sfx?: unknown }).sfx)) return
  const p = l.player
  let foeHp = 0
  let isBoss = false
  let bossPart = 1
  for (const e of l.enemies) {
    if (e.state === 'spawn') continue
    foeHp += e.hp
    if (e.type === 'boss') {
      isBoss = true
      bossPart = e.hp / Math.max(1, e.maxHp)
    }
  }
  let shot = 0
  for (const pr of l.projs) if (pr.team === 'p' && pr.id > shot) shot = pr.id
  if (seen.room === l) {
    if (p.hp < seen.hp - 0.5) queueSfx(p.hp <= 0 ? 'death' : 'hurt')
    if (p.dashT > 0 && !seen.isDashing) queueSfx('dash')
    if (shot > seen.shot) queueSfx('shoot')
    // Fewer foes standing: the kill signal sounds it; less health on the same foes: a hit.
    if (foeHp < seen.foeHp - 0.5 && l.enemies.length >= seen.foes) queueSfx('hit')
    if (isBoss && !seen.isBoss) queueSfx('boss')
    // The guardian past half its health changes its ways.
    if (isBoss && seen.bossPart > 0.5 && bossPart <= 0.5) queueSfx('phase')
  }
  Object.assign(seen, { room: l, hp: p.hp, isDashing: p.dashT > 0, foeHp, foes: l.enemies.length, shot, isBoss, bossPart })
}

// ---------- the session, as the pane tells it ----------

/** The last session event and what it did in the game. */
let sessionNote: SessionNote | null = null
/** Claude's main-loop work since the last Écho de session, in ms. */
let workMs = 0

/** Rarity colors, Commun to the rarest the data may add. */
const RARITY_COLORS = ['#deeed6', '#597dce', '#c83ca0', '#d27d2c', '#dad45e']
const rarityColor = (r: number) => RARITY_COLORS[Math.max(0, Math.min(RARITY_COLORS.length - 1, r))]!

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
  if (!repo) return { ctx: { repoKey: 'wild', repoName: tr('Terres sauvages', 'Wildlands'), branch: '-', isWild: true }, cls: 'vagabond', root: await $.session.root() }
  let key = normalizeRemote(repo.remote)
  if (!key) {
    const first = await git($, repo.root, ['rev-list', '--max-parents=0', 'HEAD'])
    key = first ? `local:${first.split('\n')[0]!.slice(0, 12)}` : `path:${repo.root}`
  }
  const repoName = (normalizeRemote(repo.remote) ?? repo.root).split('/').pop() || tr('dépôt', 'repo')
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
  if (before && g && relic && g.lineage.vault.length > before.lineage.vault.length) {
    $.ui.toast(tr(`⚒ Relique forgée : ${relic.name}`, `⚒ Relic forged: ${relic.name}`))
    queueSfx('seal')
  }
  if (before && g && g.champion.level > before.champion.level) queueSfx('levelup')
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

/** The language: the one picked in the Hall (kept in the store), else the environment's. */
async function loadLang($: EngineInterface) {
  const picked = await $.store.get('lang').catch(() => undefined)
  if (picked === 'fr' || picked === 'en') {
    setLang(picked)
    return
  }
  // A lineage begun before English existed was played in French: it stays French until L says otherwise.
  if (await $.store.get('lineage').catch(() => undefined)) {
    setLang('fr')
    await $.store.set('lang', 'fr')
    return
  }
  setLang(langFromEnv({
    LANGUAGE: await $.env.get('LANGUAGE').catch(() => undefined),
    LC_ALL: await $.env.get('LC_ALL').catch(() => undefined),
    LC_MESSAGES: await $.env.get('LC_MESSAGES').catch(() => undefined),
    LANG: await $.env.get('LANG').catch(() => undefined),
  }))
}

function ensureLoop($: EngineInterface) {
  if (isLooping) return
  isLooping = true
  $.clock.every(Math.round(1000 / FPS), () => void tick($))
}

async function start($: EngineInterface, isOpening: boolean) {
  ensureLoop($)
  await loadLang($)
  const sessionId = await $.session.id()
  const loaded = await loadContext($)
  root = loaded.root
  const home = await $.env.get('HOME').catch(() => undefined)
  if (home) perfPath = `${home}/Clauwler/.perf/${sessionId.slice(0, 8)}.log`
  // Real pixels wherever the terminal draws them, as Claude Code itself decides; a cell
  // mode picked with O or G holds for this session and in terminals without pictures.
  const saved = await $.store.get('gfx')
  isMuted = (await $.store.get('mute')) === true
  const term = (await $.env.get('TERM').catch(() => undefined)) ?? ''
  const program = (await $.env.get('TERM_PROGRAM').catch(() => undefined)) ?? ''
  const canPicture = term === 'xterm-ghostty' || term.includes('kitty') || /^(ghostty|WezTerm)$/i.test(program)
  if (!hasStarted) gfx = canPicture ? 'image' : saved === 'half' ? 'half' : 'quads'
  const savedRate = await $.store.get('pictureRate')
  if (typeof savedRate === 'number' && PICTURE_RATES.includes(savedRate)) {
    pictureRate = savedRate
    PICTURE_MS = 1000 / pictureRate - 5
  }
  cellAspect = /ghostty/i.test(program) || term === 'xterm-ghostty' ? 2.15 : 2.2
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
    hint: tr('une touche', 'any key'),
    scale: 1,
    hasPixelHud: false,
    hasWorldText: gfx !== 'quads',
    ...(gfx === 'half' ? { vw: arenaCols, vh: arenaRows * 2 } : gfx === 'quads' ? { vw: arenaCols * 2, vh: arenaRows * 4 } : { res: RES }),
  }
}

/** What the loop costs, written to .perf.log beside the mod every two seconds. */
let paneInfo = ''
let spareBelow = 0
const perf = { since: 0, lastT: 0, ticks: 0, tickGap: 0, blits: 0, render: 0, encode: 0, blit: 0, bytes: 0, panes: 0, lines: [] as string[] }

async function flushPerf($: EngineInterface, t: number) {
  const secs = (t - perf.since) / 1000
  const n = Math.max(1, perf.blits)
  perf.lines.push(`${new Date(t).toISOString().slice(11, 19)} ${gfx} ticks/s ${(perf.ticks / secs).toFixed(1)} maxGap ${perf.tickGap}ms pictures/s ${(perf.blits / secs).toFixed(1)} render ${(perf.render / n).toFixed(1)}ms encode ${(perf.encode / n).toFixed(1)}ms blit ${(perf.blit / n).toFixed(1)}ms ${Math.round(perf.bytes / n / 1024)}KB paneDraws/s ${(perf.panes / secs).toFixed(1)} keys/s ${(keysSeen / secs).toFixed(1)} repeat ${Math.round(initialMs)}/${Math.round(repeatMs)}ms ${paneInfo} ${BUILD}`)
  perf.lines = perf.lines.slice(-60)
  keysSeen = 0
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
      listen(live)
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
  // Heard only while the champion plays in the focused pane.
  flushSfx($, t, wasFocused && !mirror?.isPaused)
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
  // Busy only when the ticks keep coming late (a second's average), not on one late tick.
  lateAvg = lateAvg * 0.92 + dt * 0.08
  if (lateAvg > 0.06) busyUntil = t + 1500
  if (gfx === 'image' && t - lastPictureAt < Math.max(PICTURE_MS, t < busyUntil ? BUSY_PICTURE_MS : 0)) return
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
    queueSfx(SIGNAL_SFX[sig.k])
    const hp = Math.max(0, Math.round(live.player.hp))
    switch (sig.k) {
      case 'kill': await change($, g => onKill(g, sig, now())); break
      case 'chest': await change($, g => onChest(g, sig.n)); break
      case 'portal': await change($, g => onPortal(syncHp(g, hp, live?.player.defiance ?? 0))); break
      case 'log': await change($, g => log(g, sig.text)); break
      case 'revived': await change($, g => log(syncHp(g, hp, live?.player.defiance ?? 0), tr('✟ Défi de la mort : tu te relèves !', '✟ Death Defiance: you rise again!'))); break
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
  if (live && mirror?.run) $.ui.status(`⚔ ${mirror.champion.name} ${Math.ceil(live.player.hp)}/${live.stats.maxHp} ${tr('PV', 'HP')} · ◆${mirror.run.eclats}`)
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
  // A menu answers with a click, a chosen boon with a fanfare.
  queueSfx(a.k === 'pick' ? 'levelup' : a.k === 'newRun' || a.k === 'resume' ? 'door' : 'menu')
  flushSfx($, await $.clock.now(), true)
  const g = await change($, s => menu(s, a, now(), seed()))
  if (!g) return
  const isStarting = (a.k === 'newRun' || a.k === 'resume') && g.mode === 'run'
  if (isStarting && (a.k === 'newRun' || !live || before?.mode !== 'run')) await enterRoom($)
  lastInputAt = (await $.clock.now())
}

async function onKey($: EngineInterface, key: string) {
  await handleKey($, key)
  // A key means the pane is focused: menus are heard at once, outside the loop.
  if (mirror?.mode !== 'run' || mirror.run?.offer || !live) flushSfx($, await $.clock.now(), true)
}

async function handleKey($: EngineInterface, key: string) {
  const g = mirror
  if (!g) return
  const t = (await $.clock.now())
  lastInputAt = t
  if (key === 'x') {
    isMuted = !isMuted
    pendingSfx = []
    await $.store.set('mute', isMuted)
    if (!isMuted) {
      queueSfx('menu')
      flushSfx($, t, true)
    }
    await change($, s => ({ ...s }))
    return
  }
  if (key === 'v' && g.mode === 'run') {
    pictureRate = PICTURE_RATES[(PICTURE_RATES.indexOf(pictureRate) + 1) % PICTURE_RATES.length] ?? 24
    PICTURE_MS = 1000 / pictureRate - 5
    await $.store.set('pictureRate', pictureRate)
    await change($, s => ({ ...s }))
    return
  }
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
      // A terminal never says a key went up: a held key is the keyboard's repeat. The game learns
      // that rhythm (the delay before the first repeat, then the gap between repeats) and stops
      // the champion as soon as the repeats stop, instead of a fixed half second later.
      const gap = t - (lastPress[dir] ?? 0)
      lastPress[dir] = t
      const isRepeat = held[dir] > t && gap < 900
      if (isRepeat) {
        if (repeating[dir]) repeatMs = repeatMs * 0.8 + Math.min(200, Math.max(15, gap)) * 0.2
        else initialMs = initialMs * 0.7 + Math.min(800, Math.max(150, gap)) * 0.3
        repeating[dir] = true
      } else repeating[dir] = false
      held[dir] = t + (isRepeat ? repeatMs * 1.7 + 25 : initialMs + 50)
      held[OPPOSITE[dir]] = 0
      keysSeen++
      // A key that repeats keeps the other axis it was pressed with.
      if (isRepeat) for (const other of PERPENDICULAR[dir]) if (held[other] > t) held[other] = t + repeatMs * 1.7 + 25
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
  if (key === 'l') {
    // Outside a run L switches the language (in a run it fires right).
    setLang(getLang() === 'fr' ? 'en' : 'fr')
    await $.store.set('lang', getLang())
    queueSfx('menu')
    await change($, s => ({ ...s }))
    return
  }
  if (/^[1-9]$/.test(key)) {
    const i = Number(key) - 1
    if (g.mode === 'mirror' && MIRROR[i]) await play($, { k: 'buy', id: MIRROR[i]!.id })
    if (g.mode === 'armory' && i < 4 && WEAPONS[i]) await play($, { k: 'weapon', id: WEAPONS[i]!.id })
    if (g.mode === 'armory' && i >= 4) {
      const aspect = aspectsFor(g.lineage, g.lineage.weapon)[i - 4]
      if (aspect) await play($, { k: 'aspect', id: aspect.id })
    }
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
      if (ran.isError) return { kind: 'fail', ...(parseError(ran.text ?? '') ?? { sig: 'Error', name: tr('Error, la Bête Anonyme', 'Error, the Nameless Beast') }) }
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
  const isOpen = isLive && !!live && !live.isCleared
  const heal = live ? Math.max(3, Math.round(live.stats.maxHp * TEST_HEAL)) : 0
  await change($, g => {
    const next = applyEvent(g, ev, now(), isLive)
    const forged = next.lineage.vault.length > g.lineage.vault.length ? next.lineage.vault[next.lineage.vault.length - 1]?.name : undefined
    // A commit pays at once, beside its seal: the session gives, it never takes.
    if (ev.kind === 'commit' && isLive && next.run) next.run.eclats += COMMIT_ECLATS
    sessionNote = noteFor(ev, { isLive, isOpen, seals: next.feed.seals, relic: forged, heal })
    return next
  })
  if (!isLive || !live) return
  const before = live.enemies.length
  inject(live, ev)
  sessionLive(live, ev, before, heal, sessionNote)
}

/** What a session event looks like in the room being fought, beside what `inject` does. */
function sessionLive(l: Live, ev: SessionEvent, before: number, heal: number, note: SessionNote | null) {
  const p = l.player
  switch (ev.kind) {
    case 'fail': {
      const foe = l.enemies.length > before ? l.enemies[l.enemies.length - 1] : undefined
      if (!foe) return
      // The rift the error crawls out of.
      l.fx.push({ kind: 'ring', x: foe.x, y: foe.y, ttl: 0.9, max: 0.9, color: [200, 60, 160], r: 18 })
      l.fx.push({ kind: 'tele', x: foe.x, y: foe.y, r: 12, ttl: 0.7, max: 0.7, color: [200, 60, 160] })
      l.banner = { text: tr(`Faille : ${ev.sig}`, `Rift: ${ev.sig}`), ttl: 1.8 }
      l.shake = Math.max(l.shake, 0.25)
      queueSfx('rift')
      break
    }
    case 'test': {
      p.hp = Math.min(l.stats.maxHp, p.hp + heal)
      l.fx.push({ kind: 'num', x: p.x, y: p.y - 12, ttl: 1, max: 1, color: [109, 170, 44], text: `+${heal}` })
      l.fx.push({ kind: 'ring', x: p.x, y: p.y - 2, ttl: 0.5, max: 0.5, color: [109, 170, 44], r: 20 })
      for (let i = 0; i < TEST_SHARDS; i++) {
        const a = (i / TEST_SHARDS) * Math.PI * 2 + 0.4
        const x = Math.round(Math.min(ROOM.x1 - 6, Math.max(ROOM.x0 + 6, p.x + Math.cos(a) * 14)))
        const y = Math.round(Math.min(ROOM.y1 - 6, Math.max(ROOM.y0 + 6, p.y + Math.sin(a) * 10)))
        l.pickups.push({ x, y, kind: 'shard', t: 0 })
      }
      l.banner = { text: tr('Tests verts !', 'Tests green!'), ttl: 1.4 }
      queueSfx('heal')
      break
    }
    case 'commit':
      l.fx.push({ kind: 'num', x: p.x, y: p.y - 12, ttl: 1.1, max: 1.1, color: [109, 194, 202], text: `+${COMMIT_ECLATS}` })
      l.fx.push({ kind: 'ring', x: p.x, y: p.y - 2, ttl: 0.6, max: 0.6, color: [218, 212, 94], r: 24 })
      l.banner = { text: /^reli/i.test(note?.effect ?? '') ? tr('Relique forgée !', 'Relic forged!') : `${tr('Sceau de commit', 'Commit seal')} ${note?.effect.match(/\d\/\d/)?.[0] ?? ''}`.trim(), ttl: 1.6 }
      queueSfx('seal')
      break
    case 'agent':
    case 'web':
      queueSfx('boon')
      break
    case 'compact':
      queueSfx('explode')
      break
    default:
      break
  }
}

/** Claude ended a main-loop turn: the Narrator speaks, the champion gets a breath; long work opens an Écho. */
async function onTurn($: EngineInterface, durationMs: number, turnId: string) {
  const g = mirror
  if (!g) return
  workMs += Math.max(0, durationMs)
  const line = narratorLine(hashText(turnId))
  const isLive = live !== null && g.mode === 'run' && !!g.run
  if (isLive && live) {
    const s = live.stats
    const heal = Math.max(2, Math.round(s.maxHp * 0.05))
    live.ammo = s.castAmmo
    live.player.hp = Math.min(s.maxHp, live.player.hp + heal)
    live.fx.push({ kind: 'num', x: live.player.x, y: live.player.y - 12, ttl: 0.9, max: 0.9, color: [218, 212, 94], text: `+${heal}` })
    sessionNote = { icon: '✒', what: tr('Claude a fini son tour', 'Claude finished its turn'), effect: tr(`pouvoir rechargé, +${heal} PV`, `power recharged, +${heal} HP`), color: '#dad45e' }
    await change($, s0 => log(s0, tr(`✒ Le Narrateur : ${line}`, `✒ The Narrator: ${line}`)))
    queueSfx('narrator')
  } else {
    sessionNote = { icon: '✒', what: tr('Claude a fini son tour', 'Claude finished its turn'), effect: line, color: '#dad45e' }
  }
  if (!isLongWork(durationMs, workMs)) {
    if (!isLive) await change($, s0 => ({ ...s0 }))
    return
  }
  workMs = 0
  let placed: ReturnType<typeof addEcho> = null
  await change($, s0 => {
    if (!s0.run) {
      // No run: the long work waits as a boon for the next descent.
      sessionNote = { icon: '✧', what: tr('longue session de Claude', 'long Claude session'), effect: tr('un bienfait t\'attend à la prochaine expédition', 'a boon awaits you on your next run'), color: '#c83ca0' }
      return { ...s0, feed: { ...s0.feed, runeOffers: s0.feed.runeOffers + 1 } }
    }
    placed = addEcho(s0)
    if (placed) sessionNote = { icon: '✧', what: tr('longue session de Claude', 'long Claude session'), effect: tr(`un ${echoName()} apparaît sur la carte (autel à bienfait)`, `a ${echoName()} appears on the map (boon altar)`), color: '#c83ca0' }
    return placed?.g ?? s0
  })
  const echo = placed as ReturnType<typeof addEcho>
  if (echo && live && mirror?.run && echo.at === mirror.run.cur) {
    live.doors.push({ side: echo.side, to: echo.to, kind: 'treasure', ...doorAt(echo.side) })
    live.banner = { text: tr('Un écho de session s\'ouvre', 'A session echo opens'), ttl: 1.8 }
  }
  if (echo) queueSfx('boon')
}

function hashText(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

// ---------- the hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadLang($)
    await $.command.register({ name: 'clauwler', description: tr('Ouvre le donjon de Clauwler dans un panneau', 'Opens the Clauwler dungeon in a pane') })
    await start($, true)
    return next(e)
  })

  on('command.run', { command: 'clauwler' }, async $ => {
    if (!mirror) await start($, false)
    // Straight into the dungeon, as Isaac does: the camp if there is one, else a new descent.
    if (mirror && mirror.mode !== 'run') await play($, mirror.run ? { k: 'resume' } : { k: 'newRun' })
    else if (mirror?.isPaused) await change($, g => ({ ...g, isPaused: false }))
    const opened = await $.ui.open({ id: PANE, title: 'Clauwler', focus: true, columns: 120 })
    return {
      text: opened.isPlaced
        ? tr('En jeu : ZQSD bouger (tu frappes tout seul) · E esquive · R pouvoir · P pause · Esc rend la main à Claude.', 'In game: WASD to move (you strike on your own) · E dodge · R power · P pause · Esc hands back to Claude.')
        : tr("Le panneau n'a pas pu s'ouvrir ici.", "The pane couldn't open here."),
    }
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
    if (e.agentId !== undefined) return result
    if (mirror?.mode === 'run' && (await $.clock.now()) - lastInputAt < 4000) {
      $.ui.toast(tr('Claude a fini son tour. Esc pour lui répondre (le jeu se met en pause).', 'Claude finished its turn. Esc to answer (the game pauses).'))
    }
    try {
      if (e.reason === 'answer') await onTurn($, e.durationMs, e.turnId)
    } catch {
      // The game never gets in the way of the work.
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
    if (!g) return <Text dimColor>{tr('Le donjon se réveille…', 'The dungeon wakes…')}</Text>
    const c = g.champion
    const cols = Math.max(20, Math.min(e.props.bodyColumns, FW))
    const press = (a: MenuAction) => () => play($, a)

    const keys = (list: [string, string, MenuAction][]) => (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {list.map(([hotkey, label, a]) => <Button key={`k-${hotkey}`} plain hotkey={hotkey} label={label} onPress={press(a)} />)}
      </Box>
    )
    const header = (
      <Text bold color="#dad45e">⚔ {championTitle(c)} <Text dimColor>· {tr('niv', 'lv')} {c.level} · {g.ctx.repoName}{g.ctx.isWild ? '' : `@${g.ctx.branch}`}</Text></Text>
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
              : isEcho(room.name) ? ['✧ ', '#c83ca0']
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
      ? <Text color="#6daa2c" bold>{tr('🎮 Tu joues · Esc → Claude ', '🎮 You play · Esc → Claude ')}<Text dimColor>{BUILD}</Text></Text>
      : <Text color="#dad45e" bold>{tr('⌨  Claude a la main · ctrl+x tab (ou /clauwler) pour jouer', '⌨  Claude has the keys · ctrl+x tab (or /clauwler) to play')}</Text>
    const sessionLine = () => {
      const note = sessionNote
      return (
        <Text wrap="truncate-end">
          <Text dimColor>Session </Text>
          {note
            ? <Text color={note.color} bold>{note.icon} {note.what}</Text>
            : <Text color="#4e4a4e">{tr('⚡ en veille', '⚡ idle')}</Text>}
          <Text dimColor> → {note ? note.effect : tr('erreurs, tests et commits de Claude nourrissent le donjon', "Claude's errors, tests and commits feed the dungeon")}</Text>
        </Text>
      )
    }

    perf.panes++
    if (g.mode === 'run' && g.run) {
      const run = g.run
      const rows = Math.max(8, Math.round(cols / 3.2))
      let arena = <Text dimColor>{tr('Le combat se joue dans le terminal.', 'The fight plays in the terminal.')}</Text>
      if (e.surface === 'terminal') {
        const { Image, Raster } = $.ui.resolve(e)
        if (gfx === 'image') {
          // The picture the loop last sent: a redraw of the pane (the HUD changing) sends nothing new.
          if (!frameB64) {
            renderFrame(live, viewOf(g), fineFrame)
            frameB64 = toBase64(encodeIndexedPng(fineFrame, FINE_SIZE.width, FINE_SIZE.height))
          }
          // As large as the pane allows: its width, or the rows left once the four text lines are drawn.
          // The pane's scroll window follows its content, so it cannot tell how much room is
          // left: the terminal's height (less the pane's frame) can.
          const scrollRows = (e.props as { scroll?: { bodyRows?: number } }).scroll?.bodyRows ?? 0
          const bodyRows = scrollRows > 0 ? scrollRows : (e.viewport?.rows ?? 40) - 3
          const spareRows = Math.max(8, bodyRows - (g.isPaused || run.offer ? 12 : 4))
          const fitCols = Math.min(e.props.bodyColumns, Math.floor((spareRows * cellAspect * FINE_SIZE.width) / FINE_SIZE.height))
          const fitRows = Math.max(8, Math.round((fitCols * FINE_SIZE.height) / FINE_SIZE.width / cellAspect))
          // Rows the arena leaves free: the map and the log fill them when there are enough.
          spareBelow = bodyRows - fitRows - 4
          paneInfo = `arena ${fitCols}x${fitRows} pane ${e.props.placement} body ${e.props.bodyColumns}x${scrollRows} viewport ${e.viewport?.columns}x${e.viewport?.rows}`
          arena = <Box justifyContent="center"><Image key="arena" source={{ png: frameB64 }} columns={fitCols} rows={fitRows} alt={tr("Pas d'image dans ce terminal.", 'No pictures in this terminal.')} /></Box>
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
      const top = g.isPaused
        ? <Text bold color="#dad45e">{tr('⏸ PAUSE · une touche pour reprendre', '⏸ PAUSE · any key to resume')}</Text>
        : run.offer
          ? <Text bold color="#dad45e">{tr('✦ Choisis : ', '✦ Choose: ')}{run.offer.map((_, i) => i + 1).join(', ')}</Text>
          : hud?.boss
            ? <Text color="#d04648" bold wrap="truncate-end">☠ {hud.boss.name} {bar(hud.boss.pct / 100, 16)} {hud.boss.pct}%{hud.banner ? <Text color="#dad45e"> · {hud.banner}</Text> : null}</Text>
            : hud?.banner
              ? <Text bold color="#dad45e" wrap="truncate-end">{hud.banner}</Text>
              : <Text> </Text>
      const shield = Math.floor(live?.effects?.shield ?? 0)
      // QWERTY players get WASD in English; ZQSD stays the French pad (both always move).
      const isEn = getLang() === 'en'
      const runPad: [string, string][] = [
        [isEn ? 'w' : 'z', '↑'], [isEn ? 'a' : 'q', '←'], ['s', '↓'], ['d', '→'],
        ['e', tr('esquive', 'dodge')], ['r', tr('pouvoir', 'power')], ['p', 'pause'], ['h', 'camp'], ['x', tr('son', 'sound')],
        ['v', tr(`${pictureRate} i/s`, `${pictureRate} fps`)],
      ]
      return (
        <Box flexDirection="column">
          {hud ? (
            <Text wrap="truncate-end">
              <Text color="#d04648">♥ {bar(hud.hp / Math.max(1, hud.maxHp), 10)}</Text>
              <Text bold> {hud.hp}/{hud.maxHp}</Text>
              {shield > 0 ? <Text color="#8595a1"> ⛨ {shield}</Text> : null}
              <Text color="#6dc2ca">  ◆ {run.eclats}</Text>
              <Text color="#597dce">  R {'▮'.repeat(hud.ammo)}{'▯'.repeat(Math.max(0, hud.maxAmmo - hud.ammo))}</Text>
              <Text color={hud.isDashReady ? '#6dc2ca' : '#4e4a4e'}>  E {hud.isDashReady ? '●' : '○'}</Text>
              <Text color="#dad45e">  ✦ {run.boons.length}</Text>
              <Text dimColor>  {tr('Étage', 'Floor')} {run.biome + 1}/{BIOMES} · {tr(`« ${roomName(run)} »`, `“${roomName(run)}”`)}</Text>
            </Text>
          ) : <Text dimColor>⚔ {championTitle(c)} · {tr('Étage', 'Floor')} {run.biome + 1}/{BIOMES} {run.biomeName}</Text>}
          {top}
          {arena}
          {sessionLine()}
          <Box flexDirection="row" columnGap={1}>
            {isFocused ? <Text color="#6daa2c" bold>🎮</Text> : <Text color="#dad45e" bold wrap="truncate-end">⌨ ctrl+x tab</Text>}
            {run.offer ? null : runPad.map(([hotkey, label]) => <Button key={`p-${hotkey}`} plain hotkey={hotkey} label={label} dimColor={!isFocused} onPress={() => onKey($, hotkey)} />)}
            {isMuted ? <Text dimColor>🔇</Text> : null}
          </Box>
          {run.offer ? (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="#dad45e" wrap="truncate-end">{offerTitle(run)}</Text>
              {run.offer.map((boon, i) => {
                const def = BOONS.find(one => one.id === boon.id)
                if (!def) return <Button key={`o-${i}`} plain hotkey={String(i + 1)} label={boon.id} onPress={press({ k: 'pick', i })} />
                const r = RARITY[boon.rarity] ?? RARITY[0]!
                const held = run.boons.find(b => b.id === def.id)
                const replaced = !held && !def.isItem && def.slot !== 'passive' && (def.slot as string) !== 'item'
                  ? run.boons.map(b => BOONS.find(one => one.id === b.id)).find(one => one && !one.duo && one.slot === def.slot)
                  : undefined
                const owned = def.isItem ? (run.items ?? []).filter(id => id === def.id).length : 0
                const badge = def.isItem ? tr('OBJET', 'ITEM') : def.duo ? 'DUO' : r.label
                const badgeColor = def.isItem ? '#d2aa99' : def.duo ? '#c83ca0' : rarityColor(boon.rarity)
                const kind = def.isItem ? tr('objet, se cumule', 'item, stacks') : def.duo ? `${def.duo[0]} + ${def.duo[1]}` : `${SLOT_LABEL[def.slot] ?? def.slot} · ${def.god}`
                return (
                  <Box key={`or-${i}`} flexDirection="column">
                    <Box flexDirection="row" columnGap={1}>
                      <Button key={`o-${i}`} plain hotkey={String(i + 1)} label={def.name} onPress={press({ k: 'pick', i })} />
                      <Text color={badgeColor} bold>{def.duo ? '⚭ ' : def.isItem ? '★ ' : ''}{badge}</Text>
                      <Text dimColor wrap="truncate-end">{kind}</Text>
                    </Box>
                    <Text wrap="truncate-end">
                      <Text>   {def.desc(boonValue(def, boon.rarity, boon.level))}</Text>
                      {held ? <Text color="#6daa2c"> · {tr('niveau', 'level')} {boon.level ?? (held.level ?? 1) + 1}</Text> : null}
                      {replaced ? <Text color="#d27d2c"> · {tr('remplace', 'replaces')} {replaced.name}</Text> : null}
                      {owned > 0 ? <Text color="#6daa2c"> · {tr("tu l'as", 'you have')} ×{owned}</Text> : null}
                    </Text>
                  </Box>
                )
              })}
            </Box>
          ) : !g.isPaused && spareBelow < 5 ? null : (
            <Box flexDirection="row" columnGap={2} marginTop={1}>
              {minimap(run)}
              <Box flexDirection="column" flexShrink={1}>
                {run.log.slice(-3).map((line, i, all) => <Text key={`l${i}`} dimColor={i < all.length - 1} wrap="truncate-end">{line}</Text>)}
              </Box>
            </Box>
          )}
          {g.isPaused && <Text dimColor wrap="truncate-end">⚔ {championTitle(c)} · {tr('niv', 'lv')} {c.level} · {run.biomeName} · {BUILD}</Text>}
          {g.isPaused && run.boons.length > 0 && (
            <Text wrap="truncate-end">
              <Text dimColor>{tr('Bienfaits ', 'Boons ')}</Text>
              {run.boons.map((b, i) => {
                const def = BOONS.find(one => one.id === b.id)
                return <Text key={`b${i}`} color={def?.duo ? '#c83ca0' : rarityColor(b.rarity)}>{i > 0 ? ' · ' : ''}{def?.name ?? b.id}{(b.level ?? 1) > 1 ? ` ${b.level}` : ''}</Text>
              })}
            </Text>
          )}
          {g.isPaused && (run.items ?? []).length > 0 && <Text color="#d2aa99" wrap="truncate-end">{buildSummary(run).split('   ').find(part => part.startsWith('Objets') || part.startsWith('Items')) ?? ''}</Text>}
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
          {keys([['h', tr('Retour au Hall', 'Back to the Hall'), { k: 'mode', mode: 'hall' }]])}
          {focusLine}
        </Box>
      )
    }

    if (g.mode === 'mirror') {
      return (
        <Box flexDirection="column" rowGap={1}>
          {header}
          <Text bold>{tr('🪞 Le Miroir de la Lignée ', '🪞 The Mirror of the Lineage ')}<Text color="#6dc2ca">◆ {g.lineage.eclats}</Text></Text>
          <Box flexDirection="column">
            {MIRROR.map((def, i) => {
              const rank = g.lineage.mirror[def.id] ?? 0
              const cost = def.costs[rank]
              return <Button key={`m-${def.id}`} plain hotkey={String(i + 1)} dimColor={cost === undefined || cost > g.lineage.eclats} label={`${def.name} ${'●'.repeat(rank)}${'○'.repeat(def.costs.length - rank)}  ${def.desc}  ${cost === undefined ? '(max)' : `◆${cost}`}`} onPress={press({ k: 'buy', id: def.id })} />
            })}
          </Box>
          {keys([['b', tr('Retour', 'Back'), { k: 'mode', mode: 'hall' }]])}
          {focusLine}
        </Box>
      )
    }

    if (g.mode === 'armory') {
      return (
        <Box flexDirection="column" rowGap={1}>
          {header}
          <Text bold>{tr("⚔ L'Arsenal ", '⚔ The Arsenal ')}<Text color="#6dc2ca">◆ {g.lineage.eclats}</Text></Text>
          <Box flexDirection="column">
            {WEAPONS.map((w, i) => {
              const owned = g.lineage.weapons.includes(w.id)
              const isOn = g.lineage.weapon === w.id
              return <Button key={`w-${w.id}`} plain hotkey={String(i + 1)} dimColor={!owned && w.cost > g.lineage.eclats} label={`${isOn ? '■' : owned ? '□' : '🔒'} ${w.title} ${tr(`« ${w.name} » — attaque : ${w.attack} · spécial : ${w.special}`, `“${w.name}” — attack: ${w.attack} · special: ${w.special}`)}${owned ? '' : `  ◆${w.cost}`}`} onPress={press({ k: 'weapon', id: w.id })} />
            })}
          </Box>
          {aspectsFor(g.lineage, g.lineage.weapon).length > 0 && (
            <Box flexDirection="column">
              <Text bold>{tr("Aspects de l'arme portée", 'Aspects of the wielded weapon')}</Text>
              {aspectsFor(g.lineage, g.lineage.weapon).slice(0, 2).map((a, i) => (
                <Button key={`as-${a.id}`} plain hotkey={String(i + 5)} dimColor={!a.isOwned && a.cost > g.lineage.eclats} label={a.label} onPress={press({ k: 'aspect', id: a.id })} />
              ))}
            </Box>
          )}
          {keys([['b', tr('Retour', 'Back'), { k: 'mode', mode: 'hall' }]])}
          {focusLine}
        </Box>
      )
    }

    if (g.mode === 'vault') {
      const relics = g.lineage.vault.slice(-9)
      return (
        <Box flexDirection="column" rowGap={1}>
          {header}
          <Text bold>{tr('⚒ Le Coffre des Reliques ', '⚒ The Relic Vault ')}<Text dimColor>({c.equipped.length}/{RELIC_SLOTS(c.level)} {tr('équipées', 'equipped')})</Text></Text>
          <Box flexDirection="column">
            {relics.length === 0 && <Text dimColor>{tr('Aucune relique. Elles naissent des commits (3 sceaux), des gardiens et des Némésis.', 'No relics yet. They are born of commits (3 seals), guardians and Nemeses.')}</Text>}
            {relics.map((relic, i) => {
              const isOn = c.equipped.includes(relic.id)
              return <Button key={`v-${relic.id}`} plain hotkey={String(i + 1)} dimColor={!isOn} label={`${isOn ? '■' : '□'} ${relic.name} — ${relicLabel(relic.effect, relic.value)} · ${relic.origin}`} onPress={press({ k: 'equip', relicId: relic.id })} />
            })}
          </Box>
          {keys([['b', tr('Retour', 'Back'), { k: 'mode', mode: 'hall' }]])}
          {focusLine}
        </Box>
      )
    }

    if (g.mode === 'chronicle') {
      return (
        <Box flexDirection="column" rowGap={1}>
          {header}
          <Text bold>{tr('📖 Chronique de la Lignée', '📖 Chronicle of the Lineage')}</Text>
          <Box flexDirection="column">
            {g.lineage.chronicle.length === 0 && <Text dimColor>{tr("Rien encore. L'histoire commence.", 'Nothing yet. The story begins.')}</Text>}
            {g.lineage.chronicle.slice(-12).reverse().map((entry, i) => <Text key={`c${i}`}><Text dimColor>{entry.at.slice(5, 10)} {entry.repo} · </Text>{entry.text}</Text>)}
          </Box>
          {keys([['b', tr('Retour', 'Back'), { k: 'mode', mode: 'hall' }]])}
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
          <Text bold>{tr('🏰 Le Hall des Ancêtres', '🏰 The Hall of Ancestors')}</Text>
          <Text>{CLASSES[c.cls].label} ({CLASSES[c.cls].stack}, {CLASSES[c.cls].perk}) · {tr('PV', 'HP')} {s.maxHp} · {tr('dégâts', 'damage')} ×{s.dmg.toFixed(2)} · XP {c.xp}/{xpToLevel(c.level)}</Text>
          <Text>{tr('Arme : ', 'Weapon: ')}{weapon?.title} {tr(`« ${weapon?.name} »`, `“${weapon?.name}”`)} · <Text color="#6dc2ca">◆ {g.lineage.eclats} {tr('éclats', 'shards')}</Text> · {c.runs} {tr('expéditions', 'runs')} · {c.victories} {tr('victoires', 'victories')} · {c.deaths} {tr('chutes', 'falls')}</Text>
          {c.scars.length > 0 && <Text color="#d04648">{tr('Cicatrices : ', 'Scars: ')}{c.scars.join(', ')}</Text>}
          {c.nemeses.map((n, i) => <Text key={`n${i}`} color="#c83ca0">{tr(`☠ Némésis : ${n.name} (rang ${n.rank})`, `☠ Nemesis: ${n.name} (rank ${n.rank})`)}</Text>)}
        </Box>
        <Box flexDirection="column">
          <Text dimColor>{tr('Cette session nourrit le donjon :', 'This session feeds the dungeon:')}</Text>
          <Text>📜 {f.reads} {tr('lectures', 'reads')} · ✎ {f.edits} runes ({f.runeCharge}/{EDITS_PER_RUNE}) · ⚡ {f.fails} {tr('erreurs', 'errors')} · $ {f.tests} {tr('tests verts', 'green tests')}</Text>
          <Text>🔏 {tr('sceaux', 'seals')} {f.seals}/{SEALS_PER_RELIC} · ✧ {f.agents} {tr('sous-agents', 'subagents')} · ◎ {f.webs} {tr('recherches', 'searches')}</Text>
          {sessionLine()}
          {(f.errorPool.length > 0 || f.runeOffers > 0 || f.chestPool > 0 || f.familiarPool > 0) && (
            <Text color="#d27d2c">{tr(`En attente : ${f.errorPool.length} monstres, ${f.runeOffers} bienfaits, ${f.chestPool} coffres, ${f.familiarPool} familiers`, `Waiting: ${f.errorPool.length} monsters, ${f.runeOffers} boons, ${f.chestPool} chests, ${f.familiarPool} familiars`)}</Text>
          )}
        </Box>
        {g.notice.length > 0 && (
          <Box flexDirection="column">
            {g.notice.slice(-4).map((line, i) => <Text key={`no${i}`} color="#dad45e">{line}</Text>)}
          </Box>
        )}
        {camp && <Text color="#6daa2c">{tr(`⛺ Campement : étage ${camp.biome + 1}, « ${roomName(camp)} » · PV ${camp.hp} · ◆${camp.eclats} en jeu`, `⛺ Camp: floor ${camp.biome + 1}, “${roomName(camp)}” · HP ${camp.hp} · ◆${camp.eclats} at stake`)}</Text>}
        {keys([
          ...(camp ? [['r', tr('Reprendre le camp', 'Resume the camp'), { k: 'resume' }] as [string, string, MenuAction]] : []),
          ['n', camp ? tr('Abandonner et repartir', 'Abandon and start over') : tr('Nouvelle expédition', 'New run'), { k: 'newRun' }],
          ['a', 'Arsenal', { k: 'mode', mode: 'armory' }],
          ['m', tr('Miroir', 'Mirror'), { k: 'mode', mode: 'mirror' }],
          ['v', tr('Coffre', 'Vault'), { k: 'mode', mode: 'vault' }],
          ['c', tr('Chronique', 'Chronicle'), { k: 'mode', mode: 'chronicle' }],
        ])}
        <Box flexDirection="row" columnGap={2}>
          {focusLine}
          <Button key="k-x" plain hotkey="x" dimColor label={isMuted ? tr('son coupé 🔇', 'sound off 🔇') : tr('son 🔊', 'sound 🔊')} onPress={() => onKey($, 'x')} />
          <Button key="k-l" plain hotkey="l" dimColor label={tr('langue : FR', 'language: EN')} onPress={() => onKey($, 'l')} />
        </Box>
      </Box>
    )
  })
}
