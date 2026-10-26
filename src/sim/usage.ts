export type CallPhase = 'feel' | 'think' | 'act' | 'summary'

export interface UsageRecord {
  phase: CallPhase
  model: string
  input: number
  output: number
  total: number
  cacheRead: number
  ok: boolean
  round: number
  at: number
  error?: string
}

export interface UsageSnapshot {
  calls: number
  errors: number
  input: number
  output: number
  total: number
  cacheRead: number
  byPhase: Array<{ phase: CallPhase; calls: number; input: number; output: number }>
  byRound: Array<{ round: number; calls: number; input: number; output: number }>
  last: UsageRecord | null
}

const PHASES: CallPhase[] = ['feel', 'think', 'act', 'summary']

/** 记录每次模型调用的 token 用量，供仪表盘读取。 */
export class UsageMeter {
  private records: UsageRecord[] = []
  private listeners = new Set<() => void>()

  record(entry: Omit<UsageRecord, 'at'>): void {
    this.records.push({ ...entry, at: Date.now() })
    for (const listener of this.listeners) listener()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  reset(): void {
    this.records = []
    for (const listener of this.listeners) listener()
  }

  snapshot(): UsageSnapshot {
    const byPhase = PHASES.map(phase => {
      const rows = this.records.filter(record => record.phase === phase)
      return {
        phase,
        calls: rows.length,
        input: rows.reduce((sum, row) => sum + row.input, 0),
        output: rows.reduce((sum, row) => sum + row.output, 0),
      }
    })
    const rounds = new Map<number, { calls: number; input: number; output: number }>()
    for (const record of this.records) {
      const entry = rounds.get(record.round) ?? { calls: 0, input: 0, output: 0 }
      entry.calls += 1
      entry.input += record.input
      entry.output += record.output
      rounds.set(record.round, entry)
    }
    return {
      calls: this.records.length,
      errors: this.records.filter(record => !record.ok).length,
      input: this.records.reduce((sum, record) => sum + record.input, 0),
      output: this.records.reduce((sum, record) => sum + record.output, 0),
      total: this.records.reduce((sum, record) => sum + record.total, 0),
      cacheRead: this.records.reduce((sum, record) => sum + record.cacheRead, 0),
      byPhase,
      byRound: [...rounds.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([round, entry]) => ({ round, ...entry })),
      last: this.records.at(-1) ?? null,
    }
  }
}
