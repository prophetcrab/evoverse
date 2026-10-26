import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Channel, Coord, World } from '../world/types'
import { cellAt, cellIndex, inBounds } from '../world/types'
import { STAIR_LABEL, TERRAIN_LABEL, chromaOf } from '../world/terrain'
import type { Selection } from './types'

interface Props {
  world: World
  layer: number
  field: Float32Array | null
  channel: Channel | null
  selected: Selection | null
  onSelect: (selection: Selection | null) => void
  resetSignal: number
}

const FIELD_TINT: Record<Channel, [number, number, number]> = {
  vision: [255, 209, 102],
  sound: [74, 163, 255],
  smell: [155, 107, 255],
}

const MIN_SCALE = 2
const MAX_SCALE = 44

export function Map2D({ world, layer, field, channel, selected, onSelect, resetSignal }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 900, h: 640 })
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 8 })
  const [hover, setHover] = useState<Coord | null>(null)
  const drag = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null)
  const fittedFor = useRef<string | null>(null)
  const hasVoid = world.cells.some(cell => cell.terrain === 'void')

  const contentBounds = useCallback(() => {
    let x0 = world.width
    let y0 = world.height
    let x1 = -1
    let y1 = -1
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        if (cellAt(world, { layer, x, y }).terrain === 'void') continue
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
    }
    if (x1 < 0) return { x0: 0, y0: 0, x1: world.width - 1, y1: world.height - 1 }
    return { x0, y0, x1, y1 }
  }, [world, layer])

  const fit = useCallback(() => {
    const bounds = contentBounds()
    const width = bounds.x1 - bounds.x0 + 1
    const height = bounds.y1 - bounds.y0 + 1
    const scale = Math.max(MIN_SCALE, Math.min(size.w / (width + 1), size.h / (height + 1)) * 0.92)
    setCamera({
      x: (size.w - width * scale) / 2 - bounds.x0 * scale,
      y: (size.h - height * scale) / 2 - bounds.y0 * scale,
      scale,
    })
  }, [size.w, size.h, contentBounds])

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ w: Math.max(200, rect.width), h: Math.max(200, rect.height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (size.w < 100) return
    const key = `${world.name}:${world.width}x${world.height}:${hasVoid ? layer : 'all'}:${Math.round(size.w)}x${Math.round(size.h)}`
    if (fittedFor.current === key) return
    fittedFor.current = key
    fit()
  }, [world, size.w, size.h, fit, hasVoid, layer])

  // 换世界时旧坐标可能已越界
  useEffect(() => {
    setHover(null)
  }, [world])

  useEffect(() => {
    if (resetSignal > 0) fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const sx = event.clientX - rect.left
      const sy = event.clientY - rect.top
      const factor = event.deltaY > 0 ? 0.88 : 1.14
      setCamera(prev => {
        const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor))
        const ratio = scale / prev.scale
        return {
          scale,
          x: sx - (sx - prev.x) * ratio,
          y: sy - (sy - prev.y) * ratio,
        }
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(size.w * dpr)
    canvas.height = Math.floor(size.h * dpr)
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0f1216'
    ctx.fillRect(0, 0, size.w, size.h)

    const { x: ox, y: oy, scale } = camera
    const x0 = Math.max(0, Math.floor(-ox / scale))
    const y0 = Math.max(0, Math.floor(-oy / scale))
    const x1 = Math.min(world.width - 1, Math.ceil((size.w - ox) / scale))
    const y1 = Math.min(world.height - 1, Math.ceil((size.h - oy) / scale))

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const c = { layer, x, y }
        const cell = cellAt(world, c)
        if (cell.terrain === 'void') continue
        const px = ox + x * scale
        const py = oy + y * scale
        ctx.fillStyle = chromaOf(cell)
        ctx.fillRect(px, py, scale + 0.6, scale + 0.6)

        if (field && channel) {
          const value = field[cellIndex(world, c)]
          if (value > 50) {
            const [r, g, b] = FIELD_TINT[channel]
            const alpha = Math.min(0.62, (value / 1000) * 0.62)
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
            ctx.fillRect(px, py, scale + 0.6, scale + 0.6)
          }
        }

        if (cell.stair && scale >= 6) {
          ctx.strokeStyle = 'rgba(10, 14, 18, 0.75)'
          ctx.lineWidth = Math.max(1, scale * 0.09)
          ctx.beginPath()
          ctx.moveTo(px + scale * 0.2, py + scale * 0.8)
          ctx.lineTo(px + scale * 0.5, py + scale * 0.2)
          ctx.lineTo(px + scale * 0.8, py + scale * 0.8)
          ctx.stroke()
        }
      }
    }

    if (scale >= 12 && !hasVoid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = x0; x <= x1 + 1; x += 1) {
        const px = Math.round(ox + x * scale) + 0.5
        ctx.moveTo(px, oy + y0 * scale)
        ctx.lineTo(px, oy + (y1 + 1) * scale)
      }
      for (let y = y0; y <= y1 + 1; y += 1) {
        const py = Math.round(oy + y * scale) + 0.5
        ctx.moveTo(ox + x0 * scale, py)
        ctx.lineTo(ox + (x1 + 1) * scale, py)
      }
      ctx.stroke()
    }

    for (const character of world.characters) {
      if (character.pos.layer !== layer) continue
      const px = ox + (character.pos.x + 0.5) * scale
      const py = oy + (character.pos.y + 0.5) * scale
      const radius = Math.max(3.2, Math.min(9, scale * 0.3))
      const isSelected = selected?.kind === 'character' && selected.id === character.id
      ctx.beginPath()
      ctx.arc(px, py, radius, 0, Math.PI * 2)
      if (character.controller === 'agent') {
        ctx.fillStyle = character.tint
        ctx.fill()
      } else {
        ctx.strokeStyle = character.tint
        ctx.lineWidth = Math.max(1.4, radius * 0.34)
        ctx.stroke()
      }
      if (isSelected) {
        ctx.beginPath()
        ctx.arc(px, py, radius + 4, 0, Math.PI * 2)
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.6
        ctx.stroke()
      }
    }

    if (hover && hover.layer === layer && inBounds(world, hover)) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(ox + hover.x * scale, oy + hover.y * scale, scale, scale)
    }
  }, [world, layer, field, channel, selected, camera, size, hover, hasVoid])

  const cellFromEvent = (event: ReactPointerEvent): Coord => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    return {
      layer,
      x: Math.floor((sx - camera.x) / camera.scale),
      y: Math.floor((sy - camera.y) / camera.scale),
    }
  }

  const pick = (event: ReactPointerEvent): Selection | null => {    const target = cellFromEvent(event)
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    for (const character of world.characters) {
      if (character.pos.layer !== layer) continue
      const px = camera.x + (character.pos.x + 0.5) * camera.scale
      const py = camera.y + (character.pos.y + 0.5) * camera.scale
      if (Math.hypot(px - sx, py - sy) <= Math.max(7, camera.scale * 0.45)) {
        return { kind: 'character', id: character.id }
      }
    }
    if (target.x < 0 || target.y < 0 || target.x >= world.width || target.y >= world.height) return null
    return { kind: 'cell', at: target }
  }

  const hoverCell = hover && hover.layer === layer && inBounds(world, hover) ? cellAt(world, hover) : null

  return (
    <div className="map-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="map-canvas"
        onPointerDown={event => {
          drag.current = {
            px: event.clientX,
            py: event.clientY,
            ox: camera.x,
            oy: camera.y,
            moved: false,
          }
          ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const current = drag.current
          if (current) {
            const dx = event.clientX - current.px
            const dy = event.clientY - current.py
            if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true
            setCamera(prev => ({ ...prev, x: current.ox + dx, y: current.oy + dy }))
          }
          const next = cellFromEvent(event)
          setHover(inBounds(world, next) ? next : null)
        }}
        onPointerUp={event => {
          const current = drag.current
          drag.current = null
          if (current && !current.moved) onSelect(pick(event))
        }}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={fit}
      />
      <div className="map-hud">
        <span>{world.layerNames?.[layer] ?? `第 ${layer} 层`}</span>
        <span className="dim">回合 {world.round}</span>
        <span className="dim">{Math.round(camera.scale)} px/格</span>
        {channel ? <span className="accent">{channel}</span> : <span className="dim">无叠加</span>}
      </div>
      {hoverCell && hover && (
        <div className="map-tooltip">
          ({hover.x}, {hover.y}) · {(hoverCell.zone ? world.zones?.[hoverCell.zone]?.name : undefined) ?? TERRAIN_LABEL[hoverCell.terrain]}
          {hoverCell.stair ? ` · 楼梯 ${STAIR_LABEL[hoverCell.stair.state]}` : ''}
          {field ? ` · ${Math.round(field[cellIndex(world, hover)] ?? 0)}` : ''}
        </div>
      )}
    </div>
  )
}
