import type { Cell, Coord, Character, InfoEntry, PresetId, StairState, World } from './types'
import { cellAt, cellIndex, inBounds } from './types'
import { S0 } from './terrain'

export interface MapPreset {
  id: PresetId
  label: string
  width: number
  height: number
  layers: number
}

export const PRESETS: MapPreset[] = [
  { id: '100x100', label: '100 × 100', width: 100, height: 100, layers: 3 },
  { id: '40x60', label: '40 × 60', width: 40, height: 60, layers: 3 },
  { id: '30x30', label: '30 × 30', width: 30, height: 30, layers: 3 },
  { id: '20x20', label: '20 × 20', width: 20, height: 20, layers: 2 },
]

export const presetById = (id: PresetId): MapPreset =>
  PRESETS.find(preset => preset.id === id) ?? PRESETS[2]

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const floorCell = (): Cell => ({ terrain: 'floor', stair: null })

function makeCells(width: number, height: number, layers: number): Cell[] {
  return Array.from({ length: width * height * layers }, floorCell)
}

function carveRoomGrid(cells: Cell[], width: number, height: number, layers: number): void {
  const roomW = Math.max(8, Math.min(18, Math.round(width / 4)))
  const roomH = Math.max(8, Math.min(18, Math.round(height / 4)))
  for (let layer = 0; layer < layers; layer += 1) {
    const base = layer * width * height
    for (let x = 1; x < width - 1; x += 1) {
      for (let y = 1; y < height - 1; y += 1) {
        const onColumn = x % roomW === 0
        const onRow = y % roomH === 0
        if (onColumn || onRow) cells[base + y * width + x].terrain = 'wall'
      }
    }
    // 每段墙开一个门洞，避免房间完全封闭
    for (let x = roomW; x < width - 1; x += roomW) {
      const y = Math.min(height - 2, roomH + 2)
      cells[base + y * width + x].terrain = 'door'
      const y2 = Math.min(height - 2, roomH * 2 + 3)
      if (y2 < height - 1) cells[base + y2 * width + x].terrain = 'door'
    }
    for (let y = roomH; y < height - 1; y += roomH) {
      const x = Math.min(width - 2, roomW + 3)
      cells[base + y * width + x].terrain = 'door'
      const x2 = Math.min(width - 2, roomW * 2 + 5)
      if (x2 < width - 1) cells[base + y * width + x2].terrain = 'door'
    }
    // 外墙
    for (let x = 0; x < width; x += 1) {
      cells[base + x].terrain = 'wall'
      cells[base + (height - 1) * width + x].terrain = 'wall'
    }
    for (let y = 0; y < height; y += 1) {
      cells[base + y * width].terrain = 'wall'
      cells[base + y * width + width - 1].terrain = 'wall'
    }
    // 外墙上开几扇窗
    for (let x = 6; x < width - 6; x += 17) {
      cells[base + x].terrain = 'window'
      cells[base + (height - 1) * width + x].terrain = 'window'
    }
  }
}

function setStair(cells: Cell[], width: number, height: number, at: Coord, to: number, state: StairState): void {
  const here = cells[(at.layer * height + at.y) * width + at.x]
  here.terrain = 'floor'
  here.stair = { to, state }
  const otherIndex = (to * height + at.y) * width + at.x
  const other = cells[otherIndex]
  other.terrain = 'floor'
  other.stair = { to: at.layer, state }
}

function freeCells(world: World, rng: () => number, count: number): Coord[] {
  const found: Coord[] = []
  let guard = 0
  while (found.length < count && guard < 20000) {
    guard += 1
    const layer = Math.floor(rng() * world.layers)
    const x = 2 + Math.floor(rng() * (world.width - 4))
    const y = 2 + Math.floor(rng() * (world.height - 4))
    const c = { layer, x, y }
    if (!inBounds(world, c)) continue
    const cell = cellAt(world, c)
    if (cell.terrain !== 'floor' || cell.stair) continue
    if (found.some(p => p.layer === layer && Math.hypot(p.x - x, p.y - y) < 4)) continue
    found.push(c)
  }
  return found
}

const NAMES = ['守门人', '信使', '账房', '游医', '铁匠', '小贩']
const TINTS = ['#ffd166', '#7bdff2', '#f78c6b', '#c792ea', '#9ae6b4', '#f6a6c1']

export function createWorld(presetId: PresetId, seed = 7): World {
  const preset = presetById(presetId)
  const { width, height, layers } = preset
  const rng = mulberry32(seed)
  const cells = makeCells(width, height, layers)
  carveRoomGrid(cells, width, height, layers)

  const stairStates: StairState[] = ['open', 'blocked', 'destroyed']
  for (let layer = 0; layer < layers - 1; layer += 1) {
    const spots = [
      { x: Math.floor(width * 0.25), y: Math.floor(height * 0.35) },
      { x: Math.floor(width * 0.7), y: Math.floor(height * 0.6) },
    ]
    spots.forEach((spot, i) => {
      const state = stairStates[(layer * 2 + i) % stairStates.length]
      setStair(cells, width, height, { layer, ...spot }, layer + 1, state)
    })
  }

  const world: World = {
    name: 'evoverse demo',
    preset: presetId,
    width,
    height,
    layers,
    cells,
    characters: [],
    info: [],
    round: 7,
  }

  const spots = freeCells(world, rng, 4)
  const characters: Character[] = spots.map((pos, i) => ({
    id: `char-${i + 1}`,
    name: NAMES[i] ?? `角色${i + 1}`,
    tint: TINTS[i] ?? '#ffffff',
    controller: i === 0 ? 'agent' : 'sim',
    pos,
    initiative: 100 - i * 10,
  }))

  const info: InfoEntry[] = []
  const a = characters[0]?.pos
  const b = characters[1]?.pos
  if (a) {
    info.push({ id: 'info-shout', channel: 'sound', strength: S0.shout, origin: a, label: '一声喊叫' })
    info.push({ id: 'info-action', channel: 'vision', strength: S0.action, origin: a, label: '一个动作' })
  }
  if (b) {
    info.push({ id: 'info-speech', channel: 'sound', strength: S0.speech, origin: b, label: '低声交谈' })
  }
  info.push({
    id: 'info-smell',
    channel: 'smell',
    strength: S0.strongSmell,
    origin: { layer: 0, x: Math.floor(width * 0.8), y: Math.floor(height * 0.2) },
    label: '刺鼻气味',
  })

  for (const cell of cells) {
    if (cell.terrain === 'door') cell.terrain = 'floor'
  }

  world.characters = characters
  world.info = info
  return world
}

export function fieldPeak(field: Float32Array): number {
  let peak = 0
  for (let i = 0; i < field.length; i += 1) {
    if (field[i] > peak) peak = field[i]
  }
  return peak
}

export function indexOf(world: World, c: Coord): number {
  return cellIndex(world, c)
}
