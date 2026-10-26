import type { World } from '../world/types'
import type { SimView } from '../sim/types'

interface Props {
  sim: SimView | null
  world: World
  onSelect: (id: string) => void
}

function NeedBar({ label, value }: { label: string; value: number }) {
  return (
    <span className="need">
      <span className="need-label">{label}</span>
      <span className="need-track"><i style={{ width: `${Math.min(100, value / 10)}%` }} /></span>
      <span className="need-value">{Math.round(value)}</span>
    </span>
  )
}

/** 角色总览：一屏看完所有人的状态、位置与最近行动。 */
export function OverviewPanel({ sim, world, onSelect }: Props) {
  if (!sim) {
    return <div className="inspector-body"><div className="muted">还没有仿真数据，先运行一轮。</div></div>
  }
  const eventCount = sim.records.reduce((sum, record) => sum + record.events.length, 0)
  return (
    <div className="inspector-body">
      <div className="section-label">世界</div>
      <div className="kv-row"><span className="kv-key">回合</span><span className="kv-value">{sim.round}</span></div>
      <div className="kv-row"><span className="kv-key">本轮行动</span><span className="kv-value">{sim.activity}</span></div>
      <div className="kv-row"><span className="kv-key">张力</span><span className="kv-value">{Math.round(sim.tension)}</span></div>
      <div className="kv-row"><span className="kv-key">空间信息</span><span className="kv-value">{world.info.length}</span></div>
      <div className="kv-row"><span className="kv-key">累计事件</span><span className="kv-value">{eventCount}</span></div>
      <div className="kv-row"><span className="kv-key">回合记录</span><span className="kv-value">{sim.records.length}</span></div>

      <div className="section-label">角色 · {sim.characters.length}</div>
      {sim.characters.map(character => (
        <button
          key={character.id}
          type="button"
          className="roster-row"
          onClick={() => onSelect(character.id)}
        >
          <span className="dot" style={{ background: character.tint }} />
          <span className="roster-main">
            <span className="roster-top">
              <strong>{character.name}</strong>
              <span className="dim">{character.lastAction ?? '待机'}</span>
            </span>
            <span className="roster-meta">
              层 {character.pos.layer} · ({character.pos.x}, {character.pos.y}) · 生命 {character.vitals.hp}/5 · 记忆 {character.memory.length}
              {character.status === 'dead' ? ' · 死亡' : character.status !== 'active' ? ' · 倒下' : ''}
            </span>
            <span className="roster-meta">
              能力 {character.ability.name} · {character.ability.state} · 负荷 {character.ability.charge}
            </span>
            <span className="roster-needs">
              <NeedBar label="安" value={character.needs.safety} />
              <NeedBar label="位" value={character.needs.status} />
              <NeedBar label="奇" value={character.needs.curiosity} />
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
