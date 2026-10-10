import { useState } from 'react'
import type { T } from '../i18n'
import { wavelength, type Design } from '../lib/analysis'
import { fmtLen, fromUnit, rows, toCsv, toNec, toUnit } from '../lib/export'
import type { Unit } from '../lib/model'
import NumInput from './NumInput'

interface Props {
  design: Design
  freqHz: number
  diameterM: number
  unit: Unit
  editable: boolean
  t: T
  onChange: (d: Design) => void
}

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function ElementTable({ design, freqHz, diameterM, unit, editable, t, onChange }: Props) {
  const [copied, setCopied] = useState(false)
  const lam = wavelength(freqHz)
  const rs = rows(design, freqHz)
  const digits = unit === 'mm' ? 1 : 3
  const roleName = (i: number, r: string) => (r === 'reflector' ? t('Reflector') : r === 'driven' ? t('Driven element') : t('Director {0}', i - 1))

  const setLen = (i: number, mUnit: number) => {
    const len = [...design.len]
    len[i] = fromUnit(mUnit, unit) / lam
    onChange({ ...design, len })
  }
  const setGap = (i: number, mUnit: number) => {
    const gaps = design.pos.map((p, j) => (j === 0 ? 0 : p - design.pos[j - 1]))
    gaps[i] = fromUnit(mUnit, unit) / lam
    const pos = [0]
    for (let j = 1; j < gaps.length; j++) pos.push(pos[j - 1] + gaps[j])
    onChange({ ...design, pos })
  }
  const u = unit === 'mm' ? t('mm') : t('in')
  const csv = () => toCsv(design, freqHz, unit)
  return (
    <div className="box">
      <div className="row">
        <h3 className="grow">{t('Elements')}</h3>
        <button className="small" onClick={() => download('yagi-elements.csv', csv(), 'text/csv')}>
          {t('Download CSV')}
        </button>
        <button className="small" onClick={() => download('yagi.nec', toNec(design, freqHz, diameterM), 'text/plain')}>
          {t('Download NEC2 deck')}
        </button>
        <button
          className="small"
          onClick={() => {
            void navigator.clipboard?.writeText(csv()).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? t('Copied') : t('Copy CSV')}
        </button>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('Element')}</th>
              <th>{t('Length ({0})', u)}</th>
              <th>{t('Half length ({0})', u)}</th>
              <th>{t('Spacing ({0})', u)}</th>
              <th>{t('Position ({0})', u)}</th>
            </tr>
          </thead>
          <tbody>
            {rs.map((r, i) => (
              <tr key={i} className={i === 1 ? 'active' : undefined}>
                <td>{r.index}</td>
                <td>{roleName(i, r.role)}</td>
                <td>
                  {editable ? (
                    <NumInput value={toUnit(r.length, unit)} digits={digits} min={0.001} max={1e6} label={t('Length ({0})', u)} onCommit={(v) => setLen(i, v)} />
                  ) : (
                    fmtLen(r.length, unit)
                  )}
                </td>
                <td>{fmtLen(r.half, unit)}</td>
                <td>
                  {i === 0 ? (
                    '–'
                  ) : editable ? (
                    <NumInput value={toUnit(r.gap, unit)} digits={digits} min={0.001} max={1e6} label={t('Spacing ({0})', u)} onCommit={(v) => setGap(i, v)} />
                  ) : (
                    fmtLen(r.gap, unit)
                  )}
                </td>
                <td>{fmtLen(r.pos, unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">{t('Lengths are tip to tip, measured between the element ends. Positions are from the reflector.')}</p>
    </div>
  )
}
