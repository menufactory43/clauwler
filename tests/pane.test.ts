import { expect, mock, test } from 'claude-code/testing'

export function pane(isFocused: boolean, bodyColumns = 78) {
  return {
    component: 'Pane',
    requestId: 'clauwler',
    props: { title: 'Clauwler', isFocused, bodyColumns, placement: 'dock' },
    viewport: { columns: 160, rows: 48 },
  } as const
}

export const blits: { cells?: string; image?: { rgba?: string; png?: string; width?: number; height?: number }; count: number } = { count: 0 }

export async function boot($: any, on: any, term = 'xterm-256color') {
  mock.store(on)
  mock.env(on, { TERM: term })
  const clock = mock.clock(on, { now: Date.parse('2026-10-05T10:00:00Z') })
  on('session.id', () => ({ value: 'session-test' }))
  on('session.repo', () => ({ value: null }))
  on('session.root', () => ({ value: '/tmp/demo' }))
  on('fs.list', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.blit', (_$: unknown, e: { cells?: string; source?: { rgba?: string; png?: string; width?: number; height?: number } }) => {
    blits.count += 1
    if (e.cells) blits.cells = e.cells
    if (e.source?.rgba || e.source?.png) blits.image = e.source
    return { value: {} }
  })
  on('ui.panes', () => ({ value: [{ id: 'clauwler', title: 'Clauwler', isShown: true, isFocused: true, isPlaced: true }] }))
  await $.command.run({ command: 'clauwler', args: '' })
  return clock
}

test('/clauwler drops straight into the dungeon; H leads to the Hall and back', async ($, on) => {
  await boot($, on)
  const ui = await $.ui.mount({ plugin: 'clauwler', surface: 'terminal', ...pane(true) } as never) as any
  expect((await ui.find({ key: 'arena' }))?.type).toBe('Raster')
  expect(await ui.find({ text: /Étage 1\/3/ })).toBeDefined()
  expect(await ui.find({ text: /Tu joues/ })).toBeDefined()
  if (await ui.find({ key: 'o-0' })) await ui.press({ key: 'o-0' })
  await ui.press({ key: 'p-p' })
  expect(await ui.find({ text: /PAUSE/ })).toBeDefined()
  await ui.press({ key: 'p-h' })
  expect(await ui.find({ text: /Hall des Ancêtres/ })).toBeDefined()
  expect((await ui.find({ key: 'splash' }))?.type).toBe('Raster')
  expect(await ui.find({ text: /Campement/ })).toBeDefined()
  await ui.press({ key: 'k-a' })
  expect(await ui.find({ text: /Arsenal/ })).toBeDefined()
  await ui.press({ key: 'k-b' })
  await ui.press({ key: 'k-r' })
  expect(await ui.find({ key: 'arena' })).toBeDefined()
  await ui.unmount()

  const away = await $.ui.mount({ plugin: 'clauwler', surface: 'terminal', ...pane(false) } as never) as any
  expect(await away.find({ text: /Claude a la main/ })).toBeDefined()
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
