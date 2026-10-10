import type { Design } from '../lib/analysis'

interface Props {
  design: Design
  labels: string[]
  aria: string
}

const W = 800
const M = 26

/** Side view of the antenna to scale: the boom runs left to right (forward = right), the elements are vertical. */
export default function BoomView({ design, labels, aria }: Props) {
  const boom = design.pos[design.pos.length - 1]
  const maxLen = Math.max(...design.len)
  const scale = Math.min((W - 2 * M) / Math.max(boom, 0.01), 220 / maxLen)
  const H = Math.round(maxLen * scale + 2 * M + 24)
  const x0 = (W - boom * scale) / 2
  const cy = M + (maxLen * scale) / 2
  const minGap = Math.min(...design.pos.slice(1).map((p, i) => (p - design.pos[i]) * scale))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="boom" role="img" aria-label={aria}>
      <line x1={x0 - 16} x2={x0 + boom * scale + 16} y1={cy} y2={cy} className="boom-line" />
      {design.len.map((l, i) => {
        const x = x0 + design.pos[i] * scale
        const h = (l * scale) / 2
        const cls = i === 1 ? 'el el-driven' : i === 0 ? 'el el-refl' : 'el'
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={cy - h} y2={cy + h} className={cls} />
            {i === 1 && <circle cx={x} cy={cy} r={4} className="feed" />}
            {(minGap > 22 || i < 2 || i === design.len.length - 1) && (
              <text x={x} y={cy + (maxLen * scale) / 2 + 18} textAnchor="middle" className="tick">
                {labels[i]}
              </text>
            )}
          </g>
        )
      })}
      <path d={`M${W - 70} ${H - 8} h52 m-8 -5 l8 5 l-8 5`} className="arrow" />
    </svg>
  )
}
