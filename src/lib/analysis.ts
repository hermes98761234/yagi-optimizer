import { C0, inputImpedance, solveYagi, type Solution, type Wire } from './mom'
import { beamwidth, eCut, gainDb, hCut, inputPower, intensityE, intensityH, intensityHMany, radiatedPower, type Cut } from './pattern'

/** A Yagi in wavelengths: element 0 is the reflector, element 1 the driven element, the rest are directors. */
export interface Design {
  /** Tip-to-tip element lengths in wavelengths. */
  len: number[]
  /** Positions along the boom in wavelengths; pos[0] = 0 (reflector). */
  pos: number[]
}

export const DRIVEN = 1

export interface Env {
  freqHz: number
  /** Element diameter in metres. */
  diameter: number
  /** Reference impedance for the SWR in ohms. */
  z0: number
  /** Feed-point impedance multiplier (1 = plain dipole, 4 = folded dipole). */
  zRatio: number
  /** Segments per element used by the solver (even). */
  segs: number
}

export interface Metrics {
  /** Forward gain in dBi (free space, lossless elements, referred to the input power). */
  gain: number
  /** Front-to-back ratio in dB at exactly 180 degrees. */
  fb: number
  /** Front-to-rear ratio in dB against the worst direction within 20 degrees of the back. */
  fbWorst: number
  /** Feed-point impedance (after the multiplier) in ohms. */
  zr: number
  zi: number
  swr: number
  /** Mismatch loss in dB, -10 log10(1 - |Gamma|²). */
  mismatch: number
}

export function wavelength(freqHz: number): number {
  return C0 / freqHz
}

export function designWires(d: Design, freqHz: number): Wire[] {
  const lam = wavelength(freqHz)
  return d.len.map((l, i) => ({ length: l * lam, x: d.pos[i] * lam }))
}

export function solveDesign(d: Design, env: Env): Solution {
  return solveYagi(designWires(d, env.freqHz), env.freqHz, env.diameter / 2, env.segs, DRIVEN)
}

export function swrOf(zr: number, zi: number, z0: number): { swr: number; mismatch: number } {
  const nr = zr - z0
  const dr = zr + z0
  const g2 = (nr * nr + zi * zi) / (dr * dr + zi * zi)
  const g = Math.sqrt(g2)
  return { swr: g >= 1 ? Infinity : (1 + g) / (1 - g), mismatch: g2 >= 1 ? Infinity : -10 * Math.log10(1 - g2) }
}

const REAR = [(160 * Math.PI) / 180, Math.PI, (200 * Math.PI) / 180]

/** Fast evaluation used by the optimizer: forward gain, F/B, impedance and SWR from one solve. */
export function evaluate(d: Design, env: Env): Metrics {
  return metricsOf(solveDesign(d, env), env)
}

export function metricsOf(sol: Solution, env: Env): Metrics {
  const pin = inputPower(sol, DRIVEN)
  const [zr0, zi0] = inputImpedance(sol, DRIVEN)
  const [uf, ub, ub1, ub2] = intensityHMany(sol, [0, REAR[1], REAR[0], REAR[2]])
  const worst = Math.max(ub, ub1, ub2)
  const zr = zr0 * env.zRatio
  const zi = zi0 * env.zRatio
  const { swr, mismatch } = swrOf(zr, zi, env.z0)
  return {
    gain: gainDb(uf, pin),
    fb: 10 * Math.log10(uf / Math.max(ub, 1e-30)),
    fbWorst: 10 * Math.log10(uf / Math.max(worst, 1e-30)),
    zr,
    zi,
    swr,
    mismatch,
  }
}

export interface Analysis {
  metrics: Metrics
  h: Cut
  e: Cut
  /** Half-power beamwidths in degrees (null when the beam is wider than the cut allows). */
  hpbwH: number | null
  hpbwE: number | null
  /** Radiated power over input power from integrating the pattern; ~1 for a consistent solution. */
  powerRatio: number
}

/** Full analysis for display: metrics, both principal-plane cuts and beamwidths. */
export function analyze(d: Design, env: Env): Analysis {
  const sol = solveDesign(d, env)
  const pin = inputPower(sol, DRIVEN)
  return {
    metrics: metricsOf(sol, env),
    h: hCut(sol, pin),
    e: eCut(sol, pin),
    hpbwH: beamwidth((r) => intensityH(sol, r)),
    hpbwE: beamwidth((r) => intensityE(sol, r)),
    powerRatio: radiatedPower(sol, 24, 36) / pin,
  }
}

/** Metrics over a frequency sweep (centre ± span/2, fractional) for the design held fixed in metres. */
export function sweep(d: Design, env: Env, spanFraction: number, points: number): { freqHz: number; m: Metrics }[] {
  const wires0: Wire[] = designWires(d, env.freqHz)
  const out: { freqHz: number; m: Metrics }[] = []
  for (let i = 0; i < points; i++) {
    const f = env.freqHz * (1 + spanFraction * (i / (points - 1) - 0.5))
    const sol = solveYagi(wires0, f, env.diameter / 2, env.segs, DRIVEN)
    out.push({ freqHz: f, m: metricsOf(sol, env) })
  }
  return out
}

/** Weights of the optimizer objective. */
export interface Weights {
  gain: number
  fb: number
  match: number
}

/** Single number the genetic algorithm maximises. */
export function fitness(m: Metrics, w: Weights): number {
  if (!Number.isFinite(m.gain) || !Number.isFinite(m.mismatch)) return -1e6
  const fb = Math.min(m.fbWorst, 30)
  return w.gain * m.gain + w.fb * 0.3 * fb - w.match * 3 * m.mismatch
}

// ---- Design genes -------------------------------------------------------------------------

export interface Bounds {
  lenMin: number
  lenMax: number
  gapMin: number
  gapMax: number
  /** Maximum boom length in wavelengths, 0 = unlimited. */
  maxBoom: number
}

/** genes = [len_0 .. len_{n-1}, gap_1 .. gap_{n-1}] */
export function toGenes(d: Design): number[] {
  const g = [...d.len]
  for (let i = 1; i < d.pos.length; i++) g.push(d.pos[i] - d.pos[i - 1])
  return g
}

export function fromGenes(g: readonly number[]): Design {
  const n = (g.length + 1) / 2
  const len = g.slice(0, n)
  const pos = [0]
  for (let i = 1; i < n; i++) pos.push(pos[i - 1] + g[n + i - 1])
  return { len, pos }
}

export function geneBounds(n: number, b: Bounds): { lo: number[]; hi: number[] } {
  const lo: number[] = []
  const hi: number[] = []
  for (let i = 0; i < n; i++) {
    lo.push(b.lenMin)
    hi.push(b.lenMax)
  }
  for (let i = 1; i < n; i++) {
    lo.push(b.gapMin)
    hi.push(b.gapMax)
  }
  return { lo, hi }
}

/** Clamps genes into their bounds and shrinks the gaps proportionally to respect the maximum boom length. */
export function repairGenes(g: number[], n: number, b: Bounds): void {
  for (let i = 0; i < g.length; i++) {
    const lo = i < n ? b.lenMin : b.gapMin
    const hi = i < n ? b.lenMax : b.gapMax
    g[i] = Math.min(hi, Math.max(lo, g[i]))
  }
  if (b.maxBoom > 0) {
    // Gaps can shrink down to gapMin; shrink the part above it uniformly.
    for (let pass = 0; pass < 3; pass++) {
      let boom = 0
      let excess = 0
      for (let i = n; i < g.length; i++) {
        boom += g[i]
        excess += g[i] - b.gapMin
      }
      if (boom <= b.maxBoom + 1e-12 || excess <= 1e-12) break
      const f = Math.max(0, (boom - b.maxBoom) / excess)
      for (let i = n; i < g.length; i++) g[i] -= f * (g[i] - b.gapMin)
    }
  }
}

/** A reasonable starting design for n elements (n >= 2). */
export function classicDesign(n: number): Design {
  const len: number[] = [0.49, 0.47]
  for (let i = 0; i < n - 2; i++) len.push(Math.max(0.4, 0.44 - 0.004 * i))
  const gaps: number[] = [0.2, 0.15]
  for (let i = 0; i < n - 3; i++) gaps.push(0.28)
  const pos = [0]
  for (let i = 1; i < n; i++) pos.push(pos[i - 1] + gaps[i - 1])
  return { len: len.slice(0, n), pos: pos.slice(0, n) }
}

/** Grows or shrinks a design to n elements, keeping the existing ones. */
export function resizeDesign(d: Design, n: number): Design {
  const len = d.len.slice(0, n)
  const pos = d.pos.slice(0, n)
  while (len.length < n) {
    len.push(Math.max(0.4, len[len.length - 1] - 0.004))
    pos.push(pos[pos.length - 1] + 0.28)
  }
  return { len, pos }
}

/** True when the geometry is solvable: sensible lengths and elements strictly ordered along the boom. */
export function designValid(d: Design): boolean {
  if (d.len.length < 2 || d.len.length !== d.pos.length) return false
  if (!d.len.every((l) => Number.isFinite(l) && l > 0.05 && l < 1.5)) return false
  if (d.pos[0] !== 0) return false
  for (let i = 1; i < d.pos.length; i++) if (!(d.pos[i] - d.pos[i - 1] > 0.005)) return false
  return true
}
