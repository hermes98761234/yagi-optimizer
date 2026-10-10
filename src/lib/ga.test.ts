import { describe, expect, it } from 'vitest'
import { Ga, mulberry32 } from './ga'
import { classicDesign, evaluate, fitness, fromGenes, geneBounds, repairGenes, toGenes, type Bounds, type Env } from './analysis'

describe('mulberry32', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = mulberry32(5)
    const b = mulberry32(5)
    for (let i = 0; i < 100; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})

describe('Ga on a test function', () => {
  const target = [0.3, -0.2, 0.7, 0.1]
  const make = () =>
    new Ga({
      lo: target.map(() => -1),
      hi: target.map(() => 1),
      popSize: 30,
      generations: 60,
      seeds: [],
      rng: mulberry32(3),
      evaluate: (g) => -g.reduce((s, v, i) => s + (v - target[i]) ** 2, 0),
    })
  it('finds the maximum of a smooth function', () => {
    const ga = make()
    let last = ga.info().bestFit
    for (let i = 0; i < 60; i++) {
      const info = ga.step()
      expect(info.bestFit).toBeGreaterThanOrEqual(last)
      last = info.bestFit
    }
    const info = ga.polish(400)
    expect(info.bestFit).toBeGreaterThan(-1e-3)
    info.best.forEach((v, i) => expect(v).toBeCloseTo(target[i], 1))
  })
  it('accepts migrants only when they beat the worst individual', () => {
    const ga = make()
    const before = ga.info().bestFit
    ga.inject(target)
    expect(ga.info().bestFit).toBeGreaterThan(before)
    expect(ga.info().bestFit).toBeCloseTo(0, 9)
  })
  it('keeps every individual in bounds', () => {
    const ga = make()
    for (let i = 0; i < 20; i++) ga.step()
    ga.polish(100)
    for (const v of ga.info().best) {
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('Ga on a 4-element Yagi', () => {
  it('beats the classic start design', () => {
    const n = 4
    const env: Env = { freqHz: 144.2e6, diameter: 0.008, z0: 50, zRatio: 1, segs: 8 }
    const b: Bounds = { lenMin: 0.3, lenMax: 0.56, gapMin: 0.04, gapMax: 0.45, maxBoom: 0.9 }
    const w = { gain: 1, fb: 0.5, match: 0.5 }
    const { lo, hi } = geneBounds(n, b)
    const score = (g: number[]) => fitness(evaluate(fromGenes(g), env), w)
    const start = toGenes(classicDesign(n))
    const ga = new Ga({ lo, hi, popSize: 24, generations: 20, seeds: [start], rng: mulberry32(11), evaluate: score, repair: (g) => repairGenes(g, n, b) })
    for (let i = 0; i < 20; i++) ga.step()
    const info = ga.polish(120)
    expect(info.bestFit).toBeGreaterThan(score(start))
    const d = fromGenes(info.best)
    expect(d.pos[n - 1]).toBeLessThanOrEqual(0.9 + 1e-9)
    expect(evaluate(d, env).gain).toBeGreaterThan(8)
  })
})
