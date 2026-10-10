import { N } from '../i18n'
import { classicDesign, type Bounds, type Design, type Env, type Weights } from './analysis'

export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'
export type Unit = 'mm' | 'in'
export type Effort = 'quick' | 'normal' | 'thorough'
export type Detail = 'fast' | 'normal' | 'fine'

export interface Settings {
  lang: Lang
  theme: Theme
  unit: Unit
  freqMHz: number
  nEl: number
  /** Element diameter in millimetres. */
  diameterMm: number
  z0: number
  /** 1 = plain dipole, 4 = folded dipole. */
  zRatio: number
  wGain: number
  wFb: number
  wMatch: number
  lenMin: number
  lenMax: number
  gapMin: number
  gapMax: number
  /** Maximum boom length in metres (0 = unlimited). */
  maxBoomM: number
  effort: Effort
  detail: Detail
  popSize: number
  islands: number
}

export interface AppState {
  settings: Settings
  design: Design
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'en',
  theme: 'auto',
  unit: 'mm',
  freqMHz: 144.2,
  nEl: 5,
  diameterMm: 8,
  z0: 50,
  zRatio: 1,
  wGain: 1,
  wFb: 0.3,
  wMatch: 0.5,
  lenMin: 0.3,
  lenMax: 0.56,
  gapMin: 0.04,
  gapMax: 0.45,
  maxBoomM: 0,
  effort: 'normal',
  detail: 'normal',
  popSize: 40,
  islands: defaultIslands(),
}

function defaultIslands(): number {
  const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
  return Math.max(1, Math.min(4, hc - 1))
}

export const GENERATIONS: Record<Effort, number> = { quick: 30, normal: 80, thorough: 200 }
export const SEGMENTS: Record<Detail, number> = { fast: 8, normal: 12, fine: 16 }
/** Segments per element for the analysis shown on screen (more accurate than the search). */
export const DISPLAY_SEGMENTS = 24
export const SWEEP_SEGMENTS = 12

export const MM_PER_IN = 25.4

export interface Preset {
  id: string
  name: string
  freqMHz: number
  nEl: number
  diameterMm: number
}

export const PRESETS: Preset[] = [
  { id: '3-2m', name: N('3 elements, 2 m (144.2 MHz)'), freqMHz: 144.2, nEl: 3, diameterMm: 8 },
  { id: '5-2m', name: N('5 elements, 2 m (144.2 MHz)'), freqMHz: 144.2, nEl: 5, diameterMm: 8 },
  { id: '9-2m', name: N('9 elements, 2 m (144.2 MHz)'), freqMHz: 144.2, nEl: 9, diameterMm: 8 },
  { id: '7-70', name: N('7 elements, 70 cm (432.2 MHz)'), freqMHz: 432.2, nEl: 7, diameterMm: 5 },
  { id: '12-70', name: N('12 elements, 70 cm (432.2 MHz)'), freqMHz: 432.2, nEl: 12, diameterMm: 5 },
  { id: '4-10m', name: N('4 elements, 10 m (28.5 MHz)'), freqMHz: 28.5, nEl: 4, diameterMm: 25 },
  { id: '5-6m', name: N('5 elements, 6 m (50.2 MHz)'), freqMHz: 50.2, nEl: 5, diameterMm: 16 },
  { id: '3-20m', name: N('3 elements, 20 m (14.2 MHz)'), freqMHz: 14.2, nEl: 3, diameterMm: 30 },
  { id: '8-noaa', name: N('8 elements, 137 MHz weather satellites'), freqMHz: 137.5, nEl: 8, diameterMm: 6 },
  { id: '10-wifi', name: N('10 elements, 2.4 GHz Wi-Fi'), freqMHz: 2437, nEl: 10, diameterMm: 2 },
]

export function envOf(s: Settings, segs: number): Env {
  return { freqHz: s.freqMHz * 1e6, diameter: s.diameterMm / 1000, z0: s.z0, zRatio: s.zRatio, segs }
}

export function weightsOf(s: Settings): Weights {
  return { gain: s.wGain, fb: s.wFb, match: s.wMatch }
}

export function boundsOf(s: Settings): Bounds {
  const lam = 299_792_458 / (s.freqMHz * 1e6)
  return { lenMin: s.lenMin, lenMax: s.lenMax, gapMin: s.gapMin, gapMax: s.gapMax, maxBoom: s.maxBoomM > 0 ? s.maxBoomM / lam : 0 }
}

const RANGES: Partial<Record<keyof Settings, [number, number]>> = {
  freqMHz: [1, 10000],
  nEl: [2, 20],
  diameterMm: [0.1, 200],
  z0: [1, 1000],
  wGain: [0, 1],
  wFb: [0, 1],
  wMatch: [0, 1],
  lenMin: [0.1, 0.9],
  lenMax: [0.1, 0.9],
  gapMin: [0.01, 1],
  gapMax: [0.01, 1],
  maxBoomM: [0, 1000],
  popSize: [10, 200],
  islands: [1, 8],
}

/** Fields that are out of range or inconsistent, for highlighting. */
export function invalidFields(s: Settings): Set<keyof Settings> {
  const bad = new Set<keyof Settings>()
  for (const [k, [lo, hi]] of Object.entries(RANGES) as [keyof Settings, [number, number]][]) {
    const v = s[k]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) bad.add(k)
  }
  if (s.lenMin >= s.lenMax) {
    bad.add('lenMin')
    bad.add('lenMax')
  }
  if (s.gapMin >= s.gapMax) {
    bad.add('gapMin')
    bad.add('gapMax')
  }
  // The thin-wire kernel needs elements much thinner than a wavelength.
  const lam = 299_792_458 / (s.freqMHz * 1e6)
  if (s.diameterMm / 1000 > 0.05 * lam) bad.add('diameterMm')
  return bad
}

export function defaultState(): AppState {
  return { settings: DEFAULT_SETTINGS, design: classicDesign(DEFAULT_SETTINGS.nEl) }
}

const KEY = 'yagi-optimizer:v1'

export function loadState(): AppState {
  const fresh = defaultState()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fresh
    const p = JSON.parse(raw) as Partial<AppState>
    const settings: Settings = { ...DEFAULT_SETTINGS }
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const v = p.settings?.[k]
      if (typeof v === typeof DEFAULT_SETTINGS[k]) (settings[k] as unknown) = v
    }
    const d = p.design
    const ok =
      d &&
      Array.isArray(d.len) &&
      Array.isArray(d.pos) &&
      d.len.length === settings.nEl &&
      d.pos.length === settings.nEl &&
      [...d.len, ...d.pos].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
      d.len.every((v) => v > 0.05 && v < 1.5) &&
      d.pos.every((v, i) => i === 0 ? v === 0 : v > d.pos[i - 1] + 0.005)
    return { settings, design: ok ? { len: d.len, pos: d.pos } : classicDesign(settings.nEl) }
  } catch {
    return fresh
  }
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage may be full or blocked; the app still works without persistence
  }
}
