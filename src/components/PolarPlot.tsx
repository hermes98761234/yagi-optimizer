import type { Cut } from '../lib/pattern'

export interface PolarSeries {
  label: string
  color: string
  cut: Cut
  dashed?: boolean
}

interface Props {
  title: string
  series: PolarSeries[]
  /** Direction labels. */
  front: string
  up: string
  hpbw: number | null
  hpbwLabel: string
}

const S = 300
const C = S / 2
const R = 118

export default function PolarPlot({ title, series, front, up, hpbw, hpbwLabel }: Props) {
  const maxG = Math.max(...series.flatMap((s) => s.cut.gain))
  const top = Math.ceil(maxG / 5) * 5
  const floor = top - 40
  const rad = (g: number) => (Math.max(floor, g) - floor) / (top - floor) * R
  const rings = [0, 10, 20, 30, 40].map((d) => top - d)
  const pt = (angle: number, g: number): string => {
    const a = (angle * Math.PI) / 180
    return `${(C + rad(g) * Math.cos(a)).toFixed(1)},${(C - rad(g) * Math.sin(a)).toFixed(1)}`
  }
  return (
    <figure className="polar">
      <figcaption>
        <strong>{title}</strong>
        {hpbw !== null && (
          <span className="muted">
            {' '}
            · {hpbwLabel} {hpbw.toFixed(0)}°
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={title}>
        {rings.map((g, i) => (
          <g key={g}>
            <circle cx={C} cy={C} r={rad(g)} className={i === 0 ? 'ring ring-outer' : 'ring'} />
            <text x={C + 3} y={C - rad(g) + 11} className="tick">
              {g.toFixed(0)}
            </text>
          </g>
        ))}
        {[0, 30, 60, 90, 120, 150].map((a) => (
          <line key={a} x1={C + R * Math.cos((a * Math.PI) / 180)} y1={C - R * Math.sin((a * Math.PI) / 180)} x2={C - R * Math.cos((a * Math.PI) / 180)} y2={C + R * Math.sin((a * Math.PI) / 180)} className="ring" />
        ))}
        {series.map((s) => (
          <polygon key={s.label} points={s.cut.angles.map((a, i) => pt(a, s.cut.gain[i])).join(' ')} fill={s.color} fillOpacity={s.dashed ? 0 : 0.14} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" />
        ))}
        <text x={S - 4} y={C + 4} textAnchor="end" className="axis-label">
          {front}
        </text>
        <text x={C + 4} y={12} className="axis-label">
          {up}
        </text>
      </svg>
      <div className="legend-row">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </figure>
  )
}
