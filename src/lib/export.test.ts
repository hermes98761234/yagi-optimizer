import { describe, expect, it } from 'vitest'
import { classicDesign } from './analysis'
import { fmtLen, fromUnit, rows, toCsv, toNec, toUnit } from './export'
import { C0 } from './mom'

describe('export', () => {
  const d = classicDesign(5)
  const f = 144e6
  it('converts units both ways', () => {
    expect(toUnit(0.0254, 'in')).toBeCloseTo(1, 9)
    expect(fromUnit(toUnit(1.234, 'mm'), 'mm')).toBeCloseTo(1.234, 12)
    expect(fmtLen(1, 'mm')).toBe('1000.0')
  })
  it('lists elements in metres from the wavelength', () => {
    const r = rows(d, f)
    expect(r).toHaveLength(5)
    expect(r[1].role).toBe('driven')
    expect(r[1].length).toBeCloseTo(0.47 * (C0 / f), 9)
    expect(r[2].gap).toBeCloseTo(0.15 * (C0 / f), 9)
  })
  it('writes a CSV with a header and one row per element', () => {
    const lines = toCsv(d, f, 'mm').trim().split('\n')
    expect(lines[0]).toBe('element,role,length_mm,half_length_mm,position_mm,spacing_mm')
    expect(lines).toHaveLength(6)
    expect(lines[1].startsWith('1,reflector,')).toBe(true)
  })
  it('writes a NEC2 deck with one wire per element and the feed on the driven element', () => {
    const nec = toNec(d, f, 0.008)
    expect(nec.match(/^GW /gm)).toHaveLength(5)
    expect(nec).toContain('EX 0 2 11 0 1 0')
    expect(nec.trim().endsWith('EN')).toBe(true)
  })
})
