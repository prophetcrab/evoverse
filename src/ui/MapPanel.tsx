import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Channel, PresetId, World } from '../world/types'
import { PRESETS, createWorld } from '../world/generate'
import { createManorWorld } from '../world/manor'
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
import { createEngine, type SimEngine } from '../sim/engine'
import type { SimView } from '../sim/types'
import { computeMetrics, type MetricPoint } from '../sim/metrics'
import { UsageMeter, type UsageSnapshot } from '../sim/usage'
import { createHostComplete } from '../sim/llm-transport'
import { createLlmMind } from '../sim/llm-mind'
import { createLlmSummarizer } from '../sim/summarize'
import './styles.css'

const CHANNELS: Channel[] = ['vision', 'sound', 'smell']

type SideTab = 'inspector' | 'overview' | 'log' | 'metrics' | 'usage'

export function MapPanel() {
  const [world, setWorld] = useState<World>(() => createWorld('30x30'))
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  const [layer, setLayer] = useState(0)
  const [channel, setChannel] = useState<Channel | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [resetSignal, setResetSignal] = useState(0)
  const [sim, setSim] = useState<SimView | null>(null)
  const [auto, setAuto] = useState(false)
  const [sideTab, setSideTab] = useState<SideTab>('inspector')
  const [usage, setUsage] = useState<UsageSnapshot | null>(null)
  const [metrics, setMetrics] = useState<MetricPoint[]>([])
  const engineRef = useRef<SimEngine | null>(null)
  const runningRef = useRef(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const meterUnsubRef = useRef<(() => void) | null>(null)

  const field = useMemo(
    () => (channel ? computeField(world, channel, layer) : null),
    [world, channel, layer],
  )

  const activate = useCallback((engine: SimEngine) => {
    unsubscribeRef.current?.()
    engineRef.current = engine
    setSim(engine.view())
    unsubscribeRef.current = engine.subscribe(() => setSim(engine.view()))
  }, [])

  /** 装了桥就走 LLM（每轮预算 3 人），否则确定性 mock。 */
  const buildEngine = useCallback((next: World) => {
    const meter = new UsageMeter()
    meterUnsubRef.current?.()
    meterUnsubRef.current = meter.subscribe(() => setUsage(meter.snapshot()))
    setUsage(meter.snapshot())
    const bridge = createHostComplete(meter, () => engineRef.current?.round ?? 0)
    return createEngine(
      next,
      bridge ? createLlmMind(bridge) : undefined,
      bridge ? createLlmSummarizer(bridge) : undefined,
      bridge ? { budgetPerRound: 3 } : undefined,
    )
  }, [])

  useEffect(() => {
    if (!engineRef.current) {
      const engine = buildEngine(world)
      activate(engine)
      setMetrics([computeMetrics(engine.view(), engine.world())])
    }
    return () => {
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
      meterUnsubRef.current?.()
      meterUnsubRef.current = null
    }
    // 只在挂载时创建一次；世界切换由 install 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as unknown as { __evoverse?: unknown }).__evoverse = { world, field, channel, layer, mode, sim }
    }
  }, [world, field, channel, layer, mode, sim])

  const install = useCallback((next: World, nextLayer: number) => {
    const engine = buildEngine(next)
    activate(engine)
    setWorld(engine.world())
    setMetrics([computeMetrics(engine.view(), engine.world())])
    setLayer(nextLayer)
    setSelection(null)
    setAuto(false)
    setResetSignal(value => value + 1)
  }, [activate, buildEngine])

  const applyPreset = (id: PresetId) => install(createWorld(id), 0)
  const applyManor = () => install(createManorWorld(), 1)

  const runOne = useCallback(async () => {
    const engine = engineRef.current
    if (!engine || runningRef.current) return
    runningRef.current = true
    try {
      await engine.step()
      const nextWorld = engine.world()
      const view = engine.view()
      setWorld(nextWorld)
      setSim(view)
      setMetrics(previous => [...previous, computeMetrics(view, nextWorld)])
    } finally {
      runningRef.current = false
    }
  }, [])

  const exportLog = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    const blob = new Blob([engine.exportLog()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `evoverse-log-r${engine.round}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  useEffect(() => {
    if (!auto) return
    let cancelled = false
    let timer: number | undefined
    const tick = async () => {
      if (cancelled) return
      await runOne()
      if (!cancelled) timer = window.setTimeout(tick, 850)
    }
    timer = window.setTimeout(tick, 200)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [auto, runOne])

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
      else if (event.key.toLowerCase() === 'n') void runOne()
      else if (event.key === 'Escape') setSelection(null)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [world.layers, runOne])

  const demoPreset: PresetId = world.preset === 'manor' ? '30x30' : world.preset

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
            onClick={() => applyPreset(demoPreset)}
          >
            程序生成
          </button>
          <button
            type="button"
            className={world.preset === 'manor' ? 'chip on' : 'chip'}
            onClick={applyManor}
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
                onClick={() => applyPreset(preset.id)}
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
          <button type="button" className="chip" onClick={() => void runOne()}>下一轮</button>
          <button
            type="button"
            className={auto ? 'chip on' : 'chip'}
            onClick={() => setAuto(value => !value)}
          >
            {auto ? '暂停' : '自动'}
          </button>
          <span className="round-badge">第 {sim?.round ?? 0} 轮</span>
          {usage && usage.calls > 0 && (
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
          <span><kbd>R</kbd> 重置</span>
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
            records={sim?.records ?? null}
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
          <LogPanel sim={sim} world={world} onExport={exportLog} />
        )}
        {sideTab === 'usage' && <UsagePanel usage={usage} />}
        {sideTab === 'metrics' && <MetricsPanel points={metrics} />}
      </aside>
    </div>
  )
}
