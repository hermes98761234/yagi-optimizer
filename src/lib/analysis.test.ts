import { describe, expect, it } from 'vitest'
import {
  analyze,
  classicDesign,
  designValid,
  evaluate,
  fitness,
  fromGenes,
  geneBounds,
  repairGenes,
  resizeDesign,
  swrOf,
  toGenes,
  type Bounds,
  type Env,
} from './analysis'

const env: Env = { freqHz: 144.2e6, diameter: 0.008, z0: 50, zRatio: 1, segs: 16 }

describe('swrOf', () => {
  it('matches the transmission-line formulas', () => {
    expect(swrOf(50, 0, 50).swr).toBeCloseTo(1, 9)
    expect(swrOf(100, 0, 50).swr).toBeCloseTo(2, 9)
    expect(swrOf(25, 0, 50).swr).toBeCloseTo(2, 9)
    // SWR 2 reflects 11.1 % of the power, 0.512 dB mismatch loss.
    expect(swrOf(100, 0, 50).mismatch).toBeCloseTo(0.512, 3)
    expect(swrOf(0, 50, 50).swr).toBe(Infinity)
  })
})

describe('classic Yagis', () => {
  it('3 elements give about 8 dBi and a clean back', () => {
    const m = evaluate(classicDesign(3), env)
    expect(m.gain).toBeGreaterThan(7)
    expect(m.gain).toBeLessThan(9.5)
    expect(m.fb).toBeGreaterThan(10)
  })
  it('gain rises with the number of elements', () => {
    const g = [3, 5, 8].map((n) => evaluate(classicDesign(n), env).gain)
    expect(g[1]).toBeGreaterThan(g[0] + 1.5)
    expect(g[2]).toBeGreaterThan(g[1] + 1.5)
  })
  it('the full analysis is self-consistent', () => {
    const a = analyze(classicDesign(5), env)
    expect(a.powerRatio).toBeCloseTo(1, 2)
    expect(Math.max(...a.h.gain)).toBeCloseTo(a.metrics.gain, 0)
    expect(a.hpbwH!).toBeGreaterThan(30)
    expect(a.hpbwH!).toBeLessThan(80)
    expect(a.hpbwE!).toBeGreaterThan(30)
    expect(a.hpbwE!).toBeLessThan(70)
    expect(a.h.angles[0]).toBe(-180)
    expect(a.h.gain.length).toBe(181)
  })
  it('the impedance multiplier scales the feed impedance', () => {
    const a = evaluate(classicDesign(3), env)
    const b = evaluate(classicDesign(3), { ...env, zRatio: 4 })
    expect(b.zr).toBeCloseTo(4 * a.zr, 6)
    expect(b.gain).toBeCloseTo(a.gain, 9)
  })
})

describe('genes', () => {
  const b: Bounds = { lenMin: 0.3, lenMax: 0.56, gapMin: 0.04, gapMax: 0.45, maxBoom: 0 }
  it('round-trips a design', () => {
    const d = classicDesign(6)
    const back = fromGenes(toGenes(d))
    expect(back.len).toEqual(d.len)
    back.pos.forEach((p, i) => expect(p).toBeCloseTo(d.pos[i], 12))
  })
  it('has matching bounds', () => {
    const { lo, hi } = geneBounds(5, b)
    expect(lo.length).toBe(9)
    expect(hi[0]).toBe(0.56)
    expect(lo[8]).toBe(0.04)
  })
  it('repairs genes into range and honours the maximum boom length', () => {
    const g = [0.9, 0.1, 0.4, 0.4, 0.9, 0.3, 0.3, 0.3]
    repairGenes(g, 4, { ...b, maxBoom: 0.6 })
    expect(g[0]).toBe(0.56)
    expect(g[1]).toBe(0.3)
    const boom = g[4] + g[5] + g[6] + g[7]
    expect(boom).toBeLessThanOrEqual(0.6 + 1e-9)
    expect(Math.min(g[4], g[5], g[6], g[7])).toBeGreaterThanOrEqual(0.04)
  })
  it('resizes and validates designs', () => {
    const d = resizeDesign(classicDesign(4), 7)
    expect(d.len.length).toBe(7)
    expect(designValid(d)).toBe(true)
    expect(resizeDesign(d, 3).len.length).toBe(3)
    expect(designValid({ len: [0.5, 0.5], pos: [0, 0] })).toBe(false)
    expect(designValid({ len: [0.5, 0.5], pos: [0, 0.2] })).toBe(true)
  })
  it('combines the goals into one fitness', () => {
    const m = evaluate(classicDesign(3), env)
    expect(fitness(m, { gain: 1, fb: 0, match: 0 })).toBeCloseTo(m.gain, 9)
    expect(fitness(m, { gain: 1, fb: 0, match: 1 })).toBeLessThan(m.gain)
  })
})
