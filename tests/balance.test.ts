import { expect, test } from 'claude-code/testing'

import { playRun } from './driver'

test('kills give back only a small part of the damage taken, even with a lifesteal relic', () => {
  const relics = [{ effect: 'dodge', value: 0.06 }, { effect: 'lifesteal', value: 2 }, { effect: 'crit', value: 0.08 }]
  let hurt = 0
  let fromKills = 0
  let wins = 0
  for (let seed = 1; seed <= 6; seed++) {
    const r = playRun(seed * 37, { level: 6, mirror: { vigueur: 3, force: 2 }, relics })
    hurt += r.hurt
    fromKills += r.killHealed
    wins += r.isWin ? 1 : 0
  }
  expect(fromKills / hurt < 0.35).toBe(true)
  expect(wins <= 2).toBe(true)
})
