/**
 * Films a run the bot plays: the same picture engine as the pane, at 24 frames a second,
 * piped into ffmpeg. Only the fights are kept, with a short tail after each room.
 *
 *   node tools/film/film.mjs <out.mp4> [seed] [seconds]
 */
import { spawn } from 'node:child_process'
import type { View } from '../../hooks/render'
import { frameSize, renderFrame } from '../../hooks/render'
import { setLang } from '../../hooks/i18n'
import { playRun } from '../../tests/driver'

const out = process.argv[2] ?? 'clauwler.mp4'
const seed = Number(process.argv[3] ?? 74)
const seconds = Number(process.argv[4] ?? 75)
const scale = 6
setLang((process.env.FILM_LANG as 'fr' | 'en') ?? 'fr')

const size = frameSize(2)
const frame = new Uint8Array(size.width * size.height * 4)
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${size.width}x${size.height}`, '-r', '24', '-i', '-',
  '-vf', `scale=${size.width * scale}:${size.height * scale}:flags=neighbor`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] })

let kept = 0
let tail = 0
let isDone = false
playRun(seed, {
  level: 6, mirror: { vigueur: 3, force: 2 },
  onFrame: (live, g, t) => {
    if (isDone) return
    tail = live.enemies.length > 0 ? 36 : tail - 1
    if (tail <= 0 && t > 3) return
    const run = g.run
    const view: View = {
      biomeLabel: run?.biomeName ?? '', roomLabel: run ? `${run.biome + 1}-${run.depth + 1}` : '', eclats: run?.eclats ?? 0,
      boons: run?.boons.length ?? 0, isPaused: false, isOffer: false, hint: '', scale: 1, hasPixelHud: false, hasWorldText: true, res: 2,
    }
    ff.stdin.write(Buffer.from(renderFrame(live, view, frame)))
    if (++kept >= seconds * 24) isDone = true
  },
})
ff.stdin.end()
ff.on('close', code => console.log(code === 0 ? `${out}: ${(kept / 24).toFixed(1)} s` : `ffmpeg failed (${code})`))
