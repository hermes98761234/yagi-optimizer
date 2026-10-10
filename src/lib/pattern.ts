import { ETA0, type Solution } from './mom'

/**
 * Far field of the solved array. The boom runs along +x (forward direction = +x), the elements are
 * parallel to z. Spherical angles are the usual ones; the helper cuts below use the two principal
 * planes: H-plane = xy plane (theta = 90 deg, swept by azimuth), E-plane = xz plane (swept by elevation).
 */

/** Element factor F_w(c) = ∫ I_w(z) exp(j k c z) dz for c = cos(theta). Returns [re, im]. */
export function elementFactor(sol: Solution, w: number, c: number): [number, number] {
  const H = sol.segs / 2
  const D = sol.delta[w]
  const base = w * (H + 1)
  const b = sol.k * c * D // phase advance per segment
  let sr = sol.ire[base]
  let si = sol.iim[base]
  if (b === 0) {
    for (let n = 1; n < H; n++) {
      sr += 2 * sol.ire[base + n]
      si += 2 * sol.iim[base + n]
    }
    return [D * sr, D * si]
  }
  for (let n = 1; n < H; n++) {
    const cs = 2 * Math.cos(b * n)
    sr += cs * sol.ire[base + n]
    si += cs * sol.iim[base + n]
  }
  const h = b / 2
  const sinc = Math.sin(h) / h
  const f = D * sinc * sinc
  return [f * sr, f * si]
}

/** |S|² where S = Σ_w F_w(c) exp(j k x_w u), u = direction cosine along the boom. */
function arrayPowerSum(sol: Solution, c: number, u: number): number {
  let re = 0
  let im = 0
  for (let w = 0; w < sol.wires.length; w++) {
    const [fr, fi] = elementFactor(sol, w, c)
    const ph = sol.k * sol.wires[w].x * u
    const cs = Math.cos(ph)
    const sn = Math.sin(ph)
    re += fr * cs - fi * sn
    im += fr * sn + fi * cs
  }
  return re * re + im * im
}

/** Radiation intensity in W/sr for a unit-voltage excitation. */
export function radiationIntensity(sol: Solution, theta: number, phi: number): number {
  const st = Math.sin(theta)
  const s2 = arrayPowerSum(sol, Math.cos(theta), st * Math.cos(phi))
  return (ETA0 * sol.k * sol.k * st * st * s2) / (32 * Math.PI * Math.PI)
}

/** Input power in W for the driven wire at 1 V: 1/2 Re(V I*). */
export function inputPower(sol: Solution, driven: number): number {
  return 0.5 * sol.ire[driven * (sol.segs / 2 + 1)]
}

/** Radiation intensity in direction (u along the boom, c = cos theta) of the principal cuts. */
function intensityDir(sol: Solution, c: number, u: number): number {
  const s2 = arrayPowerSum(sol, c, u)
  return (ETA0 * sol.k * sol.k * (1 - c * c) * s2) / (32 * Math.PI * Math.PI)
}

/** H-plane (xy) intensity at azimuth phi. */
export function intensityH(sol: Solution, phi: number): number {
  return intensityDir(sol, 0, Math.cos(phi))
}

/**
 * E-plane (xz) intensity at elevation alpha measured from +x towards +z.
 * Direction = (cos a, 0, sin a): cos(theta) = sin a, sin(theta) cos(phi) = cos a.
 */
export function intensityE(sol: Solution, alpha: number): number {
  const c = Math.sin(alpha)
  const u = Math.cos(alpha)
  const s2 = arrayPowerSum(sol, c, u)
  return (ETA0 * sol.k * sol.k * u * u * s2) / (32 * Math.PI * Math.PI)
}

/** Total radiated power by integrating the intensity over the sphere (Gauss-Legendre in theta, uniform in phi). */
export function radiatedPower(sol: Solution, nTheta = 48, nPhi = 72): number {
  // Gauss-Legendre nodes by Newton iteration on Legendre polynomials.
  const xs: number[] = []
  const ws: number[] = []
  for (let i = 0; i < nTheta; i++) {
    let x = Math.cos((Math.PI * (i + 0.75)) / (nTheta + 0.5))
    let dp = 1
    for (let it = 0; it < 50; it++) {
      let p0 = 1
      let p1 = x
      for (let n = 2; n <= nTheta; n++) {
        const p2 = ((2 * n - 1) * x * p1 - (n - 1) * p0) / n
        p0 = p1
        p1 = p2
      }
      dp = (nTheta * (x * p1 - p0)) / (x * x - 1)
      const dx = p1 / dp
      x -= dx
      if (Math.abs(dx) < 1e-14) break
    }
    xs.push(x)
    ws.push(2 / ((1 - x * x) * dp * dp))
  }
  let sum = 0
  for (let i = 0; i < nTheta; i++) {
    const c = xs[i]
    const st = Math.sqrt(1 - c * c)
    let ring = 0
    for (let j = 0; j < nPhi; j++) {
      const phi = ((j + 0.5) * 2 * Math.PI) / nPhi
      ring += intensityDir(sol, c, st * Math.cos(phi))
    }
    sum += ws[i] * ring * ((2 * Math.PI) / nPhi)
  }
  return sum
}

/** Gain in dBi for a radiation intensity and input power. */
export function gainDb(u: number, pin: number): number {
  return 10 * Math.log10(Math.max((4 * Math.PI * u) / pin, 1e-12))
}

export interface Cut {
  /** Angles in degrees, 0 = forward, counter-clockwise, covering -180..180. */
  angles: number[]
  /** Gain in dBi. */
  gain: number[]
}

function sampleCut(f: (rad: number) => number, pin: number, step: number): Cut {
  const angles: number[] = []
  const gain: number[] = []
  for (let a = -180; a <= 180 + 1e-9; a += step) {
    angles.push(a)
    gain.push(gainDb(f((a * Math.PI) / 180), pin))
  }
  return { angles, gain }
}

export function hCut(sol: Solution, pin: number, step = 2): Cut {
  return sampleCut((r) => intensityH(sol, r), pin, step)
}
export function eCut(sol: Solution, pin: number, step = 2): Cut {
  return sampleCut((r) => intensityE(sol, r), pin, step)
}

/** Half-power beamwidth in degrees around the forward direction (angle 0); null if the beam never falls 3 dB. */
export function beamwidth(f: (rad: number) => number): number | null {
  const peak = f(0)
  const half = peak / 2
  const step = 0.25
  const edge = (dir: number): number | null => {
    let prev = peak
    for (let a = step; a <= 180; a += step) {
      const v = f((dir * a * Math.PI) / 180)
      if (v <= half) {
        const frac = (prev - half) / (prev - v)
        return a - step + frac * step
      }
      prev = v
    }
    return null
  }
  const up = edge(1)
  const down = edge(-1)
  if (up === null || down === null) return null
  return up + down
}

/** H-plane intensities at several azimuths, sharing the element factors. */
export function intensityHMany(sol: Solution, phis: readonly number[]): number[] {
  const nw = sol.wires.length
  const fr = new Array<number>(nw)
  const fi = new Array<number>(nw)
  for (let w = 0; w < nw; w++) [fr[w], fi[w]] = elementFactor(sol, w, 0)
  const scale = (ETA0 * sol.k * sol.k) / (32 * Math.PI * Math.PI)
  return phis.map((phi) => {
    const u = Math.cos(phi)
    let re = 0
    let im = 0
    for (let w = 0; w < nw; w++) {
      const ph = sol.k * sol.wires[w].x * u
      const cs = Math.cos(ph)
      const sn = Math.sin(ph)
      re += fr[w] * cs - fi[w] * sn
      im += fr[w] * sn + fi[w] * cs
    }
    return scale * (re * re + im * im)
  })
}
