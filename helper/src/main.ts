/**
 * The picture process: draws Clauwler's frames outside Claude Code, at full speed.
 *
 * The mod writes the room as it stands to `<dir>/state.json` (with a `gen` number and the
 * view); this process draws it, packs it as a PNG into one of three files it rotates
 * through, and prints `F <gen> <path>` on stdout. The terminal reads the PNG itself, so
 * no pixel crosses Claude Code. It exits when its parent goes, or after 30 s with no state.
 */
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { encodeIndexedPng } from '../../hooks/png'
import type { View } from '../../hooks/render'
import { frameSize, renderFrame } from '../../hooks/render'
import type { Live } from '../../hooks/sim'

const dir = process.argv[2]
if (!dir) throw new Error('usage: engine.mjs <dir>')
mkdirSync(dir, { recursive: true })
const statePath = join(dir, 'state.json')
let lastMtime = 0
let lastGen = -1
let lastSeen = Date.now()
const buffers = new Map<number, Uint8Array>()

function frame(res: number): Uint8Array {
  let buf = buffers.get(res)
  if (!buf) {
    const size = frameSize(res)
    buf = new Uint8Array(size.width * size.height * 4)
    buffers.set(res, buf)
  }
  return buf
}

function poll() {
  let mtime = 0
  try { mtime = statSync(statePath).mtimeMs } catch { /* not written yet */ }
  if (mtime && mtime !== lastMtime) {
    let msg: { gen: number; live: Live; view: View } | undefined
    try { msg = JSON.parse(readFileSync(statePath, 'utf8')) } catch { /* half written: read again next poll */ }
    if (msg) lastMtime = mtime
    if (msg && msg.gen !== lastGen) {
      lastGen = msg.gen
      lastSeen = Date.now()
      const res = msg.view.res ?? 2
      const buf = frame(res)
      const t0 = performance.now()
      renderFrame(msg.live, msg.view, buf)
      const size = frameSize(res)
      const png = encodeIndexedPng(buf, size.width, size.height)
      const path = join(dir, `f${msg.gen % 3}.png`)
      const tmp = `${path}.tmp`
      const fd = openSync(tmp, 'w')
      writeSync(fd, png)
      closeSync(fd)
      renameSync(tmp, path)
      process.stdout.write(`F ${msg.gen} ${path} ${(performance.now() - t0).toFixed(1)}\n`)
    }
  }
  if (Date.now() - lastSeen > 30_000 || process.ppid === 1) process.exit(0)
  setTimeout(poll, 2)
}

process.stdout.write(`READY ${dir}\n`)
poll()
