/**
 * 按动笔的三维舞台。
 *
 * 把 `geometry.ts` 的零件放进共用的 three.js 舞台，并处理两种直接操作：
 *  - 拖动按帽：沿笔轴按压，行程直接进模型，松手由控制器决定提交与否；
 *  - 点击零件：选中并高亮（拖动则交给轨道控制转镜头）。
 *
 * 镜头只在「用户选了预设视角」时移动，用户自己转过之后不会再被抢回去。
 */

import type { StageHooks, StageRuntime } from '../../lib/stageContract'
import { CAMERA_VIEWS, type CameraViewId } from './content'
import { PEN_WORLD_SCALE, type PartId, type PenView } from './geometry'
import { PEN } from './model'

export interface PenSceneState extends PenView {
  cameraView: CameraViewId
}

export interface PenSceneCallbacks {
  /** 用户按住了按帽（开始拖动或准备点击） */
  onCapPressStart: () => void
  /** 拖动中的实时行程（mm） */
  onCapDrag: (x: number) => void
  /** 松手；dragged 表示是否真的拖动过 */
  onCapRelease: (dragged: boolean) => void
  /** 点击选中零件 */
  onPick: (partId: PartId | null) => void
}

export type PenStageRuntime = StageRuntime<PenSceneState> & {
  setCameraView: (id: CameraViewId) => void
}

const DRAG_CLICK_THRESHOLD = 5

export async function createPenScene(
  canvas: HTMLCanvasElement,
  hooks: StageHooks,
  callbacks: PenSceneCallbacks,
): Promise<PenStageRuntime> {
  const [{ createStage3D }, { createPenModel }, THREE] = await Promise.all([
    import('../../lib/stage3d'),
    import('./geometry'),
    import('three'),
  ])

  const stage = createStage3D(canvas, {
    pose: CAMERA_VIEWS.whole.pose,
    background: 0x0f1b16,
    fov: 32,
    onUserOrbit: hooks.onUserOrbit,
    near: 0.04,
    far: 40,
    minDistance: 0.55,
    maxDistance: 9,
    maxPolarAngle: Math.PI * 0.56,
  })

  const pen = createPenModel()
  stage.scene.add(pen.root)
  stage.renderer.toneMappingExposure = 0.94
  stage.scene.environmentIntensity = 0.85
  stage.keyLight.position.set(1.8, 3.4, 0.8)
  stage.keyLight.shadow.camera.left = -2.4
  stage.keyLight.shadow.camera.right = 2.4
  stage.keyLight.shadow.camera.top = 3.6
  stage.keyLight.shadow.camera.bottom = -1.5
  stage.keyLight.shadow.normalBias = 0.004
  stage.keyLight.shadow.camera.updateProjectionMatrix()
  const rim = new THREE.DirectionalLight(0xe3f0ff, 1.15)
  rim.position.set(-1.5, 1.8, 3.8)
  stage.scene.add(rim)

  // 接影用的地面：只在浅色底上留一层淡淡的影子，不画地平线
  const shadowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ opacity: 0.12 }),
  )
  shadowFloor.rotation.x = -Math.PI / 2
  shadowFloor.position.y = -0.145
  shadowFloor.receiveShadow = true
  stage.scene.add(shadowFloor)

  /* ---------------- 交互 ---------------- */

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  /** 笔轴（世界坐标）：拖动时把指针投影到这条线上取轴向位置 */
  const axis = new THREE.Line3(
    new THREE.Vector3(0, 0, -0.4),
    new THREE.Vector3(0, 0, (PEN.nominalLength + 20) * PEN_WORLD_SCALE),
  )
  const pointOnRay = new THREE.Vector3()
  const pointOnAxis = new THREE.Vector3()

  let capGesture = false
  let dragging = false
  let pressed = false
  let moved = 0
  let downAt = 0
  let lastPointer = { x: 0, y: 0 }
  let dragStartZ = 0
  let dragStartX = 0
  let latestX = 0

  const setPointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, stage.camera)
  }

  /** 由指针射线求出沿笔轴的位移 x（mm） */
  const axialFromPointer = (): number => {
    raycaster.ray.distanceSqToSegment(axis.start, axis.end, pointOnRay, pointOnAxis)
    const x = dragStartX + (dragStartZ - pointOnAxis.z) / PEN_WORLD_SCALE
    return Math.max(PEN.xRetracted, Math.min(PEN.xMax, x))
  }

  const hitsCap = (): boolean => {
    const hits = raycaster.intersectObject(pen.capHitArea, false)
    return hits.length > 0
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    setPointer(event)
    pressed = true
    moved = 0
    downAt = performance.now()
    lastPointer = { x: event.clientX, y: event.clientY }

    if (hitsCap()) {
      raycaster.ray.distanceSqToSegment(axis.start, axis.end, pointOnRay, pointOnAxis)
      dragStartZ = pointOnAxis.z
      dragStartX = latestX
      // 先按住，真的拖动超过阈值才进入拖动；只是点一下仍然算「按一下」
      capGesture = true
      stage.controls.enabled = false
      canvas.setPointerCapture(event.pointerId)
      canvas.style.cursor = 'grabbing'
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!pressed && event.target !== canvas) return
    setPointer(event)
    const d = Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y)
    moved += d
    lastPointer = { x: event.clientX, y: event.clientY }

    if (capGesture) {
      if (!dragging && moved > 3) {
        dragging = true
        callbacks.onCapPressStart()
      }
      if (dragging) callbacks.onCapDrag(axialFromPointer())
      return
    }

    if (!pressed) {
      // 悬停在按帽上时给出可拖动的提示
      canvas.style.cursor = hitsCap() ? 'grab' : 'default'
    }
  }

  const finishPointer = (event: PointerEvent, cancelled: boolean) => {
    if (!pressed) return
    const wasCap = capGesture
    const wasDragging = dragging
    const isClick = !cancelled && moved < DRAG_CLICK_THRESHOLD && performance.now() - downAt < 600

    if (wasCap) {
      capGesture = false
      dragging = false
      stage.controls.enabled = true
      canvas.style.cursor = 'default'
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      if (!cancelled || wasDragging) callbacks.onCapRelease(wasDragging)
    } else if (isClick) {
      setPointer(event)
      callbacks.onPick(pen.pick(raycaster))
    }

    pressed = false
  }

  const onPointerUp = (event: PointerEvent) => finishPointer(event, false)
  const onPointerCancel = (event: PointerEvent) => finishPointer(event, true)

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)

  /* ---------------- 状态 ---------------- */

  let lastCameraView: CameraViewId | null = null

  const runtime: PenStageRuntime = {
    update(state) {
      latestX = state.x
      pen.update(state)
      if (state.cameraView !== lastCameraView) {
        lastCameraView = state.cameraView
        stage.setView(CAMERA_VIEWS[state.cameraView].pose, 0.75)
      }
    },
    render() {
      stage.render()
    },
    resize(width, height, dpr) {
      // 窄屏保持水平视野，整笔不会因为正方形展台而被裁掉两端。
      const aspect = width / Math.max(1, height)
      stage.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(16)) * Math.max(1, 1.5 / aspect)))
      stage.resize(width, height, dpr)
    },
    resetCamera() {
      stage.resetView()
    },
    setCameraView(id) {
      lastCameraView = id
      stage.setView(CAMERA_VIEWS[id].pose, 0.7)
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      pen.dispose()
      stage.dispose()
    },
  }

  return runtime
}
