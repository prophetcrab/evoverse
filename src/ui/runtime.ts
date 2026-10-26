import type { PresetId, World } from '../world/types'
import { createWorld } from '../world/generate'
import { createManorWorld } from '../world/manor'
import { createEngine, type SimEngine } from '../sim/engine'
import { createHostComplete } from '../sim/llm-transport'
import { createLlmMind } from '../sim/llm-mind'
import { createLlmSummarizer } from '../sim/summarize'
import { computeMetrics, type MetricPoint } from '../sim/metrics'
import type { RoundRecord, SimView } from '../sim/types'
import { UsageMeter, type UsageSnapshot } from '../sim/usage'

export type ScenarioRef = { kind: 'manor' } | { kind: 'preset'; id: PresetId }

export interface LogStatus {
  state: 'saving' | 'saved' | 'error' | 'unavailable'
  session: string | null
  file: string | null
  dir: string | null
  rounds: number
  savedAt: number | null
  error: string | null
}

export interface RuntimeSnapshot {
  world: World
  sim: SimView
  auto: boolean
  running: boolean
  usage: UsageSnapshot
  metrics: MetricPoint[]
  log: LogStatus
  scenario: ScenarioRef
  version: number
  defaultLayer: number
}

const AUTOPLAY_GAP = 850

/**
 * 世界运行时挂在模块级，不随面板挂载/卸载销毁：
 * 自动推演在切换 dsh 页面后继续，每轮日志异步追加到宿主 JSONL 文件。
 */
class WorldRuntime {
  private engine!: SimEngine
  private meter = new UsageMeter()
  private meterUnsub: (() => void) | null = null
  private engineUnsub: (() => void) | null = null
  private auto = false
  private running = false
  private timer: number | null = null
  private listeners = new Set<() => void>()
  private usage: UsageSnapshot = this.meter.snapshot()
  private metrics: MetricPoint[] = []
  private log: LogStatus = {
    state: 'unavailable', session: null, file: null, dir: null, rounds: 0, savedAt: null, error: null,
  }
  private scenario: ScenarioRef = { kind: 'preset', id: '30x30' }
  private version = 0
  private defaultLayer = 0
  private loggedRounds = new Set<number>()
  private loggedSummaries = new Set<number>()
  private logQueue: Promise<void> = Promise.resolve()
  private state!: RuntimeSnapshot

  constructor() {
    this.install(createWorld('30x30'), { kind: 'preset', id: '30x30' })
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getSnapshot = (): RuntimeSnapshot => this.state

  applyPreset(id: PresetId): void {
    this.install(createWorld(id), { kind: 'preset', id })
  }

  applyManor(): void {
    this.install(createManorWorld(), { kind: 'manor' })
  }

  /** 清空当前推演进度，按同一场景重开世界并新起一份日志。 */
  reset(): void {
    this.install(this.worldFor(this.scenario), this.scenario)
  }

  setAuto(value: boolean): void {
    if (this.auto === value) return
    this.auto = value
    if (value) this.schedule(200)
    else this.stopTimer()
    this.refresh()
  }

  async runOne(): Promise<void> {
    if (this.running) return
    this.running = true
    this.refresh()
    const engine = this.engine
    try {
      await engine.step()
    } catch (error) {
      console.error('evoverse: 回合执行失败', error)
    } finally {
      if (this.engine === engine) {
        this.running = false
        this.refresh()
      }
    }
  }

  exportLog(): string {
    return this.engine.exportLog()
  }

  private worldFor(scenario: ScenarioRef): World {
    return scenario.kind === 'manor' ? createManorWorld() : createWorld(scenario.id)
  }

  private install(next: World, scenario: ScenarioRef): void {
    this.stopTimer()
    this.auto = false
    this.running = false
    this.engineUnsub?.()
    this.engineUnsub = null
    this.meterUnsub?.()
    this.meterUnsub = null
    this.meter = new UsageMeter()
    this.usage = this.meter.snapshot()
    this.meterUnsub = this.meter.subscribe(() => {
      this.usage = this.meter.snapshot()
      this.refresh()
    })
    this.engine = this.build(next)
    this.engineUnsub = this.engine.subscribe(() => this.onEngineNotify())
    this.scenario = scenario
    this.defaultLayer = scenario.kind === 'manor' ? 1 : 0
    this.metrics = [computeMetrics(this.engine.view(), this.engine.world())]
    this.loggedRounds.clear()
    this.loggedSummaries.clear()
    this.version += 1
    this.openLog()
    this.refresh()
  }

  private build(world: World): SimEngine {
    const bridge = createHostComplete(this.meter, () => this.engine.round)
    return createEngine(
      world,
      bridge ? createLlmMind(bridge) : undefined,
      bridge ? createLlmSummarizer(bridge) : undefined,
    )
  }

  private onEngineNotify(): void {
    const view = this.engine.view()
    const world = this.engine.world()
    for (const record of view.records) {
      if (!this.loggedRounds.has(record.round)) {
        this.loggedRounds.add(record.round)
        this.appendRound(record, view, world)
      }
      if (!record.summaryPending && record.summary && !this.loggedSummaries.has(record.round)) {
        this.loggedSummaries.add(record.round)
        this.appendLog({
          v: 1,
          type: 'summary',
          session: this.log.session,
          at: new Date().toISOString(),
          round: record.round,
          summary: record.summary,
          usage: this.meter.snapshot(),
        })
      }
    }
    this.refresh()
  }

  private appendRound(record: RoundRecord, view: SimView, world: World): void {
    const point = computeMetrics(view, world)
    this.metrics = [...this.metrics, point]
    this.appendLog({
      v: 1,
      type: 'round',
      session: this.log.session,
      at: new Date().toISOString(),
      round: record.round,
      metrics: point,
      usage: this.meter.snapshot(),
      characters: view.characters.map(character => ({
        id: character.id,
        name: character.name,
        controller: character.controller,
        status: character.status,
        hp: character.vitals.hp,
        pos: character.pos,
        needs: character.needs,
        ability: character.ability,
        attitudes: character.attitudes,
        relations: character.relations,
        goals: character.goals,
        attention: character.attention,
        presentation: character.presentation,
        lastThought: character.lastThought,
        lastAction: character.lastAction,
        inventory: character.inventory,
      })),
      items: world.items ?? [],
      fixtures: world.fixtures ?? [],
      record,
    })
  }

  private get bridgeKey(): string | null {
    const key = (globalThis as { EVOVERSE_BRIDGE_KEY?: string }).EVOVERSE_BRIDGE_KEY
    return typeof key === 'string' && key.length > 0 ? key : null
  }

  private openLog(): void {
    if (!this.bridgeKey) {
      this.log = {
        state: 'unavailable', session: null, file: null, dir: null, rounds: 0, savedAt: null, error: null,
      }
      return
    }
    const prefix = this.scenario.kind === 'manor' ? 'school' : this.scenario.id
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const session = `${prefix}-${stamp}-r${this.version}`
    this.log = {
      state: 'saving', session, file: null, dir: null, rounds: 0, savedAt: null, error: null,
    }
    const world = this.engine.world()
    this.appendLog({
      v: 1,
      type: 'session',
      session,
      at: new Date().toISOString(),
      scenario: this.scenario,
      world: {
        name: world.name,
        preset: world.preset,
        width: world.width,
        height: world.height,
        layers: world.layers,
      },
      characters: world.characters.map(character => ({
        id: character.id,
        name: character.name,
        controller: character.controller,
        initiative: character.initiative,
        pos: character.pos,
      })),
      items: world.items ?? [],
      fixtures: world.fixtures ?? [],
    })
  }

  private appendLog(line: Record<string, unknown>): void {
    const session = this.log.session
    if (!session) return
    const body = JSON.stringify({ session, lines: [line] })
    this.logQueue = this.logQueue.then(() => this.postLog(session, body, line.type === 'round'))
  }

  private async postLog(session: string, body: string, isRound: boolean): Promise<void> {
    try {
      const key = this.bridgeKey
      if (!key) return
      const response = await fetch('/evoverse/log', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-evoverse-key': key,
        },
        body,
      })
      if (!response.ok) throw new Error(`日志写入失败 ${response.status}`)
      const data = await response.json() as { file?: string; dir?: string }
      if (this.log.session !== session) return
      this.log = {
        ...this.log,
        state: 'saved',
        file: data.file ?? this.log.file,
        dir: data.dir ?? this.log.dir,
        rounds: this.log.rounds + (isRound ? 1 : 0),
        savedAt: Date.now(),
        error: null,
      }
      this.refresh()
    } catch (error) {
      if (this.log.session !== session) return
      this.log = {
        ...this.log,
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
      }
      this.refresh()
    }
  }

  private schedule(delay: number): void {
    this.stopTimer()
    this.timer = window.setTimeout(() => {
      this.timer = null
      void this.tick()
    }, delay)
  }

  private async tick(): Promise<void> {
    if (!this.auto) return
    await this.runOne()
    if (this.auto) this.schedule(AUTOPLAY_GAP)
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
  }

  private refresh(): void {
    this.state = {
      world: this.engine.world(),
      sim: this.engine.view(),
      auto: this.auto,
      running: this.running,
      usage: this.usage,
      metrics: this.metrics,
      log: this.log,
      scenario: this.scenario,
      version: this.version,
      defaultLayer: this.defaultLayer,
    }
    for (const listener of this.listeners) listener()
  }
}

let runtime: WorldRuntime | null = null

export function getRuntime(): WorldRuntime {
  runtime ??= new WorldRuntime()
  return runtime
}
