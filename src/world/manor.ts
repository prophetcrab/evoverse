import type { Cell, Character, InfoEntry, StairState, World } from './types'
import { SEEDS, WORLD_INFO } from '../sim/scenario'

/**
 * 庄园场景（120 × 80，四层）：
 *   L0 地下 —— 庄园酒窖（建筑下方，分四间）与独立地窖（花园下方，两室），互不连通
 *   L1 地面 —— 花园 + 庄园一层（门厅、大厅、餐厅、书房、厨房等）
 *   L2 二层 —— 主卧、客房、育儿室与两侧起居室
 *   L3 三层（阁楼）—— 较小footprint 的储藏层
 * 楼层外的不存在区域用 void 表示。
 */

const W = 120
const H = 80

const L_BASE = 0
const L_GROUND = 1
const L_FIRST = 2
const L_SECOND = 3

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

const ESTATE: Rect = { x0: 2, y0: 2, x1: 117, y1: 77 }
const MANOR: Rect = { x0: 64, y0: 12, x1: 110, y1: 56 }
const ATTIC: Rect = { x0: 68, y0: 16, x1: 106, y1: 52 }
const CELLAR: Rect = { x0: 66, y0: 14, x1: 108, y1: 54 }
const ROOT: Rect = { x0: 8, y0: 52, x1: 30, y1: 72 }

const index = (layer: number, x: number, y: number): number => (layer * H + y) * W + x

function setCell(cells: Cell[], layer: number, x: number, y: number, terrain: Cell['terrain']): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  cells[index(layer, x, y)] = { terrain, stair: null }
}

function fill(cells: Cell[], layer: number, rect: Rect, terrain: Cell['terrain']): void {
  for (let y = rect.y0; y <= rect.y1; y += 1) {
    for (let x = rect.x0; x <= rect.x1; x += 1) setCell(cells, layer, x, y, terrain)
  }
}

function outline(cells: Cell[], layer: number, rect: Rect, terrain: Cell['terrain']): void {
  for (let x = rect.x0; x <= rect.x1; x += 1) {
    setCell(cells, layer, x, rect.y0, terrain)
    setCell(cells, layer, x, rect.y1, terrain)
  }
  for (let y = rect.y0; y <= rect.y1; y += 1) {
    setCell(cells, layer, rect.x0, y, terrain)
    setCell(cells, layer, rect.x1, y, terrain)
  }
}

function vWall(cells: Cell[], layer: number, x: number, y0: number, y1: number, doors: number[]): void {
  for (let y = y0; y <= y1; y += 1) setCell(cells, layer, x, y, doors.includes(y) ? 'door' : 'wall')
}

function hWall(cells: Cell[], layer: number, y: number, x0: number, x1: number, doors: number[]): void {
  for (let x = x0; x <= x1; x += 1) setCell(cells, layer, x, y, doors.includes(x) ? 'door' : 'wall')
}

function block(cells: Cell[], layer: number, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) setCell(cells, layer, x + dx, y + dy, 'wall')
  }
}

function setStair(
  cells: Cell[],
  from: number,
  to: number,
  x: number,
  y: number,
  state: StairState,
): void {
  setCell(cells, from, x, y, 'floor')
  setCell(cells, to, x, y, 'floor')
  cells[index(from, x, y)].stair = { to, state }
  cells[index(to, x, y)].stair = { to: from, state }
}

export function createManorWorld(): World {
  const cells: Cell[] = Array.from({ length: W * H * 4 }, () => ({ terrain: 'void', stair: null }))

  // ---------- L1 地面：花园 + 庄园一层 ----------
  fill(cells, L_GROUND, { x0: 0, y0: 0, x1: W - 1, y1: H - 1 }, 'floor')
  outline(cells, L_GROUND, ESTATE, 'wall')
  for (let x = 57; x <= 60; x += 1) setCell(cells, L_GROUND, x, 77, 'door')

  // 花园：绿篱、喷泉、温室、树丛
  vWall(cells, L_GROUND, 24, 6, 48, [20, 36])
  vWall(cells, L_GROUND, 44, 6, 40, [14, 30])
  hWall(cells, L_GROUND, 44, 5, 56, [30, 48])
  hWall(cells, L_GROUND, 20, 5, 42, [12, 28])
  hWall(cells, L_GROUND, 60, 8, 50, [20, 38])

  for (let x = 32; x <= 36; x += 1) {
    setCell(cells, L_GROUND, x, 50, 'wall')
    setCell(cells, L_GROUND, x, 54, 'wall')
  }
  for (let y = 50; y <= 54; y += 1) {
    setCell(cells, L_GROUND, 32, y, 'wall')
    setCell(cells, L_GROUND, 36, y, 'wall')
  }

  outline(cells, L_GROUND, { x0: 8, y0: 8, x1: 18, y1: 16 }, 'window')
  setCell(cells, L_GROUND, 18, 12, 'door')

  for (const [x, y] of [[50, 10], [52, 66], [16, 68], [46, 60], [6, 34]] as const) {
    block(cells, L_GROUND, x, y, 2, 2)
  }

  // 庄园一层
  outline(cells, L_GROUND, MANOR, 'wall')
  setCell(cells, L_GROUND, 87, 56, 'door')
  // 东西向走廊 y=36..38
  hWall(cells, L_GROUND, 35, 65, 109, [72, 90, 105])
  hWall(cells, L_GROUND, 39, 65, 109, [70, 87, 100])
  // 北侧房间：书房 / 起居室 / 厨房
  vWall(cells, L_GROUND, 84, 13, 34, [24])
  vWall(cells, L_GROUND, 99, 13, 34, [24])
  // 南侧：大厅 / 门厅 / 餐厅
  vWall(cells, L_GROUND, 81, 40, 55, [46])
  vWall(cells, L_GROUND, 93, 40, 55, [46])
  // 窗
  for (const x of [70, 78, 90, 104]) setCell(cells, L_GROUND, x, 12, 'window')
  for (const y of [18, 30, 46]) setCell(cells, L_GROUND, 110, y, 'window')
  for (const y of [20, 34, 48]) setCell(cells, L_GROUND, 64, y, 'window')
  for (const x of [68, 78, 96] as const) setCell(cells, L_GROUND, x, 56, 'window')

  // ---------- L2 二层 ----------
  fill(cells, L_FIRST, MANOR, 'floor')
  outline(cells, L_FIRST, MANOR, 'wall')
  hWall(cells, L_FIRST, 35, 65, 109, [74, 92, 105])
  hWall(cells, L_FIRST, 39, 65, 109, [72, 87, 100])
  vWall(cells, L_FIRST, 84, 13, 34, [24])
  vWall(cells, L_FIRST, 99, 13, 34, [28])
  vWall(cells, L_FIRST, 81, 40, 55, [46])
  vWall(cells, L_FIRST, 93, 40, 55, [46])
  for (const x of [68, 80, 95, 106]) setCell(cells, L_FIRST, x, 12, 'window')
  for (const y of [20, 32, 46]) setCell(cells, L_FIRST, 110, y, 'window')
  for (const y of [18, 30, 50]) setCell(cells, L_FIRST, 64, y, 'window')

  // ---------- L3 三层（阁楼） ----------
  fill(cells, L_SECOND, ATTIC, 'floor')
  outline(cells, L_SECOND, ATTIC, 'wall')
  hWall(cells, L_SECOND, 34, 69, 105, [86])
  vWall(cells, L_SECOND, 86, 16, 33, [26])
  for (const x of [78, 96]) setCell(cells, L_SECOND, x, 16, 'window')
  for (const y of [24, 44]) setCell(cells, L_SECOND, 106, y, 'window')

  // ---------- L0 地下 ----------
  fill(cells, L_BASE, CELLAR, 'floor')
  outline(cells, L_BASE, CELLAR, 'wall')
  vWall(cells, L_BASE, 86, 15, 53, [26, 44])
  hWall(cells, L_BASE, 34, 67, 107, [96])
  // 酒架
  hWall(cells, L_BASE, 24, 70, 82, [])
  hWall(cells, L_BASE, 46, 70, 82, [])
  hWall(cells, L_BASE, 20, 90, 104, [])

  fill(cells, L_BASE, ROOT, 'floor')
  outline(cells, L_BASE, ROOT, 'wall')
  vWall(cells, L_BASE, 19, 53, 71, [62])
  vWall(cells, L_BASE, 26, 58, 66, [])

  // ---------- 楼梯 ----------
  setStair(cells, L_GROUND, L_BASE, 104, 20, 'open') // 厨房 → 酒窖
  setStair(cells, L_GROUND, L_BASE, 12, 58, 'open') // 花园 → 独立地窖
  setStair(cells, L_GROUND, L_FIRST, 70, 48, 'open') // 大厅 → 二层
  setStair(cells, L_FIRST, L_SECOND, 104, 44, 'open') // 二层 → 阁楼
  setStair(cells, L_FIRST, L_SECOND, 96, 20, 'destroyed') // 坍塌的仆役楼梯

  const ZONE_DEFS: Array<{ id: string; name: string; note: string; layer: number; rect: Rect }> = [
    { id: 'garden', name: '花园', note: '绿篱把花园切成几块，草叶上全是水。', layer: L_GROUND, rect: { x0: 3, y0: 2, x1: 60, y1: 77 } },
    { id: 'greenhouse', name: '温室', note: '玻璃上蒙着雾，花都朝着同一个方向弯。', layer: L_GROUND, rect: { x0: 8, y0: 8, x1: 18, y1: 16 } },
    { id: 'fountain', name: '喷泉', note: '水声很轻，池底沉着落叶。', layer: L_GROUND, rect: { x0: 30, y0: 48, x1: 38, y1: 56 } },
    { id: 'well', name: '井边', note: '井沿塌了一块，湿泥上有脚印。', layer: L_GROUND, rect: { x0: 10, y0: 52, x1: 20, y1: 60 } },
    { id: 'rear', name: '后院', note: '焦黑的草皮，边缘还在冒烟。', layer: L_GROUND, rect: { x0: 3, y0: 62, x1: 60, y1: 77 } },
    { id: 'gate', name: '校门与车道', note: '铁门半开，车道上积着雨水。', layer: L_GROUND, rect: { x0: 54, y0: 62, x1: 66, y1: 77 } },
    { id: 'hall', name: '大礼堂', note: '长桌还没撤，椅子倒了几把。', layer: L_GROUND, rect: { x0: 64, y0: 40, x1: 81, y1: 55 } },
    { id: 'foyer', name: '门厅', note: '正门直通这里，地砖被踩得发亮。', layer: L_GROUND, rect: { x0: 82, y0: 40, x1: 92, y1: 55 } },
    { id: 'dining', name: '餐厅', note: '餐盘摆了一半，蜡烛烧到底。', layer: L_GROUND, rect: { x0: 93, y0: 40, x1: 110, y1: 55 } },
    { id: 'corridor', name: '走廊', note: '灯忽明忽暗，广播线沿着墙走。', layer: L_GROUND, rect: { x0: 65, y0: 36, x1: 109, y1: 38 } },
    { id: 'library', name: '图书馆', note: '书架间结着霜，禁书区上了锁。', layer: L_GROUND, rect: { x0: 64, y0: 13, x1: 84, y1: 34 } },
    { id: 'classroom', name: '教室', note: '黑板上有一行被擦掉的字。', layer: L_GROUND, rect: { x0: 85, y0: 13, x1: 99, y1: 34 } },
    { id: 'kitchen', name: '厨房', note: '灶上还温着汤，后门通向后院。', layer: L_GROUND, rect: { x0: 100, y0: 13, x1: 110, y1: 34 } },
    { id: 'dorm', name: '宿舍', note: '床铺整齐，有三张是空的。', layer: L_FIRST, rect: { x0: 64, y0: 13, x1: 84, y1: 34 } },
    { id: 'guest', name: '客房', note: '窗帘拉着，桌上的信没写完。', layer: L_FIRST, rect: { x0: 85, y0: 13, x1: 99, y1: 34 } },
    { id: 'infirmary', name: '医务室', note: '药柜半开，消毒水味很重。', layer: L_FIRST, rect: { x0: 100, y0: 13, x1: 110, y1: 34 } },
    { id: 'dorm-corridor', name: '宿舍走廊', note: '地板会响，熄灯铃的线在这里。', layer: L_FIRST, rect: { x0: 65, y0: 36, x1: 109, y1: 38 } },
    { id: 'lounge-west', name: '西休息室', note: '壁炉冷了，沙发上落着灰。', layer: L_FIRST, rect: { x0: 64, y0: 40, x1: 81, y1: 55 } },
    { id: 'landing', name: '楼梯厅', note: '主楼梯在这里收口，扶手有新的划痕。', layer: L_FIRST, rect: { x0: 82, y0: 40, x1: 92, y1: 55 } },
    { id: 'lounge-east', name: '东休息室', note: '窗对着花园，玻璃上有人画过记号。', layer: L_FIRST, rect: { x0: 93, y0: 40, x1: 110, y1: 55 } },
    { id: 'attic', name: '阁楼', note: '旧课桌堆到屋顶，档案箱半开着。', layer: L_SECOND, rect: { x0: 68, y0: 16, x1: 106, y1: 52 } },
    { id: 'lab', name: '旧实验室', note: '培养槽排成一列，只有一个还有水。', layer: L_BASE, rect: { x0: 66, y0: 14, x1: 108, y1: 54 } },
    { id: 'storage', name: '旧储藏室', note: '酒架和木箱，空气里有霉味。', layer: L_BASE, rect: { x0: 8, y0: 52, x1: 30, y1: 72 } },
  ]

  for (const zone of ZONE_DEFS) {
    for (let y = zone.rect.y0; y <= zone.rect.y1; y += 1) {
      for (let x = zone.rect.x0; x <= zone.rect.x1; x += 1) {
        const cell = cells[(zone.layer * H + y) * W + x]
        if (cell.terrain !== 'void') cell.zone = zone.id
      }
    }
  }

  for (let layer = 0; layer < 4; layer += 1) {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const cell = cells[(layer * H + y) * W + x]
        if (cell.terrain !== 'void' && !cell.zone) cell.zone = 'outside'
      }
    }
  }

  const zones = Object.fromEntries([
    ...ZONE_DEFS.map(zone => [zone.id, { name: zone.name, note: zone.note }] as const),
    ['outside', { name: '校园外围', note: '围墙外的空地，雾很重。' }] as const,
  ])

  const characters: Character[] = SEEDS.map(seed => ({
    id: seed.id,
    name: seed.name,
    tint: seed.tint,
    controller: seed.controller,
    initiative: seed.initiative,
    pos: { ...seed.pos },
  }))

  const info: InfoEntry[] = WORLD_INFO.map(entry => ({
    id: entry.id,
    channel: entry.channel,
    strength: entry.strength,
    origin: entry.at,
    label: entry.label,
    ttl: entry.ttl,
  }))

  const world: World = {
    name: '私立雾影学园',
    preset: 'manor',
    width: W,
    height: H,
    layers: 4,
    layerNames: ['旧实验室', '校舍', '宿舍', '阁楼'],
    zones,
    cells,
    characters,
    info,
    round: 0,
  }
  return world
}

export function manorBounds(): { width: number; height: number; layers: number } {
  return { width: W, height: H, layers: 4 }
}
