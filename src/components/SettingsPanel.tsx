import type { T } from '../i18n'
import { N } from '../i18n'
import { MM_PER_IN, PRESETS, type Detail, type Effort, type Settings } from '../lib/model'
import NumInput from './NumInput'

interface Props {
  s: Settings
  bad: Set<keyof Settings>
  locked: boolean
  t: T
  onChange: (patch: Partial<Settings>) => void
  onPreset: (id: string) => void
}

const EFFORT_LABEL: Record<Effort, string> = { quick: N('Quick'), normal: N('Normal'), thorough: N('Thorough') }
const DETAIL_LABEL: Record<Detail, string> = { fast: N('Fast'), normal: N('Normal'), fine: N('Fine') }
const FT = 0.3048

export default function SettingsPanel({ s, bad, locked, t, onChange, onPreset }: Props) {
  const imp = s.unit === 'in'
  const dia = imp ? s.diameterMm / MM_PER_IN : s.diameterMm
  const boom = imp ? s.maxBoomM / FT : s.maxBoomM
  const num = (key: keyof Settings, label: string, props: { min: number; max: number; step?: number; digits?: number }) => (
    <div className="field">
      <label htmlFor={`f-${key}`}>{label}</label>
      <NumInput id={`f-${key}`} value={s[key] as number} onCommit={(v) => onChange({ [key]: v })} bad={bad.has(key)} {...props} />
    </div>
  )
  const weight = (key: 'wGain' | 'wFb' | 'wMatch', label: string) => (
    <div className="field">
      <label htmlFor={`f-${key}`}>
        {label}: {s[key].toFixed(2)}
      </label>
      <input id={`f-${key}`} type="range" min={0} max={1} step={0.05} value={s[key]} onChange={(e) => onChange({ [key]: +e.target.value })} />
    </div>
  )
  return (
    <>
      <div className="section">
        <h3>{t('Antenna')}</h3>
        <div className="field">
          <label htmlFor="f-preset">{t('Load a preset')}</label>
          <select id="f-preset" value="" disabled={locked} onChange={(e) => e.target.value && onPreset(e.target.value)}>
            <option value="">{t('Choose…')}</option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {t(p.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid2">
          {num('freqMHz', t('Frequency (MHz)'), { min: 1, max: 10000, step: 0.1 })}
          {num('nEl', t('Elements'), { min: 2, max: 20, step: 1 })}
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="f-dia">{imp ? t('Element diameter (in)') : t('Element diameter (mm)')}</label>
            <NumInput
              id="f-dia"
              value={dia}
              digits={imp ? 3 : 2}
              min={0.001}
              max={20}
              bad={bad.has('diameterMm')}
              onCommit={(v) => onChange({ diameterMm: imp ? v * MM_PER_IN : v })}
            />
          </div>
          {num('z0', t('Reference impedance (Ω)'), { min: 1, max: 1000, step: 1 })}
        </div>
        <div className="field">
          <label htmlFor="f-feed">{t('Feed point')}</label>
          <select id="f-feed" value={s.zRatio} onChange={(e) => onChange({ zRatio: +e.target.value })}>
            <option value={1}>{t('Plain dipole (×1)')}</option>
            <option value={4}>{t('Folded dipole (×4)')}</option>
          </select>
        </div>
        {bad.has('diameterMm') && <p className="hint err-text">{t('The thin-wire model needs elements thinner than 5 % of a wavelength.')}</p>}
      </div>

      <div className="section">
        <h3>{t('Goals')}</h3>
        <p className="hint">{t('How much the optimizer cares about each. Match penalises mismatch loss against the reference impedance.')}</p>
        {weight('wGain', t('Forward gain'))}
        {weight('wFb', t('Front-to-back'))}
        {weight('wMatch', t('Impedance match'))}
      </div>

      <div className="section">
        <h3>{t('Limits')}</h3>
        <p className="hint">{t('Search ranges in wavelengths.')}</p>
        <div className="grid2">
          {num('lenMin', t('Element length min'), { min: 0.1, max: 0.9, step: 0.01 })}
          {num('lenMax', t('Element length max'), { min: 0.1, max: 0.9, step: 0.01 })}
          {num('gapMin', t('Spacing min'), { min: 0.01, max: 1, step: 0.01 })}
          {num('gapMax', t('Spacing max'), { min: 0.01, max: 1, step: 0.01 })}
        </div>
        <div className="field">
          <label htmlFor="f-boom">{imp ? t('Max boom length (ft, 0 = no limit)') : t('Max boom length (m, 0 = no limit)')}</label>
          <NumInput
            id="f-boom"
            value={boom}
            digits={3}
            min={0}
            max={1000}
            bad={bad.has('maxBoomM')}
            onCommit={(v) => onChange({ maxBoomM: imp ? v * FT : v })}
          />
        </div>
      </div>

      <div className="section">
        <h3>{t('Optimizer')}</h3>
        <div className="grid2">
          <div className="field">
            <label htmlFor="f-effort">{t('Effort')}</label>
            <select id="f-effort" value={s.effort} onChange={(e) => onChange({ effort: e.target.value as Effort })}>
              {(Object.keys(EFFORT_LABEL) as Effort[]).map((k) => (
                <option key={k} value={k}>
                  {t(EFFORT_LABEL[k])}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-detail">{t('Solver detail')}</label>
            <select id="f-detail" value={s.detail} onChange={(e) => onChange({ detail: e.target.value as Detail })}>
              {(Object.keys(DETAIL_LABEL) as Detail[]).map((k) => (
                <option key={k} value={k}>
                  {t(DETAIL_LABEL[k])}
                </option>
              ))}
            </select>
          </div>
          {num('popSize', t('Population'), { min: 10, max: 200, step: 5 })}
          {num('islands', t('Workers'), { min: 1, max: 8, step: 1 })}
        </div>
      </div>
    </>
  )
}
