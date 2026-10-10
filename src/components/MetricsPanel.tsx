import type { Analysis } from '../lib/analysis'
import type { T } from '../i18n'

interface Props {
  a: Analysis
  boomUnit: string
  boomValue: string
  t: T
}

const swrClass = (swr: number) => (swr <= 1.5 ? 'ok-text' : swr <= 2.5 ? 'warn-text' : 'err-text')

export default function MetricsPanel({ a, boomUnit, boomValue, t }: Props) {
  const m = a.metrics
  const x = m.zi >= 0 ? '+' : '−'
  return (
    <div className="metrics">
      <div className="metric">
        <span className="metric-label">{t('Gain')}</span>
        <span className="metric-value">{m.gain.toFixed(2)} <small>dBi</small></span>
      </div>
      <div className="metric">
        <span className="metric-label">{t('Front-to-back')}</span>
        <span className="metric-value">{m.fb.toFixed(1)} <small>dB</small></span>
        <span className="metric-sub">{t('worst rear ±20°: {0} dB', m.fbWorst.toFixed(1))}</span>
      </div>
      <div className="metric">
        <span className="metric-label">SWR</span>
        <span className={`metric-value ${swrClass(m.swr)}`}>{Number.isFinite(m.swr) ? m.swr.toFixed(2) : '∞'}</span>
        <span className="metric-sub">{t('mismatch loss {0} dB', m.mismatch.toFixed(2))}</span>
      </div>
      <div className="metric">
        <span className="metric-label">{t('Feed impedance')}</span>
        <span className="metric-value">{m.zr.toFixed(1)} {x} j{Math.abs(m.zi).toFixed(1)} <small>Ω</small></span>
      </div>
      <div className="metric">
        <span className="metric-label">{t('Beamwidth (3 dB)')}</span>
        <span className="metric-value">
          {a.hpbwE === null ? '–' : a.hpbwE.toFixed(0)}° / {a.hpbwH === null ? '–' : a.hpbwH.toFixed(0)}°
        </span>
        <span className="metric-sub">{t('E-plane / H-plane')}</span>
      </div>
      <div className="metric">
        <span className="metric-label">{t('Boom length')}</span>
        <span className="metric-value">{boomValue} <small>{boomUnit}</small></span>
      </div>
    </div>
  )
}
