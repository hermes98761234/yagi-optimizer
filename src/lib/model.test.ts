import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, PRESETS, boundsOf, invalidFields, loadState } from './model'

describe('settings', () => {
  it('default settings are valid', () => {
    expect([...invalidFields(DEFAULT_SETTINGS)]).toEqual([])
  })
  it('flags inconsistent ranges and fat elements', () => {
    expect(invalidFields({ ...DEFAULT_SETTINGS, lenMin: 0.5, lenMax: 0.4 }).has('lenMin')).toBe(true)
    expect(invalidFields({ ...DEFAULT_SETTINGS, nEl: 1 }).has('nEl')).toBe(true)
    expect(invalidFields({ ...DEFAULT_SETTINGS, diameterMm: 500 }).has('diameterMm')).toBe(true)
  })
  it('every preset is valid and has an element count the app supports', () => {
    for (const p of PRESETS) {
      expect([...invalidFields({ ...DEFAULT_SETTINGS, freqMHz: p.freqMHz, nEl: p.nEl, diameterMm: p.diameterMm })], p.id).toEqual([])
    }
  })
  it('converts the maximum boom length to wavelengths', () => {
    const b = boundsOf({ ...DEFAULT_SETTINGS, freqMHz: 299.792458, maxBoomM: 2 })
    expect(b.maxBoom).toBeCloseTo(2, 6)
    expect(boundsOf(DEFAULT_SETTINGS).maxBoom).toBe(0)
  })
  it('falls back to defaults without storage', () => {
    const s = loadState()
    expect(s.design.len).toHaveLength(s.settings.nEl)
  })
})
