import { describe, expect, it } from 'vitest'
import { C0, feedCurrent, inputImpedance, portImpedanceMatrix, solveYagi } from './mom'
import { beamwidth, gainDb, inputPower, intensityE, intensityH, radiatedPower } from './pattern'

const f = 144e6
const lam = C0 / f
const dipole = (len: number) => [{ length: len * lam, x: 0 }]

describe('half-wave dipole', () => {
  const a = 1e-4 * lam
  const sol = solveYagi(dipole(0.5), f, a, 40, 0)
  it('has the textbook input impedance region (73 + j42.5 for an infinitely thin dipole)', () => {
    const [r, x] = inputImpedance(sol, 0)
    expect(r).toBeGreaterThan(70)
    expect(r).toBeLessThan(82)
    expect(x).toBeGreaterThan(38)
    expect(x).toBeLessThan(48)
  })
  it('has a directivity of 1.64 (2.15 dBi) and radiates all the power it takes in', () => {
    const pin = inputPower(sol, 0)
    expect(gainDb(intensityH(sol, 0), pin)).toBeCloseTo(2.15, 1)
    expect(radiatedPower(sol) / pin).toBeCloseTo(1, 2)
  })
  it('has a 78 degree E-plane beamwidth and an omnidirectional H-plane', () => {
    expect(beamwidth((r) => intensityE(sol, r))!).toBeGreaterThan(76)
    expect(beamwidth((r) => intensityE(sol, r))!).toBeLessThan(80)
    expect(intensityH(sol, 1.0) / intensityH(sol, 0)).toBeCloseTo(1, 6)
    // No radiation along the wire.
    expect(intensityE(sol, Math.PI / 2) / intensityE(sol, 0)).toBeLessThan(1e-6)
  })
  it('follows a cosine current distribution', () => {
    const H = sol.segs / 2
    const i0 = sol.ire[0]
    for (const n of [5, 10, 15]) {
      const z = (n * 0.5) / sol.segs
      expect(Math.hypot(sol.ire[n], sol.iim[n]) / Math.hypot(i0, sol.iim[0])).toBeCloseTo(Math.cos(2 * Math.PI * z), 1)
    }
    expect(sol.ire[H]).toBe(0)
  })
})

describe('dipole length', () => {
  it('resonates a few percent below half a wavelength for a thin wire', () => {
    const a = 0.002 * lam
    const x = (len: number) => inputImpedance(solveYagi(dipole(len), f, a, 24, 0), 0)[1]
    expect(x(0.44)).toBeLessThan(0)
    expect(x(0.5)).toBeGreaterThan(0)
    // Reactance rises with length.
    expect(x(0.46)).toBeLessThan(x(0.48))
    const res = [0.46, 0.47, 0.48, 0.49].find((l, i, arr) => x(l) <= 0 && (i === arr.length - 1 || x(arr[i + 1]) > 0))
    expect(res).toBeDefined()
  })
  it('radiates a full-wave dipole in a two-lobed pattern with higher gain (about 3.8 dBi)', () => {
    const sol = solveYagi(dipole(1.0), f, 1e-3 * lam, 40, 0)
    const g = gainDb(intensityH(sol, 0), inputPower(sol, 0))
    expect(g).toBeGreaterThan(3.5)
    expect(g).toBeLessThan(4.2)
  })
})

describe('two coupled dipoles', () => {
  const wires = [
    { length: 0.5 * lam, x: 0 },
    { length: 0.5 * lam, x: 0.5 * lam },
  ]
  const z = portImpedanceMatrix(wires, f, 1e-4 * lam, 20)
  it('is reciprocal (Z12 = Z21)', () => {
    expect(z.re[0][1]).toBeCloseTo(z.re[1][0], 3)
    expect(z.im[0][1]).toBeCloseTo(z.im[1][0], 3)
  })
  it('has a mutual impedance near the textbook value for side-by-side half-wave dipoles at 0.5 lambda (-12.5 - j29.9)', () => {
    expect(z.re[0][1]).toBeLessThan(-8)
    expect(z.re[0][1]).toBeGreaterThan(-22)
    expect(z.im[0][1]).toBeLessThan(-26)
    expect(z.im[0][1]).toBeGreaterThan(-35)
  })
  it('has the same self impedance on both ports', () => {
    expect(z.re[0][0]).toBeCloseTo(z.re[1][1], 3)
  })
})

describe('parasitic reflector', () => {
  it('gives forward gain of about 5 dBi for a dipole with a reflector 0.2 wavelengths behind it', () => {
    const wires = [
      { length: 0.49 * lam, x: 0 },
      { length: 0.47 * lam, x: 0.2 * lam },
    ]
    const sol = solveYagi(wires, f, 0.002 * lam * 2, 20, 1)
    const pin = inputPower(sol, 1)
    const gf = gainDb(intensityH(sol, 0), pin)
    const gb = gainDb(intensityH(sol, Math.PI), pin)
    expect(gf).toBeGreaterThan(5.5)
    expect(gf).toBeLessThan(8.5)
    expect(gf - gb).toBeGreaterThan(8)
    expect(radiatedPower(sol) / pin).toBeCloseTo(1, 2)
    const [ir, ii] = feedCurrent(sol, 1)
    expect(Math.hypot(ir, ii)).toBeGreaterThan(0)
  })
})

describe('solver input checks', () => {
  it('rejects an odd segment count', () => {
    expect(() => solveYagi(dipole(0.5), f, 1e-3, 11, 0)).toThrow()
  })
  it('converges when the segmentation is refined', () => {
    const z = (n: number) => inputImpedance(solveYagi(dipole(0.47), f, 1e-3 * lam, n, 0), 0)
    const [r20] = z(20)
    const [r40] = z(40)
    expect(Math.abs(r20 - r40) / r40).toBeLessThan(0.03)
  })
})
