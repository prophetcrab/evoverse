import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Channel, PresetId } from '../world/types'
import { PRESETS } from '../world/generate'
import { computeField } from '../world/field'
import { CHANNEL_LABEL } from '../world/terrain'
import { Map2D } from './Map2D'
import { Map3D } from './Map3D'
import { Inspector } from './Inspector'
import { EventLog } from './EventLog'
import { OverviewPanel } from './OverviewPanel'
import { LogPanel } from './LogPanel'
import { UsagePanel } from './UsagePanel'
import { MetricsPanel } from './MetricsPanel'
import type { Selection } from './types'
import { getRuntime } from './runtime'
import './styles.css'

const CHANNELS: Channel[] = ['vision', 'sound', 'smell']

type SideTab = 'inspector' | 'overview' | 'log' | 'metrics' | 'usage'

export function MapPanel() {
  const runtime = getRuntime()
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const { world, sim, auto, running, usage, metrics, log } = snapshot
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  const [layer, setLayer] = useState(snapshot.defaultLayer)
  const [channel, setChannel] = useState<Channel | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [resetSignal, setResetSignal] = useState(0)
  const [sideTab, setSideTab] = useState<SideTab>('inspector')
  const versionRef = useRef(snapshot.version)

  const field = useMemo(
    () => (channel ? computeField(world, channel, layer) : null),
    [world, channel, layer],
  )

  useEffect(() => {
    if (snapshot.version === versionRef.current) return
    versionRef.current = snapshot.version
    setLayer(snapshot.defaultLayer)
    setSelection(null)
    setResetSignal(value => value + 1)
  }, [snapshot.version, snapshot.defaultLayer])

  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as unknown as { __evoverse?: unknown }).__evoverse = {
        runtime, world, field, channel, layer, mode, sim,
      }
    }
  }, [runtime, world, field, channel, layer, mode, sim])

  const runOne = useCallback(() => {
    void runtime.runOne()
  }, [runtime])

  const exportLog = useCallback(() => {
    const blob = new Blob([runtime.exportLog()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `evoverse-log-r${sim.round}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [runtime, sim.round])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (event.key === '[') setLayer(value => Math.max(0, value - 1))
      else if (event.key === ']') setLayer(value => Math.min(world.layers - 1, value + 1))
      else if (event.key === '0') setChannel(null)
      else if (event.key === '1') setChannel('vision')
      else if (event.key === '2') setChannel('sound')
      else if (event.key === '3') setChannel('smell')
      else if (event.key.toLowerCase() === 'm') setMode(value => (value === '2d' ? '3d' : '2d'))
      else if (event.key.toLowerCase() === 'r') setResetSignal(value => value + 1)
      else if (event.key.toLowerCase() === 'n') runOne()
      else if (event.key === 'Escape') setSelection(null)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [world.layers, runOne])

  const demoPreset: PresetId = world.preset === 'manor' ? '30x30' : world.preset

  const logLabel = log.state === 'unavailable'
    ? '日志未连接'
    : log.state === 'error'
      ? '日志写入失败'
      : log.state === 'saving'
        ? '日志写入中'
        : `日志 ${log.rounds} 轮`

  return (
    <div className="evoverse-panel">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <span className="brand-name">evoverse</span>
          <span className="dim">世界观察</span>
        </div>

        <div className="group">
          <span className="group-label">场景</span>
          <button
            type="button"
            className={world.preset !== 'manor' ? 'chip on' : 'chip'}
            onClick={() => runtime.applyPreset(demoPreset)}
          >
            程序生成
          </button>
          <button
            type="button"
            className={world.preset === 'manor' ? 'chip on' : 'chip'}
            onClick={() => runtime.applyManor()}
          >
            学园
          </button>
        </div>

        {world.preset !== 'manor' && (
          <div className="group">
            <span className="group-label">尺寸</span>
            {PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                className={preset.id === world.preset ? 'chip on' : 'chip'}
                onClick={() => runtime.applyPreset(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        <div className="group">
          <span className="group-label">层</span>
          <button type="button" className="stepper" onClick={() => setLayer(v => Math.max(0, v - 1))}>‹</button>
          <span className="layer-readout">{layer + 1} / {world.layers}</span>
          <button type="button" className="stepper" onClick={() => setLayer(v => Math.min(world.layers - 1, v + 1))}>›</button>
        </div>

        <div className="group">
          <span className="group-label">视图</span>
          <button type="button" className={mode === '2d' ? 'chip on' : 'chip'} onClick={() => setMode('2d')}>2D</button>
          <button type="button" className={mode === '3d' ? 'chip on' : 'chip'} onClick={() => setMode('3d')}>3D</button>
        </div>

        <div className="group">
          <span className="group-label">通道</span>
          <button type="button" className={channel === null ? 'chip on' : 'chip'} onClick={() => setChannel(null)}>无</button>
          {CHANNELS.map(item => (
            <button
              key={item}
              type="button"
              className={channel === item ? 'chip on' : 'chip'}
              onClick={() => setChannel(item)}
            >
              <i className={`chan-dot ${item}`} />
              {CHANNEL_LABEL[item]}
            </button>
          ))}
        </div>

        <div className="group run-group">
          <span className="group-label">运行</span>
          <button type="button" className="chip" onClick={runOne} disabled={running}>下一轮</button>
          <button
            type="button"
            className={auto ? 'chip on' : 'chip'}
            onClick={() => runtime.setAuto(!auto)}
          >
            {auto ? '暂停' : '自动'}
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => runtime.reset()}
            title="清空推演进度，按当前场景重新开始，并新开一份日志"
          >
            重置
          </button>
          <span className="round-badge">第 {sim.round} 轮</span>
          <span
            className={`round-badge log-badge ${log.state}`}
            title={log.file ?? log.error ?? '未连接宿主，日志只在内存里'}
          >
            {logLabel}
          </span>
          {usage.calls > 0 && (
            <span className="round-badge usage-badge">LLM {usage.calls} · {usage.total} tok</span>
          )}
        </div>
      </header>

      <div className="stage">
        {mode === '2d' ? (
          <Map2D
            world={world}
            layer={layer}
            field={field}
            channel={channel}
            selected={selection}
            onSelect={setSelection}
            resetSignal={resetSignal}
          />
        ) : (
          <Map3D
            world={world}
            layer={layer}
            field={field}
            channel={channel}
            selected={selection}
            onSelect={setSelection}
            resetSignal={resetSignal}
          />
        )}
        <EventLog sim={sim} world={world} />
        <div className="stage-hint">
          <span><kbd>[</kbd><kbd>]</kbd> 切层</span>
          <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 通道</span>
          <span><kbd>M</kbd> 2D/3D</span>
          <span><kbd>N</kbd> 下一轮</span>
          <span><kbd>R</kbd> 视角</span>
        </div>
      </div>

      <aside className="side">
        <div className="side-tabs">
          <button
            type="button"
            className={sideTab === 'inspector' ? 'tab on' : 'tab'}
            onClick={() => setSideTab('inspector')}
          >
            检查器
          </button>
          <button
            type="button"
            className={sideTab === 'overview' ? 'tab on' : 'tab'}
            onClick={() => setSideTab('overview')}
          >
            总览
          </button>
          <button
            type="button"
            className={sideTab === 'log' ? 'tab on' : 'tab'}
            onClick={() => setSideTab('log')}
          >
            回合
          </button>
          <button
            type="button"
            className={sideTab === 'metrics' ? 'tab on' : 'tab'}
            onClick={() => setSideTab('metrics')}
          >
            观测
          </button>
          <button
            type="button"
            className={sideTab === 'usage' ? 'tab on' : 'tab'}
            onClick={() => setSideTab('usage')}
          >
            用量
          </button>
        </div>
        {sideTab === 'inspector' && (
          <Inspector
            world={world}
            layer={layer}
            field={field}
            channel={channel}
            selected={selection}
            sim={sim}
            records={sim.records}
          />
        )}
        {sideTab === 'overview' && (
          <OverviewPanel
            sim={sim}
            world={world}
            onSelect={id => {
              setSelection({ kind: 'character', id })
              setSideTab('inspector')
            }}
          />
        )}
        {sideTab === 'log' && (
          <LogPanel sim={sim} world={world} log={log} onExport={exportLog} />
        )}
        {sideTab === 'usage' && <UsagePanel usage={usage} />}
        {sideTab === 'metrics' && <MetricsPanel points={metrics} />}
      </aside>
    </div>
  )
}
