import { wavelength, type Design } from './analysis'
import { MM_PER_IN, type Unit } from './model'

export function roleLabel(i: number): 'reflector' | 'driven' | 'director' {
  return i === 0 ? 'reflector' : i === 1 ? 'driven' : 'director'
}

/** Metres to the display unit's value (mm or inches). */
export function toUnit(m: number, unit: Unit): number {
  return unit === 'mm' ? m * 1000 : (m * 1000) / MM_PER_IN
}
export function fromUnit(v: number, unit: Unit): number {
  return unit === 'mm' ? v / 1000 : (v * MM_PER_IN) / 1000
}

export function fmtLen(m: number, unit: Unit): string {
  return toUnit(m, unit).toFixed(unit === 'mm' ? 1 : 3)
}

export interface Row {
  index: number
  role: string
  /** Metres. */
  length: number
  half: number
  pos: number
  gap: number
}

export function rows(d: Design, freqHz: number): Row[] {
  const lam = wavelength(freqHz)
  return d.len.map((l, i) => ({
    index: i + 1,
    role: roleLabel(i),
    length: l * lam,
    half: (l * lam) / 2,
    pos: d.pos[i] * lam,
    gap: i === 0 ? 0 : (d.pos[i] - d.pos[i - 1]) * lam,
  }))
}

export function toCsv(d: Design, freqHz: number, unit: Unit): string {
  const u = unit
  const head = ['element', 'role', `length_${u}`, `half_length_${u}`, `position_${u}`, `spacing_${u}`]
  const lines = [head.join(',')]
  for (const r of rows(d, freqHz)) {
    lines.push([r.index, r.role, fmtLen(r.length, u), fmtLen(r.half, u), fmtLen(r.pos, u), fmtLen(r.gap, u)].join(','))
  }
  return lines.join('\n') + '\n'
}

/** A NEC-2 card deck: elements along z, boom along x, free space, feed on the driven element, with a pattern card. */
export function toNec(d: Design, freqHz: number, diameterM: number): string {
  const lam = wavelength(freqHz)
  const segs = 21
  const a = diameterM / 2
  const f = (v: number) => v.toFixed(5)
  const lines = ['CM Yagi-Uda exported by Yagi Optimizer (hermes98761234.github.io/yagi-optimizer)', `CM ${(freqHz / 1e6).toFixed(3)} MHz, ${d.len.length} elements`, 'CE']
  d.len.forEach((l, i) => {
    const h = (l * lam) / 2
    lines.push(`GW ${i + 1} ${segs} ${f(d.pos[i] * lam)} 0 ${f(-h)} ${f(d.pos[i] * lam)} 0 ${f(h)} ${f(a)}`)
  })
  lines.push('GE 0', 'EX 0 2 11 0 1 0', `FR 0 1 0 0 ${(freqHz / 1e6).toFixed(4)} 0`, 'RP 0 181 2 1000 0 0 1 180', 'EN')
  return lines.join('\n') + '\n'
}
