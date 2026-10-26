import { useState } from 'react'
import type { World } from '../world/types'
import type { SimView } from '../sim/types'
import type { LogStatus } from './runtime'

interface Props {
  sim: SimView | null
  world: World
  log: LogStatus
  onExport: () => void
}

/** 回合日志：每轮摘要（异步生成）+ 可展开的行动 / 状态变化 / 信息 / 事件。 */
export function LogPanel({ sim, world, log, onExport }: Props) {
  const [open, setOpen] = useState<number | null>(null)
  if (!sim) {
    return <div className="inspector-body"><div className="muted">还没有日志，先运行一轮。</div></div>
  }
  const records = [...sim.records].reverse()
  const name = (id?: string): string => (id ? world.characters.find(c => c.id === id)?.name ?? id : '某人')

  return (
    <div className="inspector-body log-body">
      <div className="log-toolbar">
        <span className="muted">共 {sim.records.length} 轮</span>
        <span className="muted log-status" title={log.file ?? log.error ?? undefined}>
          {log.state === 'unavailable'
            ? '日志未连接'
            : log.state === 'error'
              ? `写入失败：${log.error}`
              : `已落盘 ${log.rounds} 轮`}
        </span>
        <button type="button" className="chip" onClick={onExport}>导出 JSON</button>
      </div>
      {log.file && <div className="log-file" title={log.file}>{log.file}</div>}
      {records.length === 0 && <div className="muted">还没有回合记录。</div>}
      {records.map(record => {
        const expanded = open === record.round
        return (
          <div className="log-round" key={record.round}>
            <button
              type="button"
              className={expanded ? 'log-round-head open' : 'log-round-head'}
              onClick={() => setOpen(expanded ? null : record.round)}
            >
              <span className="log-round-no">R{record.round}</span>
              <span className="log-round-summary">
                {record.summaryPending ? '总结中…' : record.summary ?? '—'}
              </span>
              <span className="dim">{record.actions.length} 行动</span>
            </button>
            {expanded && (
              <div className="log-detail">
                {record.actions.length > 0 && (
                  <>
                    <div className="section-label">行动</div>
                    {record.actions.map((item, index) => (
                      <div className="log-line" key={`${record.round}-a-${index}`}>
                        <span className="dim">{name(item.action.actor)}</span>
                        <span className={item.outcome === 'blocked' ? 'blocked' : ''}>
                          {item.outcome === 'blocked' ? '失败：' : ''}
                          {item.action.kind} · {item.note || item.action.behavior}
                        </span>
                      </div>
                    ))}
                  </>
                )}
                {record.patches.length > 0 && (
                  <>
                    <div className="section-label">状态变化</div>
                    {record.patches.map(({ actor, patch }, index) => (
                      <div className="log-line" key={`${record.round}-p-${index}`}>
                        <span className="dim">{name(actor)}</span>
                        <span>{patch.rationale || '状态更新'}</span>
                      </div>
                    ))}
                  </>
                )}
                {record.info.length > 0 && (
                  <>
                    <div className="section-label">本轮信息</div>
                    {record.info.map(info => (
                      <div className="log-line" key={info.versionId}>
                        <span className="dim">({info.origin.layer}, {info.origin.x}, {info.origin.y})</span>
                        <span>{info.label}</span>
                      </div>
                    ))}
                  </>
                )}
                {record.events.length > 0 && (
                  <>
                    <div className="section-label">事件</div>
                    {record.events.map(event => (
                      <div className="log-line" key={event.seq}>
                        <span className="dim">R{event.round}</span>
                        <span>{event.text}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
