/**
 * Method-of-moments solver for parallel thin straight wires (a Yagi-Uda array in free space).
 *
 * Every wire is parallel to z, centred on z = 0 and sits at x = wire.x, y = 0. The formulation is
 * the mixed-potential (Pocklington-type) electric-field integral equation with the thin-wire
 * reduced kernel, piecewise-linear (triangle) current basis and Galerkin testing:
 *
 *   Z_mn = j k eta * ∫∫ (f_m f_n - f_m' f_n' / k²) G(R) dz dz',   G = exp(-jkR) / (4 pi R)
 *
 * with R = sqrt(dz² + d²), d = wire radius on the same wire and the axis distance between
 * different wires. The feed is a delta gap (1 V) at the centre of the driven wire(s); the
 * other wires are continuous (parasitic). Because every wire is centred on z = 0 and fed at its
 * centre, the current is even in z, so only half of each wire is solved for.
 */

export const C0 = 299_792_458
export const ETA0 = 376.730313668

export interface Wire {
  /** Tip-to-tip length in metres. */
  length: number
  /** Position along the boom in metres. */
  x: number
}

export interface Solution {
  freq: number
  k: number
  segs: number
  wires: Wire[]
  /** Segment length per wire. */
  delta: number[]
  /** Nodal currents, wire-major: index w*(H+1)+n for n = 0..H (I_H = 0 at the tip). Real parts. */
  ire: Float64Array
  /** Nodal currents, imaginary parts. */
  iim: Float64Array
}

// 8- and 4-point Gauss-Legendre rules on [-1, 1].
const GL8_X = [0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363]
const GL8_W = [0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763]
const GL4_X = [0.3399810435848563, 0.8611363115940526]
const GL4_W = [0.6521451548625461, 0.3478548451374538]

interface Rule {
  x: Float64Array // points on [0, 1]
  w: Float64Array // weights summing to 1
}
function makeRule(xs: number[], ws: number[]): Rule {
  const x: number[] = []
  const w: number[] = []
  for (let i = xs.length - 1; i >= 0; i--) {
    x.push((1 - xs[i]) / 2)
    w.push(ws[i] / 2)
  }
  for (let i = 0; i < xs.length; i++) {
    x.push((1 + xs[i]) / 2)
    w.push(ws[i] / 2)
  }
  return { x: Float64Array.from(x), w: Float64Array.from(w) }
}
const RULE8 = makeRule(GL8_X, GL8_W)
const RULE4 = makeRule(GL4_X, GL4_W)

const FOUR_PI = 4 * Math.PI

/**
 * The five integrals of a pair of segments, written into `out`:
 * out[0..3] = ∫∫ L_a(s) L_b(s') G for (a,b) = 00, 01, 10, 11 (real, imag interleaved: out[2*i], out[2*i+1]),
 * out[8..9] = ∫∫ G. L_0 = 1 - s, L_1 = s are the two linear shape functions of a segment.
 */
function segmentPair(
  out: Float64Array,
  k: number,
  z0: number, // observation segment start
  dz1: number, // observation segment length
  z0b: number, // source segment start
  dz2: number, // source segment length
  d: number, // lateral distance (radius for the same wire)
  singular: boolean,
): void {
  out.fill(0)
  const rule = singular ? RULE8 : RULE4
  const n = rule.x.length
  const d2 = d * d
  for (let i = 0; i < n; i++) {
    const s = rule.x[i]
    const z = z0 + s * dz1
    const wo = rule.w[i] * dz1
    const a0 = 1 - s
    const a1 = s
    let m00r = 0, m00i = 0, m01r = 0, m01i = 0, jr = 0, ji = 0
    // Inner integral of L_b * G over the source segment.
    for (let jx = 0; jx < n; jx++) {
      const sp = rule.x[jx]
      const zp = z0b + sp * dz2
      const wi = rule.w[jx] * dz2
      const du = zp - z
      const R = Math.sqrt(du * du + d2)
      const kr = k * R
      let gr: number, gi: number
      if (singular) {
        // Smooth remainder (exp(-jkR) - 1) / R; the 1/R part is integrated analytically below.
        gr = (Math.cos(kr) - 1) / (FOUR_PI * R)
        gi = -Math.sin(kr) / (FOUR_PI * R)
      } else {
        gr = Math.cos(kr) / (FOUR_PI * R)
        gi = -Math.sin(kr) / (FOUR_PI * R)
      }
      const b0 = 1 - sp
      m00r += wi * b0 * gr
      m00i += wi * b0 * gi
      m01r += wi * sp * gr
      m01i += wi * sp * gi
      jr += wi * gr
      ji += wi * gi
    }
    if (singular) {
      // ∫ 1/R dz' and ∫ (z' - z)/R dz' over the source segment, analytic.
      const ua = z0b - z
      const ub = z0b + dz2 - z
      const A0 = Math.asinh(ub / d) - Math.asinh(ua / d)
      const A1 = Math.sqrt(ub * ub + d2) - Math.sqrt(ua * ua + d2)
      const p1 = (A1 + (z - z0b) * A0) / dz2 // ∫ L_1(s') / R
      const p0 = A0 - p1
      m00r += p0 / FOUR_PI
      m01r += p1 / FOUR_PI
      jr += A0 / FOUR_PI
    }
    // Scatter with the outer shape functions: out index = 2*(2a+b).
    out[0] += wo * a0 * m00r
    out[1] += wo * a0 * m00i
    out[2] += wo * a0 * m01r
    out[3] += wo * a0 * m01i
    out[4] += wo * a1 * m00r
    out[5] += wo * a1 * m00i
    out[6] += wo * a1 * m01r
    out[7] += wo * a1 * m01i
    out[8] += wo * jr
    out[9] += wo * ji
  }
}

/**
 * Solves the array for one or more voltage excitations.
 * `volts[e][w]` is the gap voltage on wire w for excitation e (0 = parasitic / shorted).
 */
export function solveWires(wires: Wire[], freq: number, radius: number, segs: number, volts: number[][]): Solution[] {
  if (segs < 2 || segs % 2 !== 0) throw new Error('segs must be an even number >= 2')
  const nw = wires.length
  const H = segs / 2
  const k = (2 * Math.PI * freq) / C0
  const n = nw * H
  const delta = wires.map((w) => w.length / segs)
  const zr = new Float64Array(n * n)
  const zi = new Float64Array(n * n)
  const buf = new Float64Array(10)
  const kEta = k * ETA0
  const invK2 = 1 / (k * k)

  for (let w1 = 0; w1 < nw; w1++) {
    const D1 = delta[w1]
    for (let w2 = 0; w2 < nw; w2++) {
      const D2 = delta[w2]
      const same = w1 === w2
      const d = same ? radius : Math.abs(wires[w2].x - wires[w1].x)
      for (let p = H - 1; p < segs; p++) {
        const zp = (p - H) * D1
        for (let q = 0; q < segs; q++) {
          const zq = (q - H) * D2
          const near = same ? Math.abs(p - q) <= 1 : d < 1.5 * Math.max(D1, D2)
          segmentPair(buf, k, zp, D1, zq, D2, d, near)
          for (let a = 0; a < 2; a++) {
            const j = p - H + a
            if (j < 0 || j > H - 1) continue
            const sa = (a === 0 ? -1 : 1) / D1
            for (let b = 0; b < 2; b++) {
              const nn = q - H + b
              if (nn <= -H || nn >= H) continue
              const col = Math.abs(nn)
              const sb = (b === 0 ? -1 : 1) / D2
              const idx = 2 * (2 * a + b)
              const xr = buf[idx] - sa * sb * buf[8] * invK2
              const xi = buf[idx + 1] - sa * sb * buf[9] * invK2
              // Z = j k eta X
              const row = w1 * H + j
              const c = w2 * H + col
              zr[row * n + c] += -kEta * xi
              zi[row * n + c] += kEta * xr
            }
          }
        }
      }
    }
  }

  // Right-hand sides: unit gap voltage at the centre node of each driven wire.
  const ne = volts.length
  const br = new Float64Array(n * ne)
  const bi = new Float64Array(n * ne)
  for (let e = 0; e < ne; e++) for (let w = 0; w < nw; w++) br[(w * H) * ne + e] = volts[e][w] ?? 0
  luSolve(n, zr, zi, br, bi, ne)

  const sols: Solution[] = []
  for (let e = 0; e < ne; e++) {
    const ire = new Float64Array(nw * (H + 1))
    const iim = new Float64Array(nw * (H + 1))
    for (let w = 0; w < nw; w++)
      for (let j = 0; j < H; j++) {
        ire[w * (H + 1) + j] = br[(w * H + j) * ne + e]
        iim[w * (H + 1) + j] = bi[(w * H + j) * ne + e]
      }
    sols.push({ freq, k, segs, wires, delta, ire, iim })
  }
  return sols
}

/** In-place complex LU (partial pivoting) solve of A X = B, B has `nrhs` columns stored row-major. */
function luSolve(n: number, ar: Float64Array, ai: Float64Array, br: Float64Array, bi: Float64Array, nrhs: number): void {
  for (let c = 0; c < n; c++) {
    let piv = c
    let best = ar[c * n + c] ** 2 + ai[c * n + c] ** 2
    for (let r = c + 1; r < n; r++) {
      const m = ar[r * n + c] ** 2 + ai[r * n + c] ** 2
      if (m > best) {
        best = m
        piv = r
      }
    }
    if (best < 1e-300) throw new Error('singular MoM matrix')
    if (piv !== c) {
      for (let j = 0; j < n; j++) {
        let t = ar[c * n + j]; ar[c * n + j] = ar[piv * n + j]; ar[piv * n + j] = t
        t = ai[c * n + j]; ai[c * n + j] = ai[piv * n + j]; ai[piv * n + j] = t
      }
      for (let j = 0; j < nrhs; j++) {
        let t = br[c * nrhs + j]; br[c * nrhs + j] = br[piv * nrhs + j]; br[piv * nrhs + j] = t
        t = bi[c * nrhs + j]; bi[c * nrhs + j] = bi[piv * nrhs + j]; bi[piv * nrhs + j] = t
      }
    }
    const pr = ar[c * n + c]
    const pi = ai[c * n + c]
    const inv = 1 / (pr * pr + pi * pi)
    const ir = pr * inv
    const ii = -pi * inv
    for (let r = c + 1; r < n; r++) {
      const xr = ar[r * n + c]
      const xi = ai[r * n + c]
      if (xr === 0 && xi === 0) continue
      const fr = xr * ir - xi * ii
      const fi = xr * ii + xi * ir
      for (let j = c + 1; j < n; j++) {
        const cr = ar[c * n + j]
        const ci = ai[c * n + j]
        ar[r * n + j] -= fr * cr - fi * ci
        ai[r * n + j] -= fr * ci + fi * cr
      }
      for (let j = 0; j < nrhs; j++) {
        const cr = br[c * nrhs + j]
        const ci = bi[c * nrhs + j]
        br[r * nrhs + j] -= fr * cr - fi * ci
        bi[r * nrhs + j] -= fr * ci + fi * cr
      }
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    for (let j = 0; j < nrhs; j++) {
      let sr = br[r * nrhs + j]
      let si = bi[r * nrhs + j]
      for (let c = r + 1; c < n; c++) {
        const xr = ar[r * n + c]
        const xi = ai[r * n + c]
        const yr = br[c * nrhs + j]
        const yi = bi[c * nrhs + j]
        sr -= xr * yr - xi * yi
        si -= xr * yi + xi * yr
      }
      const pr = ar[r * n + r]
      const pi = ai[r * n + r]
      const inv = 1 / (pr * pr + pi * pi)
      br[r * nrhs + j] = (sr * pr + si * pi) * inv
      bi[r * nrhs + j] = (si * pr - sr * pi) * inv
    }
  }
}

/** Current at the centre (feed point) of a wire. */
export function feedCurrent(sol: Solution, wire: number): [number, number] {
  const H = sol.segs / 2
  return [sol.ire[wire * (H + 1)], sol.iim[wire * (H + 1)]]
}

/** Solves the array driven on one wire (1 V) and returns the solution. */
export function solveYagi(wires: Wire[], freq: number, radius: number, segs: number, driven: number): Solution {
  const v = wires.map((_, i) => (i === driven ? 1 : 0))
  return solveWires(wires, freq, radius, segs, [v])[0]
}

/** Input impedance seen at the driven wire's gap (V = 1). */
export function inputImpedance(sol: Solution, driven: number): [number, number] {
  const [ir, ii] = feedCurrent(sol, driven)
  const m = ir * ir + ii * ii
  return [ir / m, -ii / m]
}

/** Port impedance matrix of the wires treated as an N-port (each gap is a port). */
export function portImpedanceMatrix(wires: Wire[], freq: number, radius: number, segs: number): { re: number[][]; im: number[][] } {
  const n = wires.length
  const volts = wires.map((_, e) => wires.map((_, w) => (w === e ? 1 : 0)))
  const sols = solveWires(wires, freq, radius, segs, volts)
  // Y[i][e] = current at port i for 1 V on port e.
  const yr = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const yi = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let e = 0; e < n; e++)
    for (let i = 0; i < n; i++) {
      const [r, im] = feedCurrent(sols[e], i)
      yr[i][e] = r
      yi[i][e] = im
    }
  // Z = Y^-1 via the same complex solver.
  const ar = new Float64Array(n * n), ai = new Float64Array(n * n)
  const br = new Float64Array(n * n), bi = new Float64Array(n * n)
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      ar[i * n + j] = yr[i][j]
      ai[i * n + j] = yi[i][j]
      br[i * n + j] = i === j ? 1 : 0
    }
  luSolve(n, ar, ai, br, bi, n)
  const re = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => br[i * n + j]))
  const im = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => bi[i * n + j]))
  return { re, im }
}
