import type { Channel, World } from '../world/types'
import { cellIndex, cellAt } from '../world/types'
import { CHANNEL_LABEL, STAIR_LABEL, TERRAIN_LABEL, permeabilityOf } from '../world/terrain'
import type { Selection } from './types'
import type { RoundRecord, SimView } from '../sim/types'
import type { Stance } from '../sim/types'

interface Props {
  world: World
  layer: number
  field: Float32Array | null
  channel: Channel | null
  selected: Selection | null
  sim: SimView | null
  records: RoundRecord[] | null
}

const pct = (value: number) => `${Math.round(value * 100)}%`

const STANCE_CLASS: Record<Stance, string> = {
  亲近: 'close',
  中立: 'neutral',
  戒备: 'wary',
  敌意: 'hostile',
  畏惧: 'afraid',
}

const ABILITY_CLASS: Record<string, string> = {
  稳定: 'stable',
  亢进: 'over',
  暴走: 'rampage',
  封印: 'sealed',
}

function Hp({ hp }: { hp: number }) {
  return (
    <span className="hp">
      {Array.from({ length: 5 }, (_, index) => (
        <i key={index} className={index < hp ? 'on' : ''} />
      ))}
      <span className="hp-text">{hp}/5</span>
    </span>
  )
}
const strengthLabel = (value: number) => {
  if (value >= 300) return `${Math.round(value)} · 可辨认`
  if (value >= 50) return `${Math.round(value)} · 可察觉`
  return `${Math.round(value)} · 无`
}

export function Inspector({ world, layer, field, channel, selected, sim, records }: Props) {
  if (selected?.kind === 'character') {
    const character = world.characters.find(ch => ch.id === selected.id)
    if (!character) return <Empty />
    const simChar = sim?.characters.find(item => item.id === character.id)
    const nameOf = (id: string): string => world.characters.find(item => item.id === id)?.name ?? id
    const cell = cellAt(world, character.pos)
    const zone = cell.zone ? world.zones?.[cell.zone] : undefined
    const value = field ? field[cellIndex(world, character.pos)] : null
    const nearby = world.info
      .filter(entry => entry.origin.layer === character.pos.layer)
      .map(entry => ({
        entry,
        distance: Math.max(Math.abs(entry.origin.x - character.pos.x), Math.abs(entry.origin.y - character.pos.y)),
      }))
      .filter(item => item.distance <= 12)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)

    return (
      <div className="inspector-body">
        <div className="inspector-title">
          <span className="dot" style={{ background: character.tint }} />
          <strong>{character.name}</strong>
          <span className={`tag ${character.controller}`}>{character.controller === 'agent' ? '真实会话' : '模拟'}</span>
        </div>
        <Row label="位置" value={`层 ${character.pos.layer} · (${character.pos.x}, ${character.pos.y})`} />
        <Row label="先手" value={String(character.initiative)} />
        {simChar && (
          <div className="kv-row">
            <span className="kv-key">生命</span>
            <span className="kv-value"><Hp hp={simChar.vitals.hp} /></span>
          </div>
        )}
        {simChar && (
          <>
            <div className="kv-row">
              <span className="kv-key">能力</span>
              <span className="kv-value">{simChar.ability.name} · L{simChar.ability.level}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">能力状态</span>
              <span className="kv-value">
                <span className={`ability-state state-${ABILITY_CLASS[simChar.ability.state] ?? 'stable'}`}>
                  {simChar.ability.state}
                </span>
                <span className="charge"><i style={{ width: `${simChar.ability.charge}%` }} /></span>
                <span className="hp-text">{simChar.ability.charge}</span>
              </span>
            </div>
            <div className="muted ability-note">
              {simChar.ability.description}
              {simChar.ability.limit ? `（${simChar.ability.limit}）` : ''}
            </div>
          </>
        )}
        <Row label="所在" value={zone?.name ?? `层 ${character.pos.layer}`} />
        <Row label="脚下" value={`${TERRAIN_LABEL[cell.terrain]}${cell.stair ? ` · 楼梯 ${STAIR_LABEL[cell.stair.state]}` : ''}`} />
        {value !== null && <Row label={channel ? `${CHANNEL_LABEL[channel]}强度` : '强度'} value={strengthLabel(value)} />}

        <div className="section-label">附近信息 · 12 格内</div>
        {nearby.length === 0 && <div className="muted">无</div>}
        {nearby.map(item => (
          <div className="info-row" key={item.entry.id}>
            <span className={`chan-dot ${item.entry.channel}`} />
            <span className="info-label">{item.entry.label}</span>
            <span className="dim">{CHANNEL_LABEL[item.entry.channel]} · {item.distance} 格</span>
          </div>
        ))}

        {simChar && (
          <>
            <div className="section-label">携带</div>
            {simChar.inventory.length === 0 && <div className="muted">空手</div>}
            {simChar.inventory.map(id => {
              const item = world.items?.find(entry => entry.id === id)
              if (!item) return null
              return (
                <div className="info-row" key={item.id} title={item.description}>
                  <span className="info-label">{item.name}</span>
                  <span className="dim">{item.kind}</span>
                </div>
              )
            })}

            {simChar.statuses.length > 0 && (
              <>
                <div className="section-label">状态</div>
                {simChar.statuses.map(status => (
                  <div className="info-row" key={`${status.kind}-${status.until}`}>
                    <span className="info-label">{status.kind}</span>
                    <span className="dim">至 R{status.until}</span>
                  </div>
                ))}
              </>
            )}

            <div className="section-label">需求</div>
            <Row label="安全" value={String(Math.round(simChar.needs.safety))} />
            <Row label="地位" value={String(Math.round(simChar.needs.status))} />
            <Row label="好奇" value={String(Math.round(simChar.needs.curiosity))} />

            <div className="section-label">对他人的态度</div>
            {Object.entries(simChar.attitudes).map(([id, attitude]) => (
              <div className="attitude-row" key={id}>
                <span className="attitude-name">{nameOf(id)}</span>
                <span className={`stance stance-${STANCE_CLASS[attitude.stance]}`}>{attitude.stance}</span>
                <span className="attitude-text">{attitude.text}</span>
              </div>
            ))}
            {Object.keys(simChar.attitudes).length === 0 && <div className="muted">无</div>}

            <div className="section-label">目标</div>
            {simChar.goals.length === 0 && <div className="muted">无</div>}
            {simChar.goals.map(goal => (
              <div className="info-row" key={goal.id}>
                <span className="info-label">{goal.text}</span>
                <span className={`dim goal-${goal.status}`}>{goal.status}</span>
              </div>
            ))}

            {simChar.memory.some(entry => entry.infoId.startsWith('creed-')) && (
              <>
                <div className="section-label">信条与世界观</div>
                {simChar.memory
                  .filter(entry => entry.infoId.startsWith('creed-'))
                  .map(entry => (
                    <div className="memory-row" key={entry.versionId} title={entry.content}>
                      <span className="memory-text">{entry.content}</span>
                    </div>
                  ))}
              </>
            )}

            <div className="section-label">记忆 · {simChar.memory.length} 条</div>
            {simChar.memory.slice(-4).reverse().map(entry => (
              <div className="memory-row" key={entry.versionId} title={entry.content}>
                <span className={`prov prov-${entry.provenance}`}>{entry.provenance}</span>
                <span className="memory-text">{entry.content}</span>
              </div>
            ))}

            <div className="section-label">上一轮</div>
            {simChar.lastThought && <div className="muted">想法：{simChar.lastThought}</div>}
            {simChar.lastAction && <div className="muted">行动：{simChar.lastAction}</div>}
            {simChar.lastDigest.map((line, index) => (
              <div className="muted" key={`${index}-${line}`}>{line}</div>
            ))}
          </>
        )}
      </div>
    )
  }

  if (selected?.kind === 'cell') {
    const cell = cellAt(world, selected.at)
    const zone = cell.zone ? world.zones?.[cell.zone] : undefined
    const permeability = permeabilityOf(cell)
    const value = field ? field[cellIndex(world, selected.at)] : null
    const occupants = world.characters.filter(
      ch => ch.pos.layer === selected.at.layer && ch.pos.x === selected.at.x && ch.pos.y === selected.at.y,
    )
    return (
      <div className="inspector-body">
        <div className="inspector-title">
          <strong>格子 ({selected.at.x}, {selected.at.y})</strong>
          <span className="tag">层 {selected.at.layer}</span>
        </div>
        <Row label="位置" value={zone?.name ?? '未分区'} />
        {zone?.note && <div className="muted zone-note">{zone.note}</div>}
        <Row label="地形" value={TERRAIN_LABEL[cell.terrain]} />
        {cell.stair && <Row label="楼梯" value={`${STAIR_LABEL[cell.stair.state]} → 层 ${cell.stair.to}`} />}
        <Row label="通行" value={permeability.move > 0 ? '是' : '否'} />
        <Row label="透光" value={pct(permeability.opacity)} />
        <Row label="传声" value={pct(permeability.acoustic)} />
        <Row label="传味" value={pct(permeability.scent)} />
        {value !== null && <Row label={channel ? `${CHANNEL_LABEL[channel]}强度` : '强度'} value={strengthLabel(value)} />}
        <div className="section-label">在场</div>
        {occupants.length === 0 && <div className="muted">无人</div>}
        {occupants.map(ch => (
          <div className="info-row" key={ch.id}>
            <span className="dot" style={{ background: ch.tint }} />
            <span className="info-label">{ch.name}</span>
            <span className="dim">{ch.controller}</span>
          </div>
        ))}

        <div className="section-label">地上物品</div>
        {((world.items ?? []).filter(item => !item.holder && !item.container && item.at
          && item.at.layer === selected.at.layer && item.at.x === selected.at.x && item.at.y === selected.at.y)).length === 0
          && <div className="muted">无</div>}
        {(world.items ?? []).filter(item => !item.holder && !item.container && item.at
          && item.at.layer === selected.at.layer && item.at.x === selected.at.x && item.at.y === selected.at.y)
          .map(item => (
            <div className="info-row" key={item.id} title={item.description}>
              <span className="info-label">{item.name}</span>
              <span className="dim">{item.kind}</span>
            </div>
          ))}

        <div className="section-label">设施</div>
        {((world.fixtures ?? []).filter(fixture => fixture.at.layer === selected.at.layer
          && fixture.at.x === selected.at.x && fixture.at.y === selected.at.y)).length === 0
          && <div className="muted">无</div>}
        {(world.fixtures ?? []).filter(fixture => fixture.at.layer === selected.at.layer
          && fixture.at.x === selected.at.x && fixture.at.y === selected.at.y)
          .map(fixture => {
            const contents = (world.items ?? []).filter(item => item.container === fixture.id)
            const open = fixture.state === 'open' || fixture.state === 'broken'
            return (
              <div className="info-row" key={fixture.id} title={fixture.description}>
                <span className="info-label">{fixture.name}</span>
                <span className="dim">{fixture.kind} · {fixture.state}{open && contents.length > 0 ? ` · ${contents.map(item => item.name).join('、')}` : ''}</span>
              </div>
            )
          })}

        {(() => {
          const record = records && records.length > 0 ? records[records.length - 1] : null
          const same = (a: { layer: number; x: number; y: number }): boolean =>
            a.layer === selected.at.layer && a.x === selected.at.x && a.y === selected.at.y
          const worldInfo = world.info.filter(info => same(info.origin))
          const cellInfo = record ? record.info.filter(info => same(info.origin)) : []
          const cellEvents = record ? record.events.filter(event => same(event.at)) : []
          return (
            <>
              <div className="section-label">该格世界信息</div>
              {zone && (
                <div className="info-row">
                  <span className="chan-dot" style={{ background: '#7f8b9c' }} />
                  <span className="info-label">{zone.name}：{zone.note}</span>
                </div>
              )}
              {worldInfo.length === 0 && !zone && <div className="muted">无</div>}
              {worldInfo.map(info => (
                <div className="info-row" key={info.id}>
                  <span className={`chan-dot ${info.channel}`} />
                  <span className="info-label">{info.label}</span>
                  <span className="dim">{Math.round(info.strength)}</span>
                </div>
              ))}
              <div className="section-label">本轮信息 · R{record?.round ?? '-'}</div>
              {cellInfo.length === 0 && <div className="muted">无</div>}
              {cellInfo.map(info => (
                <div className="info-row" key={info.versionId}>
                  <span className={`chan-dot ${info.channel}`} />
                  <span className="info-label">{info.label}</span>
                  <span className="dim">{Math.round(info.strength)}</span>
                </div>
              ))}
              <div className="section-label">本轮事件</div>
              {cellEvents.length === 0 && <div className="muted">无</div>}
              {cellEvents.map(event => (
                <div className="log-line" key={event.seq}>
                  <span className="dim">{event.kind}</span>
                  <span>{event.text}</span>
                </div>
              ))}
            </>
          )
        })()}
      </div>
    )
  }

  return <Empty layer={layer} />
}

function Empty({ layer }: { layer?: number }) {
  return (
    <div className="inspector-body">
      <div className="section-label">操作</div>
      <div className="hint-row"><kbd>[</kbd><kbd>]</kbd><span>切换层</span></div>
      <div className="hint-row"><kbd>1</kbd>–<kbd>4</kbd><span>切换通道</span></div>
      <div className="hint-row"><kbd>0</kbd><span>关闭叠加</span></div>
      <div className="hint-row"><kbd>M</kbd><span>2D / 3D</span></div>
      <div className="hint-row"><kbd>R</kbd><span>重置视角</span></div>
      <div className="hint-row"><kbd>Esc</kbd><span>取消选中</span></div>
      <div className="section-label">图例</div>
      <div className="legend-row"><span className="swatch wall" />墙</div>
      <div className="legend-row"><span className="swatch window" />窗</div>
      <div className="legend-row"><span className="swatch stair" />楼梯</div>
      <div className="legend-row"><span className="swatch" style={{ background: '#e6c26a' }} />物品</div>
      <div className="legend-row"><span className="swatch" style={{ background: '#6fb7c9' }} />设施</div>
      <div className="legend-row"><span className="swatch agent" />实心 = 真实会话</div>
      <div className="legend-row"><span className="swatch sim" />空心 = 模拟</div>
      {layer !== undefined && <div className="muted footnote">当前第 {layer} 层</div>}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv-row">
      <span className="kv-key">{label}</span>
      <span className="kv-value">{value}</span>
    </div>
  )
}
