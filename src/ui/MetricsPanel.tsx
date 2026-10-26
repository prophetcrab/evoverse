import type { MetricPoint } from '../sim/metrics'
import { concludeMetrics } from '../sim/metrics'

interface Props {
  points: MetricPoint[]
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
const fixed = (value: number): string => (value >= 10 ? Math.round(value).toString() : value.toFixed(2))
const percent = (value: number): string => `${Math.round(value * 100)}%`

function Spark({ values }: { values: number[] }) {
  const data = values.length > 0 ? values : [0]
  const width = 112
  const height = 28
  const pad = 3
  const lo = Math.min(...data)
  const hi = Math.max(...data)
  const span = hi - lo || 1
  const points = data.map((value, index) => {
    const x = pad + (index / Math.max(1, data.length - 1)) * (width - pad * 2)
    const y = height - pad - ((value - lo) / span) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function Metric({ label, value, hint, series }: { label: string; value: string; hint?: string; series: number[] }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <span className="metric-value">{value}</span>
      </div>
      <Spark values={series} />
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  )
}

function PhasePlane({ points }: { points: MetricPoint[] }) {
  const width = 320
  const height = 190
  const pad = 26
  const px = (value: number): number => pad + clamp01(value) * (width - pad * 2)
  const py = (value: number): number => height - pad - clamp01(value) * (height - pad * 2)
  const trail = points.slice(-30)
  const path = trail.map(point => `${px(point.potential).toFixed(1)},${py(point.activity).toFixed(1)}`).join(' ')
  const latest = trail[trail.length - 1]
  return (
    <svg className="phase-plane" viewBox={`0 0 ${width} ${height}`}>
      <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill="rgba(255,255,255,0.015)" stroke="rgba(255,255,255,0.08)" />
      <line x1={px(0.33)} y1={pad} x2={px(0.33)} y2={height - pad} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />
      <line x1={pad} y1={py(0.33)} x2={width - pad} y2={py(0.33)} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />
      <text x={pad + 4} y={height - pad - 4} className="plane-label">热寂</text>
      <text x={width - pad - 4} y={height - pad - 4} textAnchor="end" className="plane-label">停滞</text>
      <text x={pad + 4} y={pad + 12} className="plane-label">空转</text>
      <text x={width - pad - 4} y={pad + 12} textAnchor="end" className="plane-label">演进</text>
      <polyline points={path} fill="none" stroke="#4aa3ff" strokeWidth="1.4" strokeOpacity="0.55" />
      {latest && (
        <g>
          <circle cx={px(latest.potential)} cy={py(latest.activity)} r="4" fill="#ffd166" />
          <text x={px(latest.potential) + 7} y={py(latest.activity) - 6} className="plane-round">R{latest.round}</text>
        </g>
      )}
      <text x={width / 2} y={height - 6} textAnchor="middle" className="plane-axis">信息势 V̄</text>
      <text x={10} y={height / 2} textAnchor="middle" transform={`rotate(-90 10 ${height / 2})`} className="plane-axis">活动</text>
    </svg>
  )
}

/** 数学观测面板：八个度量、相平面与自动结论。 */
export function MetricsPanel({ points }: Props) {
  if (points.length === 0) {
    return (
      <div className="inspector-body">
        <div className="muted">还没有观测数据。运行一轮后，这里会出现八个世界度量与相平面。</div>
      </div>
    )
  }
  const latest = points[points.length - 1]
  const conclusions = concludeMetrics(points)

  return (
    <div className="inspector-body metrics-body">
      <div className="section-label">相平面 · 信息势 × 活动</div>
      <PhasePlane points={points} />

      <div className="metrics-grid">
        <Metric label="信息势" value={fixed(latest.potential)} series={points.map(point => point.potential)} hint="注意力加权的知识差" />
        <Metric label="活动率" value={percent(latest.activity)} series={points.map(point => point.activity)} hint="人均行动数" />
        <Metric label="主题熵" value={fixed(latest.topicEntropy)} series={points.map(point => point.topicEntropy)} hint="知识广度" />
        <Metric label="版本熵" value={fixed(latest.versionEntropy)} series={points.map(point => point.versionEntropy)} hint="说法分化" />
        <Metric label="认知冲突" value={String(latest.conflicts)} series={points.map(point => point.conflicts)} hint="自相矛盾的处数" />
        <Metric label="谣言穿透" value={percent(latest.penetration)} series={points.map(point => point.penetration)} hint="持有人占比" />
        <Metric label="共识度" value={percent(latest.consensus)} series={points.map(point => point.consensus)} hint="最大派系占比" />
        <Metric label="空间熵" value={fixed(latest.spatialEntropy)} series={points.map(point => point.spatialEntropy)} hint="信息摊开程度" />
        <Metric label="场质量" value={fixed(latest.fieldMass)} series={points.map(point => point.fieldMass)} hint="空间信息总强度" />
        <Metric label="枢纽影响力" value={latest.hub ? percent(latest.influence) : '—'} series={points.map(point => point.influence)} hint={latest.hub ?? '暂无来源'} />
      </div>

      <div className="section-label">结论</div>
      {conclusions.map(line => (
        <div className="conclusion" key={line}>{line}</div>
      ))}

      <div className="section-label">逐轮读数</div>
      <div className="metric-table">
        <div className="metric-table-head">
          <span>R</span><span>V̄</span><span>活动</span><span>版本熵</span><span>冲突</span>
        </div>
        {points.slice(-8).reverse().map(point => (
          <div className="metric-table-row" key={point.round}>
            <span>{point.round}</span>
            <span>{fixed(point.potential)}</span>
            <span>{percent(point.activity)}</span>
            <span>{fixed(point.versionEntropy)}</span>
            <span>{point.conflicts}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
