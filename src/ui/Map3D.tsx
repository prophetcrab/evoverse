import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Channel, World } from '../world/types'
import { cellIndex } from '../world/types'
import { chromaOf } from '../world/terrain'
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

const LAYER_GAP = 9
const HIDDEN_POSITION = new THREE.Vector3(0, -1000, 0)
const HIDDEN_SCALE = new THREE.Vector3(0.0001, 0.0001, 0.0001)
const IDENTITY_ROTATION = new THREE.Quaternion()
const FIELD_TINT: Record<Channel, number> = {
  vision: 0xffd166,
  sound: 0x4aa3ff,
  smell: 0x9b6bff,
}

interface Bundle {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  controls: OrbitControls
  layers: THREE.InstancedMesh[]
  outlines: Array<{ mesh: THREE.LineSegments; layer: number }>
  baseColors: THREE.Color[][]
  characters: Map<string, THREE.Mesh>
  characterLayers: Map<string, number>
  ring: THREE.Mesh
  home: { position: THREE.Vector3; target: THREE.Vector3 }
  dispose: () => void
}

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** 同层内按四邻接连通分量切分，用于给每块地板单独描边。 */
function layerRegions(world: World, layer: number): Rect[] {
  const seen = new Uint8Array(world.width * world.height)
  const regions: Rect[] = []
  const stack: Array<[number, number]> = []
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      const start = y * world.width + x
      if (seen[start]) continue
      seen[start] = 1
      if (world.cells[cellIndex(world, { layer, x, y })].terrain === 'void') continue
      const rect: Rect = { x0: x, y0: y, x1: x, y1: y }
      stack.push([x, y])
      while (stack.length > 0) {
        const [cx, cy] = stack.pop() as [number, number]
        rect.x0 = Math.min(rect.x0, cx)
        rect.x1 = Math.max(rect.x1, cx)
        rect.y0 = Math.min(rect.y0, cy)
        rect.y1 = Math.max(rect.y1, cy)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue
          const next = ny * world.width + nx
          if (seen[next]) continue
          seen[next] = 1
          if (world.cells[cellIndex(world, { layer, x: nx, y: ny })].terrain === 'void') continue
          stack.push([nx, ny])
        }
      }
      regions.push(rect)
    }
  }
  return regions
}

function build(world: World, host: HTMLDivElement): Bundle {
  const width = host.clientWidth || 900
  const height = host.clientHeight || 640
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height)
  renderer.setClearColor(0x0f1216, 1)
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x0f1216, Math.max(world.width, world.height) * 1.6, Math.max(world.width, world.height) * 4.2)

  const aspect = width / Math.max(1, height)
  const view = Math.max(world.width, world.height) * 0.62
  const camera = new THREE.OrthographicCamera(-view * aspect, view * aspect, view, -view, 0.1, 6000)
  camera.position.set(world.width * 0.72, world.height * 0.85 + world.layers * 4.2, world.height * 0.95)
  camera.lookAt(0, 0, 0)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.screenSpacePanning = true
  controls.minPolarAngle = 0.12
  controls.maxPolarAngle = Math.PI / 2.15
  controls.target.set(0, ((world.layers - 1) * LAYER_GAP) / 2, 0)
  controls.update()

  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const key = new THREE.DirectionalLight(0xffffff, 1.1)
  key.position.set(world.width, world.height * 2, world.height)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x88aaff, 0.35)
  fill.position.set(-world.width, world.height, -world.height)
  scene.add(fill)

  const boxGeometry = new THREE.BoxGeometry(0.9, 0.24, 0.9)
  const layers: THREE.InstancedMesh[] = []
  const outlines: Array<{ mesh: THREE.LineSegments; layer: number }> = []
  const baseColors: THREE.Color[][] = []
  const matrix = new THREE.Matrix4()
  const outlineGeometryCache = new Map<string, THREE.EdgesGeometry>()

  for (let layer = 0; layer < world.layers; layer += 1) {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.04, transparent: true })
    const mesh = new THREE.InstancedMesh(boxGeometry, material, world.width * world.height)
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.userData.layer = layer
    const bases: THREE.Color[] = []
    let i = 0
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const cell = world.cells[cellIndex(world, { layer, x, y })]
        if (cell.terrain === 'void') {
          matrix.compose(HIDDEN_POSITION, IDENTITY_ROTATION, HIDDEN_SCALE)
          mesh.setMatrixAt(i, matrix)
          bases.push(new THREE.Color('#0b0e12'))
          mesh.setColorAt(i, new THREE.Color('#0b0e12'))
          i += 1
          continue
        }
        matrix.makeTranslation(x - world.width / 2, layer * LAYER_GAP, y - world.height / 2)
        mesh.setMatrixAt(i, matrix)
        const base = new THREE.Color(chromaOf(cell))
        bases.push(base)
        mesh.setColorAt(i, base)
        i += 1
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    layers.push(mesh)
    baseColors.push(bases)
    scene.add(mesh)

    for (const rect of layerRegions(world, layer)) {
      const key = `${rect.x1 - rect.x0 + 1}x${rect.y1 - rect.y0 + 1}`
      let edges = outlineGeometryCache.get(key)
      if (!edges) {
        edges = new THREE.EdgesGeometry(
          new THREE.BoxGeometry(rect.x1 - rect.x0 + 1, 0.04, rect.y1 - rect.y0 + 1),
        )
        outlineGeometryCache.set(key, edges)
      }
      const outline = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.2 }),
      )
      outline.position.set(
        (rect.x0 + rect.x1) / 2 - world.width / 2,
        layer * LAYER_GAP - 0.14,
        (rect.y0 + rect.y1) / 2 - world.height / 2,
      )
      outlines.push({ mesh: outline, layer })
      scene.add(outline)
    }
  }

  const characters = new Map<string, THREE.Mesh>()
  const characterLayers = new Map<string, number>()
  for (const character of world.characters) {
    const geometry = new THREE.CylinderGeometry(0.26, 0.3, 0.86, 12)
    const material = new THREE.MeshStandardMaterial({
      color: character.tint,
      roughness: 0.6,
      transparent: true,
      opacity: 1,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(
      character.pos.x - world.width / 2,
      character.pos.layer * LAYER_GAP + 0.56,
      character.pos.y - world.height / 2,
    )
    mesh.userData.characterId = character.id
    characters.set(character.id, mesh)
    characterLayers.set(character.id, character.pos.layer)
    scene.add(mesh)
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.36, 0.5, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.visible = false
  scene.add(ring)

  let frame = 0
  const animate = () => {
    frame = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  const resize = () => {
    const w = host.clientWidth || 900
    const h = host.clientHeight || 640
    const nextAspect = w / Math.max(1, h)
    camera.left = -view * nextAspect
    camera.right = view * nextAspect
    camera.top = view
    camera.bottom = -view
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)

  return {
    renderer,
    scene,
    camera,
    controls,
    layers,
    outlines,
    baseColors,
    characters,
    characterLayers,
    ring,
    home: { position: camera.position.clone(), target: controls.target.clone() },
    dispose: () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      for (const mesh of layers) {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
        mesh.dispose()
      }
      for (const outline of outlines) {
        ;(outline.mesh.material as THREE.Material).dispose()
      }
      for (const edges of outlineGeometryCache.values()) edges.dispose()
      for (const mesh of characters.values()) {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      }
      ring.geometry.dispose()
      ;(ring.material as THREE.Material).dispose()
      renderer.forceContextLoss()
      renderer.dispose()
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement)
    },
  }
}

export function Map3D({ world, layer, field, channel, selected, onSelect, resetSignal }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const bundleRef = useRef<Bundle | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const bundle = build(world, host)
    bundleRef.current = bundle

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const onClick = (event: PointerEvent) => {
      const rect = bundle.renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, bundle.camera)

      const characterHits = raycaster.intersectObjects([...bundle.characters.values()], false)
      if (characterHits[0]) {
        const id = characterHits[0].object.userData.characterId as string
        onSelect({ kind: 'character', id })
        return
      }
      const cellHits = raycaster.intersectObjects(bundle.layers, false)
      const hit = cellHits[0]
      if (hit && hit.instanceId !== undefined) {
        const layerIndex = hit.object.userData.layer as number
        const x = hit.instanceId % world.width
        const y = Math.floor(hit.instanceId / world.width)
        if (world.cells[cellIndex(world, { layer: layerIndex, x, y })].terrain === 'void') return
        onSelect({ kind: 'cell', at: { layer: layerIndex, x, y } })
      }
    }
    bundle.renderer.domElement.addEventListener('pointerup', onClick)

    return () => {
      bundle.renderer.domElement.removeEventListener('pointerup', onClick)
      bundle.dispose()
      bundleRef.current = null
    }
  }, [world, onSelect])

  useEffect(() => {
    const bundle = bundleRef.current
    if (!bundle) return
    const matrix = new THREE.Matrix4()
    bundle.layers.forEach((mesh, index) => {
      const material = mesh.material as THREE.MeshStandardMaterial
      const active = index === layer
      material.opacity = active ? 1 : 0.55
      material.depthWrite = active
      // 低于当前层的偏冷、高于当前层的偏暖，帮助区分叠层
      material.color.set(active ? 0xffffff : index < layer ? 0x9db4ff : 0xffd9a8)
      mesh.renderOrder = active ? 1 : 0

      let i = 0
      for (let y = 0; y < world.height; y += 1) {
        for (let x = 0; x < world.width; x += 1) {
          const cell = world.cells[cellIndex(world, { layer: index, x, y })]
          const hidden = cell.terrain === 'void' || (!active && cell.terrain === 'floor' && !cell.stair)
          if (hidden) {
            matrix.compose(HIDDEN_POSITION, IDENTITY_ROTATION, HIDDEN_SCALE)
          } else {
            matrix.makeTranslation(x - world.width / 2, index * LAYER_GAP, y - world.height / 2)
          }
          mesh.setMatrixAt(i, matrix)
          i += 1
        }
      }
      mesh.instanceMatrix.needsUpdate = true
    })
    for (const outline of bundle.outlines) {
      const active = outline.layer === layer
      const lineMaterial = outline.mesh.material as THREE.LineBasicMaterial
      lineMaterial.color.set(active ? 0x4aa3ff : 0x334155)
      lineMaterial.opacity = active ? 0.8 : 0.12
    }
    for (const [id, mesh] of bundle.characters) {
      const material = mesh.material as THREE.MeshStandardMaterial
      material.opacity = bundle.characterLayers.get(id) === layer ? 1 : 0.3
      material.depthWrite = material.opacity > 0.5
    }
  }, [layer, world])

  useEffect(() => {
    const bundle = bundleRef.current
    if (!bundle) return
    const tintColor = channel ? new THREE.Color(FIELD_TINT[channel]) : null
    bundle.layers.forEach((mesh, layerIndex) => {
      const bases = bundle.baseColors[layerIndex]
      const temp = new THREE.Color()
      for (let i = 0; i < bases.length; i += 1) {
        const base = bases[i]
        temp.copy(base)
        if (tintColor && field) {
          const x = i % world.width
          const y = Math.floor(i / world.width)
          const value = field[cellIndex(world, { layer: layerIndex, x, y })]
          if (value > 50) {
            const alpha = Math.min(0.72, (value / 1000) * 0.72)
            temp.lerp(tintColor, alpha)
          }
        }
        mesh.setColorAt(i, temp)
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
  }, [field, channel, world])

  useEffect(() => {
    const bundle = bundleRef.current
    if (!bundle) return
    if (selected?.kind === 'character') {
      const character = world.characters.find(ch => ch.id === selected.id)
      if (character) {
        bundle.ring.visible = true
        bundle.ring.position.set(
          character.pos.x - world.width / 2,
          character.pos.layer * LAYER_GAP + 0.26,
          character.pos.y - world.height / 2,
        )
        return
      }
    }
    bundle.ring.visible = false
  }, [selected, world])

  useEffect(() => {
    const bundle = bundleRef.current
    if (!bundle) return
    if (resetSignal > 0) {
      bundle.camera.position.copy(bundle.home.position)
      bundle.controls.target.copy(bundle.home.target)
      bundle.controls.update()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])

  return <div className="map-wrap map-3d" ref={hostRef} />
}
