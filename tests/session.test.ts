import { expect, test } from 'claude-code/testing'

import { startRun } from '../hooks/meta'
import { ECHO_NAME, addEcho, isLongWork, noteFor } from '../hooks/session'
import { admit, newMixer, pickSounds, sfxName } from '../hooks/sound'
import { NOW, fresh } from './driver'
import { boot, pane, sounds } from './harness'

test('the mixer keeps sounds sparse: no twin within 60 ms, six a second, the key ones always', () => {
  const m = newMixer()
  expect(admit(m, 'hit', 0)).toBe(true)
  expect(admit(m, 'hit', 30)).toBe(false)
  expect(admit(m, 'hit', 70)).toBe(false)
  expect(admit(m, 'hit', 130)).toBe(true)
  expect(admit(m, 'boon', 0)).toBe(true)
  expect(admit(m, 'boon', 70)).toBe(true)
  for (let i = 0; i < 4; i++) admit(m, 'shoot', 100 + i * 100)
  expect(admit(m, 'pickup', 600)).toBe(false)
  expect(admit(m, 'death', 610)).toBe(true)
  expect(sfxName('door-open')).toBe('door')
  expect(sfxName('nope')).toBe(null)
  expect(pickSounds(newMixer(), ['hit', 'hit', 'boss-appear', 'kill', 'shard'], 0)).toEqual(['boss', 'hit', 'kill'])
})

test('a long stretch of Claude work grafts one Écho de session onto the floor', () => {
  const g = startRun(fresh(), 3, NOW)
  const placed = addEcho(g)
  expect(placed).not.toBe(null)
  const run = placed!.g.run!
  const echo = run.floor[placed!.to]!
  expect(echo.name).toBe(ECHO_NAME)
  expect(echo.loot).toEqual(['altar'])
  const from = run.floor[placed!.at]!
  expect(Math.abs(from.x - echo.x) + Math.abs(from.y - echo.y)).toBe(1)
  expect(addEcho(placed!.g)).toBe(null)
  expect(isLongWork(70_000, 0)).toBe(true)
  expect(isLongWork(5_000, 10_000)).toBe(false)
})

test('the session line names the event and its reward, never a cost', () => {
  const fail = noteFor({ kind: 'fail', sig: 'TypeError', name: 'TypeError, le Spectre' }, { isLive: true, isOpen: true, seals: 0 })
  expect(fail.what).toBe('TypeError')
  expect(fail.effect).toContain('faille')
  expect(noteFor({ kind: 'commit', message: 'fix' }, { isLive: true, isOpen: true, seals: 2 }).effect).toContain('2/3')
  expect(noteFor({ kind: 'test' }, { isLive: true, isOpen: true, seals: 0, heal: 7 }).effect).toContain('+7 PV')
})

test('live: a failing command opens a rift, green tests heal, a commit pays, a turn recharges', async ($, on) => {
  let reply: { text: string; isError?: true } = { text: 'TypeError: Cannot read properties of undefined', isError: true }
  on('tool.call', () => ({ result: {}, ...reply }))
  on('turn.complete', () => ({ text: '' }))
  const clock = await boot($, on)
  const ui = await $.ui.mount({ plugin: 'clauwler', surface: 'terminal', ...pane(true) } as never) as any
  if (await ui.find({ key: 'o-0' })) await ui.press({ key: 'o-0' })
  await ui.press({ key: 'p-s' })
  await clock.advance(200)
  await $.tool.call({ tool: 'Bash', command: 'npm run build' } as never)
  await clock.advance(100)
  expect(await ui.find({ text: /Session/ })).toBeDefined()
  expect(await ui.find({ text: /TypeError/ })).toBeDefined()
  expect(await ui.find({ text: /faille|rôde/ })).toBeDefined()

  reply = { text: 'ok' }
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: la forge"' } as never)
  await clock.advance(100)
  expect(await ui.find({ text: /sceau 1\/3/ })).toBeDefined()

  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await clock.advance(100)
  expect(await ui.find({ text: /tests verts/ })).toBeDefined()

  await ($ as any).turn.complete({ answer: 'fini', durationMs: 90_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(100)
  expect(await ui.find({ text: /Écho de session|fini son tour/ })).toBeDefined()
  // The map, with the Écho on it, shows while paused.
  await ui.press({ key: 'p-p' })
  expect(await ui.find({ text: /✧/ })).toBeDefined()
  await ui.press({ key: 'p-p' })

  // Sounds: some played, and X mutes them.
  expect(sounds.length > 0).toBe(true)
  await ui.press({ key: 'p-x' })
  expect(await ui.find({ text: /🔇/ })).toBeDefined()
  const heard = sounds.length
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await clock.advance(300)
  expect(sounds.length).toBe(heard)
  await ui.unmount()
})

test('runes carved by Claude become a boon offer: name, rarity, god, description, keys 1 to 3', async ($, on) => {
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  await boot($, on)
  const ui = await $.ui.mount({ plugin: 'clauwler', surface: 'terminal', ...pane(true, 100) } as never) as any
  if (await ui.find({ key: 'o-0' })) await ui.press({ key: 'o-0' })
  await ui.press({ key: 'p-h' })
  for (let i = 0; i < 6; i++) await $.tool.call({ tool: 'Edit', file_path: `/tmp/demo/src/a${i}.ts` } as never)
  expect(await ui.find({ text: /édition/ })).toBeDefined()
  await ui.press({ key: 'k-n' })
  expect(await ui.find({ key: 'o-0' })).toBeDefined()
  expect(await ui.find({ key: 'o-1' })).toBeDefined()
  expect(await ui.find({ text: /(Commun|Rare|Épique|Héroïque|DUO|OBJET)$/ })).toBeDefined()
  expect(await ui.find({ text: /Choisis : 1, 2/ })).toBeDefined()
  const before = sounds.length
  await ui.press({ key: 'o-1' })
  expect(sounds.slice(before)).toContain('assets/sfx/levelup.wav')
  // The build shows with the map while the fight is paused.
  await ui.press({ key: 'p-p' })
  expect(await ui.find({ text: /^Bienfaits/ })).toBeDefined()
  await ui.unmount()
})
