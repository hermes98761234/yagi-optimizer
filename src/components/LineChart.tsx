export interface Series {
  label: string
  color: string
  points: [number, number][]
  dashed?: boolean
}

interface Props {
  series: Series[]
  xLabel: string
  yLabel: string
  /** Fixed y range; otherwise fitted to the data. */
  yMin?: number
  yMax?: number
  xFmt?: (x: number) => string
  yFmt?: (y: number) => string
  /** Vertical marker (e.g. the design frequency). */
  markX?: number
  height?: number
  empty?: string
}

const W = 420
const PAD = { l: 44, r: 10, t: 10, b: 34 }

function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo || 1
  const raw = span / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const f = raw / mag
  const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(10))
  return out
}

export default function LineChart({ series, xLabel, yLabel, yMin, yMax, xFmt = String, yFmt = String, markX, height = 220, empty }: Props) {
  const pts = series.flatMap((s) => s.points).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  if (pts.length < 2) return <div className="chart-empty" style={{ height }}>{empty}</div>
  let x0 = Math.min(...pts.map((p) => p[0]))
  let x1 = Math.max(...pts.map((p) => p[0]))
  if (x1 === x0) x1 = x0 + 1
  let y0 = yMin ?? Math.min(...pts.map((p) => p[1]))
  let y1 = yMax ?? Math.max(...pts.map((p) => p[1]))
  if (y1 - y0 < 1e-9) {
    y0 -= 0.5
    y1 += 0.5
  } else if (yMin === undefined || yMax === undefined) {
    const pad = (y1 - y0) * 0.08
    if (yMin === undefined) y0 -= pad
    if (yMax === undefined) y1 += pad
  }
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const X = (x: number) => PAD.l + ((x - x0) / (x1 - x0)) * iw
  const Y = (y: number) => PAD.t + (1 - (Math.min(y1, Math.max(y0, y)) - y0) / (y1 - y0)) * ih
  const xt = niceTicks(x0, x1, 5)
  const yt = niceTicks(y0, y1, 4)
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="chart" role="img" aria-label={`${yLabel} / ${xLabel}`}>
      {yt.map((v) => (
        <g key={`y${v}`}>
          <line x1={PAD.l} x2={W - PAD.r} y1={Y(v)} y2={Y(v)} className="grid-line" />
          <text x={PAD.l - 5} y={Y(v) + 4} textAnchor="end" className="tick">
            {yFmt(v)}
          </text>
        </g>
      ))}
      {xt.map((v) => (
        <g key={`x${v}`}>
          <line x1={X(v)} x2={X(v)} y1={PAD.t} y2={PAD.t + ih} className="grid-line" />
          <text x={X(v)} y={PAD.t + ih + 14} textAnchor="middle" className="tick">
            {xFmt(v)}
          </text>
        </g>
      ))}
      <rect x={PAD.l} y={PAD.t} width={iw} height={ih} className="plot-frame" />
      {markX !== undefined && markX >= x0 && markX <= x1 && <line x1={X(markX)} x2={X(markX)} y1={PAD.t} y2={PAD.t + ih} className="mark-line" />}
      {series.map((s) => (
        <polyline
          key={s.label}
          fill="none"
          stroke={s.color}
          strokeWidth={2}
          strokeDasharray={s.dashed ? '5 4' : undefined}
          strokeLinejoin="round"
          points={s.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')}
        />
      ))}
      <text x={PAD.l + iw / 2} y={height - 4} textAnchor="middle" className="axis-label">
        {xLabel}
      </text>
      <text transform={`translate(11 ${PAD.t + ih / 2}) rotate(-90)`} textAnchor="middle" className="axis-label">
        {yLabel}
      </text>
      <g transform={`translate(${PAD.l + 8} ${PAD.t + 12})`}>
        {series.map((s, i) => (
          <g key={s.label} transform={`translate(${i * 110} 0)`}>
            <line x1={0} x2={16} y1={-4} y2={-4} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} />
            <text x={20} y={0} className="legend">
              {s.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}
