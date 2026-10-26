import type { Channel, Coord, World } from './types'
import { CHANNEL_WALL_COST, NOTICE, permeabilityOf } from './terrain'
import { cellAt, cellIndex, coordOf, inBounds } from './types'

/** 按预算扩散的桶队列（强度整数 0..1000，天然是桶序）。 */
class BucketQueue {
  private readonly buckets: number[][] = Array.from({ length: 1001 }, () => [])
  private top = 1000

  push(index: number, priority: number): void {
    const p = Math.max(0, Math.min(1000, Math.round(priority)))
    this.buckets[p].push(index)
    if (p > this.top) this.top = p
  }

  pop(): [index: number, priority: number] | null {
    while (this.top >= 0) {
      const bucket = this.buckets[this.top]
      const index = bucket.pop()
      if (index !== undefined) return [index, this.top]
      this.top -= 1
    }
    return null
  }
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

function wallLoss(channel: Channel, permeability: number): number {
  return CHANNEL_WALL_COST[channel] * (1 - permeability)
}

/** 从 from 进入 to 的损耗；Infinity 表示不可通过。 */
function edgeLoss(world: World, channel: Channel, from: Coord, to: Coord): number {
  const target = cellAt(world, to)
  if (target.terrain === 'void') return Infinity
  const p = permeabilityOf(target)
  const vertical = from.layer !== to.layer
  if (channel === 'vision') {
    if (vertical) return Infinity
    if (p.opacity <= 0) return Infinity
    return 80 + wallLoss('vision', p.opacity)
  }
  const verticalFactor = 3
  const stepCost = channel === 'sound' ? 50 : 100
  const key = channel === 'sound' ? p.acoustic : p.scent
  const base = stepCost + wallLoss(channel, key)
  return vertical ? base * verticalFactor : base
}

function* neighbors(world: World, c: Coord): Generator<Coord> {
  for (const [dx, dy] of NEIGHBORS) {
    const next = { layer: c.layer, x: c.x + dx, y: c.y + dy }
    if (inBounds(world, next)) yield next
  }
  const cell = cellAt(world, c)
  if (cell.stair && cell.stair.state !== 'destroyed') {
    const other = { layer: cell.stair.to, x: c.x, y: c.y }
    if (inBounds(world, other) && cellAt(world, other).stair) yield other
  }
}

/** 声音/气味的全局场（含跨层）。视觉见 computeVisionField。 */
export function computeDiffusionField(world: World, channel: 'sound' | 'smell'): Float32Array {
  const strength = new Float32Array(world.cells.length)
  const queue = new BucketQueue()
  for (const entry of world.info) {
    if (entry.channel !== channel) continue
    const index = cellIndex(world, entry.origin)
    if (entry.strength > strength[index]) {
      strength[index] = entry.strength
      queue.push(index, entry.strength)
    }
  }
  for (;;) {
    const item = queue.pop()
    if (!item) break
    const [index, priority] = item
    if (priority < strength[index]) continue
    const from = coordOf(world, index)
    for (const to of neighbors(world, from)) {
      const loss = edgeLoss(world, channel, from, to)
      if (!Number.isFinite(loss)) continue
      const next = priority - loss
      if (next < NOTICE) continue
      const target = cellIndex(world, to)
      if (next > strength[target]) {
        strength[target] = next
        queue.push(target, next)
      }
    }
  }
  return strength
}

function bresenham(from: Coord, to: Coord): Coord[] {
  const points: Coord[] = []
  let x = from.x
  let y = from.y
  const dx = Math.abs(to.x - x)
  const dy = Math.abs(to.y - y)
  const sx = x < to.x ? 1 : -1
  const sy = y < to.y ? 1 : -1
  let err = dx - dy
  for (;;) {
    points.push({ layer: from.layer, x, y })
    if (x === to.x && y === to.y) break
    const e2 = err * 2
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
  return points
}

/** 视线判定：中间格 opacity=0 即阻挡；终点本身可见。 */
export function hasLineOfSight(world: World, from: Coord, to: Coord): boolean {
  if (from.layer !== to.layer) return false
  const line = bresenham(from, to)
  for (let i = 1; i < line.length - 1; i += 1) {
    if (permeabilityOf(cellAt(world, line[i])).opacity <= 0) return false
  }
  return true
}

/** 视觉场：每个角色与视觉事件按视线判定投射，叠层不穿透。 */
export function computeVisionField(world: World, layer: number): Float32Array {
  const field = new Float32Array(world.cells.length)
  const sources: { at: Coord; strength: number }[] = []
  for (const character of world.characters) {
    if (character.pos.layer === layer) sources.push({ at: character.pos, strength: 1000 })
  }
  for (const entry of world.info) {
    if (entry.channel === 'vision' && entry.origin.layer === layer) {
      sources.push({ at: entry.origin, strength: entry.strength })
    }
  }
  const radius = Math.ceil(1000 / 80)
  for (const source of sources) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const target = { layer, x: source.at.x + dx, y: source.at.y + dy }
        if (!inBounds(world, target)) continue
        const distance = Math.max(Math.abs(dx), Math.abs(dy))
        const value = source.strength - 80 * distance
        if (value < NOTICE) continue
        if (!hasLineOfSight(world, source.at, target)) continue
        const index = cellIndex(world, target)
        if (value > field[index]) field[index] = value
      }
    }
  }
  return field
}

export function computeField(world: World, channel: Channel, layer: number): Float32Array {
  return channel === 'vision' ? computeVisionField(world, layer) : computeDiffusionField(world, channel)
}

/** 便于 UI 使用的单格读数。 */
export function strengthAt(field: Float32Array, world: World, c: Coord): number {
  return field[cellIndex(world, c)] ?? 0
}
