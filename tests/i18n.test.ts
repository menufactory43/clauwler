import { expect, test } from 'claude-code/testing'

import { BOONS, CLASSES, GODS, ITEMS, MIRROR, WEAPONS, boonValue } from '../hooks/data'
import { getLang, langFromEnv, setLang } from '../hooks/i18n'
import { buildSummary, championTitle, offerTitle, startRun } from '../hooks/meta'
import { NAMES } from '../hooks/sim'
import { NOW, fresh } from './driver'
import { boot, pane } from './harness'

test('the environment picks the language: French for fr*, English otherwise or when unset', () => {
  expect(langFromEnv({ LANG: 'fr_FR.UTF-8' })).toBe('fr')
  expect(langFromEnv({ LANG: 'en_US.UTF-8' })).toBe('en')
  expect(langFromEnv({})).toBe('en')
  expect(langFromEnv({ LANG: 'C' })).toBe('en')
  expect(langFromEnv({ LANG: 'en_US.UTF-8', LC_ALL: 'fr_CA.UTF-8' })).toBe('fr')
  expect(langFromEnv({ LANGUAGE: 'en:fr', LANG: 'fr_FR.UTF-8' })).toBe('en')
})

test('the tables read in the language of the moment they are shown', () => {
  const before = getLang()
  try {
    setLang('en')
    expect(Object.values(GODS)).toContain('Grep the Eye')
    expect(NAMES.rat).toBe('node_modules Rat')
    expect(CLASSES.vagabond.label).toBe('Wanderer')
    expect(WEAPONS[0]!.title).toBe('Sword')
    expect(MIRROR.some(m => m.name === 'Death Defiance')).toBe(true)
    const def = BOONS.find(b => b.id === 'pipe-passive')!
    expect(def.desc(boonValue(def, 0))).toContain('damage')
    expect(ITEMS.every(i => i.god === 'Treasure')).toBe(true)
    const g = startRun(fresh(), 3, NOW)
    expect(championTitle(g.champion)).toContain(' the ')
    g.run!.boons = [{ id: 'pipe-passive', rarity: 0, level: 2 }]
    expect(buildSummary(g.run!)).toContain('Boons:')
    g.run!.offer = [{ id: 'grep-crit', rarity: 0 }]
    expect(offerTitle(g.run!)).toContain('boon')
    setLang('fr')
    expect(NAMES.rat).toBe('Rat de node_modules')
    expect(Object.values(GODS)).toContain("Grep l'Œil")
    expect(def.desc(boonValue(def, 0))).toContain('dégâts')
  } finally {
    setLang(before)
  }
})

test('with no locale the pane plays in English; L in the Hall switches to French and back', async ($, on) => {
  const before = getLang()
  try {
    await boot($, on, 'xterm-256color', '')
    const ui = await $.ui.mount({ plugin: 'clauwler', surface: 'terminal', ...pane(true) } as never) as any
    expect(await ui.find({ text: /Floor 1\/3/ })).toBeDefined()
    if (await ui.find({ key: 'o-0' })) await ui.press({ key: 'o-0' })
    // QWERTY players get W and A on the pad.
    expect(await ui.find({ key: 'p-w' })).toBeDefined()
    expect(await ui.find({ key: 'p-a' })).toBeDefined()
    expect(await ui.find({ key: 'p-z' })).toBeUndefined()
    expect(await ui.find({ text: /dodge/ })).toBeDefined()
    await ui.press({ key: 'p-p' })
    expect(await ui.find({ text: /any key to resume/ })).toBeDefined()
    await ui.press({ key: 'p-h' })
    expect(await ui.find({ text: /Hall of Ancestors/ })).toBeDefined()
    expect(await ui.find({ text: /Camp:/ })).toBeDefined()
    expect(await ui.find({ text: /language: EN/ })).toBeDefined()
    await ui.press({ key: 'k-a' })
    expect(await ui.find({ text: /Aspects of the wielded weapon/ })).toBeDefined()
    await ui.press({ key: 'k-b' })
    await ui.press({ key: 'k-l' })
    expect(await ui.find({ text: /Hall des Ancêtres/ })).toBeDefined()
    expect(await ui.find({ text: /langue : FR/ })).toBeDefined()
    await ui.press({ key: 'k-r' })
    expect(await ui.find({ key: 'p-z' })).toBeDefined()
    expect(await ui.find({ text: /Étage 1\/3/ })).toBeDefined()
    await ui.press({ key: 'p-h' })
    await ui.press({ key: 'k-l' })
    expect(await ui.find({ text: /Hall of Ancestors/ })).toBeDefined()
    await ui.unmount()
  } finally {
    setLang(before)
  }
})

test('V sets the picture rate in a run and still opens the Vault in the Hall', async ($, on) => {
  await boot($, on, 'xterm-ghostty', 'fr_FR.UTF-8')
  const ui = await $.ui.mount({ plugin: 'clauwler', surface: 'terminal', ...pane(true, 120) } as never) as any
  await ui.press({ key: 'p-v' })
  expect(await ui.find({ text: /15 i\/s/ })).toBeDefined()
  await ui.press({ key: 'p-h' })
  await ui.press({ key: 'k-v' })
  expect(await ui.find({ text: /Coffre|Vault/ })).toBeDefined()
  await ui.unmount()
})
