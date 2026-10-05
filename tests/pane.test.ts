import { expect, test } from 'claude-code/testing'

import { boot, pane } from './harness'

export { blits, boot, pane, sounds } from './harness'

test('/clauwler drops straight into the dungeon; H leads to the Hall and back', async ($, on) => {
  await boot($, on)
  const ui = await $.ui.mount({ plugin: 'clauwler', surface: 'terminal', ...pane(true) } as never) as any
  expect((await ui.find({ key: 'arena' }))?.type).toBe('Raster')
  expect(await ui.find({ text: /Étage 1\/3/ })).toBeDefined()
  expect(await ui.find({ text: /🎮/ })).toBeDefined()
  if (await ui.find({ key: 'o-0' })) await ui.press({ key: 'o-0' })
  await ui.press({ key: 'p-p' })
  expect(await ui.find({ text: /PAUSE/ })).toBeDefined()
  await ui.press({ key: 'p-h' })
  expect(await ui.find({ text: /Hall des Ancêtres/ })).toBeDefined()
  expect((await ui.find({ key: 'splash' }))?.type).toBe('Raster')
  expect(await ui.find({ text: /Campement/ })).toBeDefined()
  await ui.press({ key: 'k-a' })
  expect(await ui.find({ text: /Arsenal/ })).toBeDefined()
  expect(await ui.find({ text: /Aspects de l'arme/ })).toBeDefined()
  expect(await ui.find({ key: 'as-epee-kernel' })).toBeDefined()
  await ui.press({ key: 'k-b' })
  await ui.press({ key: 'k-r' })
  expect(await ui.find({ key: 'arena' })).toBeDefined()
  await ui.unmount()

  const away = await $.ui.mount({ plugin: 'clauwler', surface: 'terminal', ...pane(false) } as never) as any
  expect(await away.find({ text: /ctrl\+x tab pour jouer/ })).toBeDefined()
  await away.unmount()

  const desk = await $.ui.mount({ plugin: 'clauwler', surface: 'desktop', ...pane(true) } as never) as any
  expect(await desk.find({ text: /Étage 1\/3/ })).toBeDefined()
  await desk.unmount()
})

test('a terminal that draws pictures gets real pixels', async ($, on) => {
  await boot($, on, 'xterm-ghostty')
  const ui = await $.ui.mount({ plugin: 'clauwler', surface: 'terminal', ...pane(true, 100) } as never) as any
  expect((await ui.find({ key: 'arena' }))?.type).toBe('Image')
  await ui.unmount()
})
