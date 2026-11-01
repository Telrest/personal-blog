/**
 * 骨骼展品的舞台层：镜头预设、直接拾取、标注投影与释放。
 *
 * 镜头只由三种原因移动：用户自己转、用户点预设、用户点「回到默认视角」。
 * 页签切换会换到该页签的默认镜头——因为三个页签看的是不同尺度的对象，
 * 页内则完全尊重用户的镜头。
 */

import * as THREE from 'three'
import type { StageHooks, StageRuntime } from '../../lib/stageContract'
import { createStage3D } from '../../lib/stage3d'
import { createBoneModel, type BoneSceneView } from './geometry'
import { DEFAULT_CAMERA, type CameraId } from './state'
import type { TabId } from './model'
import { BONE_FOV, boneFieldOfView, fitBoneView } from './view'

export interface ScreenLabel {
  id: string
  x: number
  y: number
  visible: boolean
}

export interface BoneLabelRequest {
  id: string
  anchor: string
}

export interface BoneStageState extends BoneSceneView {
  camera: CameraId
  cameraNonce: number
  labels: BoneLabelRequest[]
}

export interface BoneSceneCallbacks {
  onPick: (id: string | null) => void
  /** 每帧一次：标注锚点在画布上的位置（直接写 DOM，不经过 React 状态） */
  onLabels: (labels: ScreenLabel[]) => void
}

export type BoneStageRuntime = StageRuntime<BoneStageState>

const FOV = BONE_FOV
const CLICK_DRAG_LIMIT = 5

export async function createBoneScene(
  canvas: HTMLCanvasElement,
  hooks: StageHooks,
  callbacks: BoneSceneCallbacks,
): Promise<BoneStageRuntime> {
  const model = await createBoneModel()

  const stage = createStage3D(canvas, {
    pose: { position: [0, 0, 10], target: [0, 0, 0] },
    background: 0x0f1b16,
    fov: FOV,
    near: 0.02,
    far: 80,
    minDistance: 0.6,
    maxDistance: 26,
    maxPolarAngle: Math.PI * 0.94,
    onUserOrbit: hooks.onUserOrbit,
  })
  stage.scene.add(model.root)
  stage.renderer.toneMappingExposure = 0.92
  stage.renderer.shadowMap.type = THREE.PCFShadowMap
  stage.scene.environmentIntensity = 0.6
  stage.keyLight.intensity = 1.45
  stage.keyLight.position.set(1.8, 2.6, 6.2)
  stage.keyLight.shadow.camera.left = -3
  stage.keyLight.shadow.camera.right = 3
  stage.keyLight.shadow.camera.top = 3
  stage.keyLight.shadow.camera.bottom = -3
  stage.keyLight.shadow.camera.near = 0.1
  stage.keyLight.shadow.camera.far = 22
  stage.keyLight.shadow.normalBias = 0.006
  stage.keyLight.shadow.camera.updateProjectionMatrix()
  const fill = new THREE.DirectionalLight(0xdfe8f2, 0.5)
  fill.position.set(-3.4, 1.0, 3.2)
  stage.scene.add(fill)

  // 接影底板：在模型后方接住阴影，给骨架一点深度
  const bounds = model.bounds()
  const center = bounds.getCenter(new THREE.Vector3())
  const shadowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShadowMaterial({ opacity: 0.08 }),
  )
  shadowFloor.name = 'shadow-floor'
  shadowFloor.position.set(center.x, center.y, bounds.min.z - 0.05)
  shadowFloor.receiveShadow = true
  stage.scene.add(shadowFloor)

  const toeBounds = model.bounds('toe')
  const minimum = (box: THREE.Box3) => box.min.toArray() as [number, number, number]
  const maximum = (box: THREE.Box3) => box.max.toArray() as [number, number, number]
  const poses = {
    dorsal: fitBoneView(minimum(bounds), maximum(bounds), [0, 0, 1]),
    plantar: fitBoneView(minimum(bounds), maximum(bounds), [0, 0, -1]),
    lateral: fitBoneView(minimum(bounds), maximum(bounds), [1, 0.05, 0.15]),
    local: fitBoneView(minimum(toeBounds), maximum(toeBounds), [0.22, 0.05, 1]),
    load: fitBoneView(minimum(toeBounds), maximum(toeBounds), [0.22, 0.12, 1], 1.3),
    repair: fitBoneView(minimum(toeBounds), maximum(toeBounds), [0.22, 0.05, 1], 1.18),
  }

  /* ---------------- 拾取 ---------------- */

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let downX = 0
  let downY = 0
  let downAt = 0
  let pressed = false

  const setPointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
    raycaster.setFromCamera(pointer, stage.camera)
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    pressed = true
    downX = event.clientX
    downY = event.clientY
    downAt = performance.now()
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!pressed) return
    pressed = false
    const moved = Math.hypot(event.clientX - downX, event.clientY - downY)
    if (moved > CLICK_DRAG_LIMIT || performance.now() - downAt > 700) return
    setPointer(event)
    callbacks.onPick(model.pick(raycaster))
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)

  /* ---------------- 状态 ---------------- */

  let lastCamera: CameraId | null = null
  let lastTab: TabId = 'structure'
  let lastRequest = -1
  let width = 1
  let height = 1
  let pendingLabels: BoneLabelRequest[] = []
  const scratch = new THREE.Vector3()
  const screen: ScreenLabel[] = []

  const runtime: BoneStageRuntime = {
    update(state) {
      lastTab = state.tab
      model.update(state)
      pendingLabels = state.labels
      if (state.camera !== lastCamera || state.cameraNonce !== lastRequest) {
        const initial = lastCamera === null
        lastCamera = state.camera
        lastRequest = state.cameraNonce
        stage.setView(poses[state.camera], initial ? 0 : 0.6)
      }
    },

    render() {
      stage.render()
      if (pendingLabels.length === 0) {
        callbacks.onLabels([])
        return
      }
      screen.length = 0
      for (const request of pendingLabels) {
        const anchor = model.anchor(request.anchor)
        if (!anchor) continue
        scratch.copy(anchor).applyMatrix4(model.root.matrixWorld).project(stage.camera)
        const visible = scratch.z > -1 && scratch.z < 1 && Math.abs(scratch.x) < 1 && Math.abs(scratch.y) < 1
        screen.push({
          id: request.id,
          x: (scratch.x * 0.5 + 0.5) * width,
          y: (-scratch.y * 0.5 + 0.5) * height,
          visible,
        })
      }
      callbacks.onLabels(screen.slice())
    },

    resize(w, h, dpr) {
      width = Math.max(1, w)
      height = Math.max(1, h)
      stage.camera.fov = boneFieldOfView(width / height)
      stage.resize(width, height, Math.min(dpr, 1.5))
    },

    resetCamera() {
      const pose = poses[DEFAULT_CAMERA[lastTab]]
      lastCamera = DEFAULT_CAMERA[lastTab]
      stage.setView(pose, 0.7)
    },

    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      stage.scene.remove(model.root)
      model.dispose()
      stage.dispose()
    },
  }

  stage.setView(poses.dorsal, 0)
  return runtime
}
