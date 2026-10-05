#!/usr/bin/env python3
"""Synthesizes Clauwler's retro sound effects: python3 assets/make_sfx.py (stdlib only).

8-bit unsigned mono WAV at 22050 Hz: square waves, triangles and noise, a few KB each.
"""
import math
import os
import random
import struct
import wave

RATE = 22050
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sfx')
LEVEL = 0.42


def square(phase, duty=0.5):
    return 1.0 if (phase % 1.0) < duty else -1.0


def triangle(phase):
    p = phase % 1.0
    return 4 * p - 1 if p < 0.5 else 3 - 4 * p


class Noise:
    """Stepped noise, as the NES's: a new value every `hold` samples."""

    def __init__(self, seed):
        self.rng = random.Random(seed)
        self.v = 0.0
        self.n = 0

    def at(self, hold):
        if self.n <= 0:
            self.v = self.rng.uniform(-1, 1)
            self.n = max(1, int(hold))
        self.n -= 1
        return self.v


def env(i, n, attack=0.004, release=0.03, curve=1.0):
    t = i / RATE
    total = n / RATE
    a = min(1.0, t / attack) if attack > 0 else 1.0
    r = min(1.0, (total - t) / release) if release > 0 else 1.0
    decay = (1 - i / n) ** curve
    return max(0.0, a * r * decay)


def render(dur, voice, seed=1):
    n = int(RATE * dur)
    noise = Noise(seed)
    out = []
    state = {'phase': 0.0, 'phase2': 0.0}
    for i in range(n):
        out.append(voice(i, n, i / n, noise, state))
    return out


def write(name, samples):
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(1)
        w.setframerate(RATE)
        w.writeframes(bytes(max(0, min(255, int(128 + 127 * LEVEL * max(-1, min(1, s))))) for s in samples))


def sweep(f0, f1, kind='square', duty=0.5, curve=1.0, noise_mix=0.0, hold=2, vib=0.0, vib_hz=0.0):
    def voice(i, n, x, noise, st):
        f = f0 * (f1 / f0) ** x
        if vib:
            f *= 1 + vib * math.sin(2 * math.pi * vib_hz * i / RATE)
        st['phase'] += f / RATE
        tone = square(st['phase'], duty) if kind == 'square' else triangle(st['phase'])
        s = tone * (1 - noise_mix) + noise.at(hold) * noise_mix
        return s * env(i, n, curve=curve)
    return voice


def notes(seq, step, kind='square', duty=0.5, tail=1.0):
    """An arpeggio: each frequency for `step` seconds, the last one held."""
    def voice(i, n, x, noise, st):
        t = i / RATE
        k = min(len(seq) - 1, int(t / step))
        f = seq[k]
        st['phase'] += f / RATE
        tone = square(st['phase'], duty) if kind == 'square' else triangle(st['phase'])
        local = (t - k * step) / step
        blip = 1.0 if k == len(seq) - 1 else max(0.35, 1 - local * 0.6)
        return tone * blip * env(i, n, curve=tail)
    return voice


def mix(*parts):
    n = max(len(p) for p in parts)
    return [sum(p[i] if i < len(p) else 0 for p in parts) / max(1, len(parts)) * 1.4 for i in range(n)]


def note(name):
    names = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
    semis = names[name[0]] + (1 if '#' in name else 0) + 12 * (int(name[-1]) - 4)
    return 440 * 2 ** (semis / 12)


def main():
    write('hit', render(0.07, sweep(260, 110, duty=0.25, noise_mix=0.45, hold=3, curve=1.5)))
    write('crit', mix(render(0.13, sweep(900, 1500, duty=0.125, curve=1.2)), render(0.13, sweep(1, 1, noise_mix=1.0, hold=1, curve=2))))
    write('kill', render(0.2, sweep(620, 90, duty=0.5, noise_mix=0.35, hold=4, curve=1.3), seed=3))
    write('dash', render(0.13, lambda i, n, x, nz, st: nz.at(1 + int(6 * (1 - x))) * math.sin(math.pi * x) * 0.9, seed=4))
    write('hurt', render(0.2, sweep(330, 140, duty=0.5, vib=0.12, vib_hz=40, noise_mix=0.2, curve=1.0), seed=5))
    write('pickup', render(0.1, notes([note('E6'), note('B6')], 0.045, duty=0.25)))
    write('shard', render(0.16, notes([note('C6'), note('G6'), note('C7')], 0.045, kind='triangle')))
    write('door', render(0.2, sweep(120, 60, duty=0.5, noise_mix=0.4, hold=6, curve=1.4), seed=6))
    write('clear', render(0.45, notes([note('C5'), note('E5'), note('G5'), note('C6')], 0.08, duty=0.25, tail=0.6)))
    write('boss', mix(
        render(0.75, sweep(55, 49, duty=0.5, vib=0.05, vib_hz=6, curve=0.5)),
        render(0.75, sweep(82, 73, duty=0.25, vib=0.04, vib_hz=7, curve=0.5)),
        render(0.75, sweep(1, 1, noise_mix=1.0, hold=12, curve=2), seed=7),
    ))
    write('phase', mix(render(0.45, sweep(700, 80, duty=0.25, vib=0.08, vib_hz=18, curve=0.8)), render(0.45, sweep(1, 1, noise_mix=1.0, hold=5, curve=1.2), seed=8)))
    write('boon', render(0.5, notes([note('C5'), note('E5'), note('G5'), note('C6'), note('E6')], 0.06, duty=0.125, tail=0.5)))
    write('levelup', render(0.6, notes([note('G4'), note('C5'), note('E5'), note('G5'), note('C6'), note('G6')], 0.06, duty=0.25, tail=0.5)))
    write('death', render(0.9, sweep(420, 55, duty=0.5, vib=0.06, vib_hz=8, noise_mix=0.15, curve=0.7), seed=9))
    write('shoot', render(0.08, sweep(1300, 420, duty=0.25, curve=1.2)))
    write('explode', render(0.42, lambda i, n, x, nz, st: nz.at(2 + int(14 * x)) * env(i, n, curve=1.8), seed=10))
    write('menu', render(0.045, sweep(990, 990, duty=0.25, curve=0.5)))
    write('rift', mix(
        render(0.45, sweep(180, 760, duty=0.5, vib=0.15, vib_hz=22, curve=0.6)),
        render(0.45, sweep(1, 1, noise_mix=1.0, hold=3, curve=1.5), seed=11),
    ))
    write('heal', render(0.28, notes([note('C5'), note('G5'), note('C6')], 0.07, kind='triangle', tail=0.8)))
    write('seal', mix(render(0.35, notes([note('G5'), note('D6')], 0.07, duty=0.125, tail=1.4)), render(0.35, notes([note('G6'), note('D7')], 0.07, kind='triangle', tail=1.6))))
    write('narrator', render(0.4, notes([note('A5'), note('E5'), note('A5')], 0.1, kind='triangle', tail=0.7)))


if __name__ == '__main__':
    main()
