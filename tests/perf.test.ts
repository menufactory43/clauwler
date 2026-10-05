import { expect, test } from 'claude-code/testing'
import { startRun } from '../hooks/meta'
import { encodeIndexedPng } from '../hooks/png'
import { frameSize, renderFrame } from '../hooks/render'
import { inject, step } from '../hooks/sim'
import { NOW, fresh, goTo, room } from './driver'
const IDLE = { mx: 0, my: 0, attack: false, special: false, cast: false, dash: false }
const view = { biomeLabel: '', roomLabel: '', eclats: 0, boons: 0, isPaused: false, isOffer: false, hint: '', scale: 1, hasPixelHud: false, res: 2 }
test('a fine frame renders and packs within budget', () => {
  const size = frameSize(2)
  const buf = new Uint8Array(size.width * size.height * 4)
  for (const kind of ['normal', 'boss', 'normal', 'boss'] as const) {
    const g = goTo(startRun(fresh(), 9, NOW), kind)
    const { live } = room(g, 21)
    inject(live, { kind: 'fail', sig: 'TypeError', name: 'TypeError, le Spectre' })
    let r = 0, e = 0, n = 0, bytes = 0
    for (let i = 0; i < 24 * 6; i++) {
      step(live, { ...IDLE, mx: Math.sin(i / 10), my: Math.cos(i / 13), attack: i % 5 === 0, ax: 1 }, 1 / 24)
      const t0 = performance.now()
      renderFrame(live, view, buf)
      const t1 = performance.now()
      bytes += encodeIndexedPng(buf, size.width, size.height).length
      const t2 = performance.now()
      if (i > 10) { r += t1 - t0; e += t2 - t1; n++ }
    }
    (globalThis as any).console.log(`PROF ${kind} render ${(r / n).toFixed(2)}ms encode ${(e / n).toFixed(2)}ms png ${Math.round(bytes / 144 / 1024)}KB`)
  }
  expect(true).toBe(true)
})
