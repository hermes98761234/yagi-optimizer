/** Small real-coded genetic algorithm with elitism, tournament selection and BLX crossover, plus a compass-search polish. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface GaConfig {
  lo: number[]
  hi: number[]
  popSize: number
  generations: number
  /** Individuals to put in the initial population (the rest is random / mutated seeds). */
  seeds: number[][]
  rng: () => number
  /** Fitness to maximise. */
  evaluate: (genes: number[]) => number
  /** Optional in-place constraint repair applied to every new individual. */
  repair?: (genes: number[]) => void
}

export interface GenInfo {
  gen: number
  evals: number
  best: number[]
  bestFit: number
  meanFit: number
}

interface Ind {
  g: number[]
  f: number
}

function gauss(rng: () => number): number {
  const u = Math.max(rng(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

export class Ga {
  private pop: Ind[] = []
  gen = 0
  evals = 0
  private cfg: GaConfig
  private nG: number

  constructor(cfg: GaConfig) {
    this.cfg = cfg
    this.nG = cfg.lo.length
    const { rng } = cfg
    const range = (i: number) => cfg.hi[i] - cfg.lo[i]
    for (let i = 0; i < cfg.popSize; i++) {
      let g: number[]
      if (i < cfg.seeds.length) g = [...cfg.seeds[i]]
      else if (cfg.seeds.length > 0 && i % 2 === 0) {
        // Perturbed copy of a seed.
        const base = cfg.seeds[Math.floor(rng() * cfg.seeds.length)]
        g = base.map((v, j) => v + gauss(rng) * 0.06 * range(j))
      } else g = cfg.lo.map((l, j) => l + rng() * range(j))
      this.fix(g)
      this.pop.push({ g, f: this.eval(g) })
    }
    this.sort()
  }

  private fix(g: number[]): void {
    for (let i = 0; i < g.length; i++) g[i] = Math.min(this.cfg.hi[i], Math.max(this.cfg.lo[i], g[i]))
    this.cfg.repair?.(g)
  }

  private eval(g: number[]): number {
    this.evals++
    const f = this.cfg.evaluate(g)
    return Number.isFinite(f) ? f : -1e9
  }

  private sort(): void {
    this.pop.sort((a, b) => b.f - a.f)
  }

  get best(): Ind {
    return this.pop[0]
  }

  info(): GenInfo {
    let sum = 0
    for (const p of this.pop) sum += p.f
    return { gen: this.gen, evals: this.evals, best: [...this.pop[0].g], bestFit: this.pop[0].f, meanFit: sum / this.pop.length }
  }

  /** Inserts an outside individual in place of the worst one if it is good enough. */
  inject(genes: number[]): void {
    const g = [...genes]
    this.fix(g)
    const f = this.eval(g)
    const worst = this.pop.length - 1
    if (f > this.pop[worst].f) {
      this.pop[worst] = { g, f }
      this.sort()
    }
  }

  /** Advances one generation. */
  step(): GenInfo {
    const { rng, popSize, lo, hi } = this.cfg
    const frac = this.gen / Math.max(1, this.cfg.generations)
    const sigma = 0.08 * (1 - 0.85 * frac)
    const elite = Math.max(1, Math.round(popSize * 0.1))
    const next: Ind[] = this.pop.slice(0, elite)
    const pick = (): Ind => {
      let b = this.pop[Math.floor(rng() * this.pop.length)]
      for (let k = 1; k < 3; k++) {
        const c = this.pop[Math.floor(rng() * this.pop.length)]
        if (c.f > b.f) b = c
      }
      return b
    }
    while (next.length < popSize) {
      const a = pick()
      const b = pick()
      const g = new Array<number>(this.nG)
      const cross = rng() < 0.85
      for (let i = 0; i < this.nG; i++) {
        let v: number
        if (cross) {
          const mn = Math.min(a.g[i], b.g[i])
          const mx = Math.max(a.g[i], b.g[i])
          const d = mx - mn
          v = mn - 0.25 * d + rng() * 1.5 * d
        } else v = a.g[i]
        if (rng() < 1.5 / this.nG + 0.02) v += gauss(rng) * sigma * (hi[i] - lo[i])
        g[i] = v
      }
      this.fix(g)
      next.push({ g, f: this.eval(g) })
    }
    this.pop = next
    this.sort()
    this.gen++
    return this.info()
  }

  /** Compass search around the best individual; returns the improved best. */
  polish(maxEvals: number): GenInfo {
    const { lo, hi } = this.cfg
    let cur = this.pop[0]
    let step = 0.01
    const start = this.evals
    while (step > 0.0003 && this.evals - start < maxEvals) {
      let improved = false
      for (let i = 0; i < this.nG && this.evals - start < maxEvals; i++) {
        for (const dir of [1, -1]) {
          const g = [...cur.g]
          g[i] += dir * step * Math.max(1, (hi[i] - lo[i]) / 0.2)
          this.fix(g)
          if (g[i] === cur.g[i]) continue
          const f = this.eval(g)
          if (f > cur.f + 1e-9) {
            cur = { g, f }
            improved = true
            break
          }
        }
      }
      if (!improved) step /= 2
    }
    this.pop[0] = cur
    this.sort()
    return this.info()
  }
}
