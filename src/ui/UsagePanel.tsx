import type { CallPhase, UsageSnapshot } from '../sim/usage'

interface Props {
  usage: UsageSnapshot | null
}

const PHASE_LABEL: Record<CallPhase, string> = {
  feel: '感受',
  think: '思考',
  act: '行动',
  summary: '总结',
}

/** 模型消耗仪表盘：总量、按阶段、按回合。 */
export function UsagePanel({ usage }: Props) {
  if (!usage || usage.calls === 0) {
    return (
      <div className="inspector-body">
        <div className="muted">还没有模型调用。</div>
        <div className="muted footnote">
          独立开发页没有宿主模型通道，会使用确定性思考层；在 dsh 中打开并运行回合即可看到用量。
        </div>
      </div>
    )
  }
  return (
    <div className="inspector-body">
      <div className="usage-grid">
        <div className="usage-cell"><span className="usage-num">{usage.calls}</span><span className="dim">调用</span></div>
        <div className="usage-cell"><span className="usage-num">{usage.total}</span><span className="dim">tokens</span></div>
        <div className="usage-cell"><span className={usage.errors > 0 ? 'usage-num bad' : 'usage-num'}>{usage.errors}</span><span className="dim">错误</span></div>
      </div>

      <div className="kv-row"><span className="kv-key">输入</span><span className="kv-value">{usage.input}</span></div>
      <div className="kv-row"><span className="kv-key">输出</span><span className="kv-value">{usage.output}</span></div>
      <div className="kv-row"><span className="kv-key">缓存命中</span><span className="kv-value">{usage.cacheRead}</span></div>

      <div className="section-label">按阶段</div>
      {usage.byPhase.map(item => (
        <div className="kv-row" key={item.phase}>
          <span className="kv-key">{PHASE_LABEL[item.phase]}</span>
          <span className="kv-value">{item.calls} 次 · {item.input + item.output}</span>
        </div>
      ))}

      <div className="section-label">按回合</div>
      {usage.byRound.slice(-12).reverse().map(item => (
        <div className="kv-row" key={item.round}>
          <span className="kv-key">R{item.round}</span>
          <span className="kv-value">{item.calls} 次 · {item.input + item.output}</span>
        </div>
      ))}

      {usage.last?.error && (
        <>
          <div className="section-label">最近错误</div>
          <div className="muted">{usage.last.error}</div>
        </>
      )}

      <div className="muted footnote">
        每轮最多 2 个角色走模型（感受 + 思考 + 行动），其余回落确定性思考层；每轮另有 1 次异步总结。
      </div>
    </div>
  )
}
