// The pane harness: boots the mod in the test bench, the world beneath it mocked.
import { mock } from 'claude-code/testing'

export function pane(isFocused: boolean, bodyColumns = 78) {
  return {
    component: 'Pane',
    requestId: 'clauwler',
    props: { title: 'Clauwler', isFocused, bodyColumns, placement: 'dock' },
    viewport: { columns: 160, rows: 48 },
  } as const
}

export const blits: { cells?: string; image?: { rgba?: string; png?: string; width?: number; height?: number }; count: number } = { count: 0 }
/** The clips the mod asked `$.audio.play` for, in order. */
export const sounds: string[] = []

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
  on('audio.play', (_$: unknown, e: { clip?: { asset?: string } }) => {
    sounds.push(e.clip?.asset ?? '?')
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [{ id: 'clauwler', title: 'Clauwler', isShown: true, isFocused: true, isPlaced: true }] }))
  await $.command.run({ command: 'clauwler', args: '' })
  return clock
}

