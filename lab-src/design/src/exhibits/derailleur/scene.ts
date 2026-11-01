/**
 * 变速器展品的三维舞台。
 *
 * 把 `geometry.ts` 的零件放进共用舞台，并处理三种直接操作：
 *  - 点选零件：单击高亮并交给页面解释，拖动则转镜头；
 *  - 预设镜头：整车 / 传动侧 / 后方 / 后拨放大 / 链条路径；
 *  - 旁观者模式：指针锁定后用 WASD 自由飞行、鼠标环顾（单独的一种观看模式）。
 *
 * 镜头只在用户选了预设视角、点了「回到默认视角」或进入旁观者模式时移动，
 * 用户自己转过之后不会被抢回去。
 */

import type { StageHooks, StageRuntime } from '../../lib/stageContract'
import { CAMERA_VIEWS, type CameraViewId } from './content'
import { createBikeModel, type DerailleurView, type PartId } from './geometry'

/**
 * 舞台状态 = 模型派生出的零件姿态 + 当前预设镜头 + 是否旁观者模式。
 * 前轮转角由舞台自己维护（彩蛋：用鼠标拨前轮），所以这里不要求外部传。
 */
export interface DerailleurSceneState extends Omit<DerailleurView, 'frontWheelAngle'> {
  cameraView: CameraViewId
  /** 旁观者模式：轨道控制停用，改用指针锁定 + WASD */
  spectator: boolean
}

export interface DerailleurSceneCallbacks {
  onPick: (part: PartId | null) => void
  /** 指针锁定被系统解除（例如按了 Esc）时通知页面退出旁观者模式 */
  onExitSpectator: () => void
  /** 旁观者模式下滚轮换挡：+1 = 换轻挡（更大后齿片），-1 = 换重挡 */
  onShiftStep: (delta: number) => void
}

const CLICK_MOVE_THRESHOLD = 5
const CLICK_TIME_LIMIT = 600
/** 旁观者模式：鼠标灵敏度（rad / px）与移动速度（m/s） */
const LOOK_SENSITIVITY = 0.0022
const WALK_SPEED = 1.3
const SPRINT_SPEED = 3.4

export async function createDerailleurScene(
  canvas: HTMLCanvasElement,
  hooks: StageHooks,
  callbacks: DerailleurSceneCallbacks,
): Promise<StageRuntime<DerailleurSceneState>> {
  const [{ createStage3D }, THREE] = await Promise.all([import('../../lib/stage3d'), import('three')])

  const stage = createStage3D(canvas, {
    pose: CAMERA_VIEWS.whole.pose,
    background: 0x0f1b16,
    fov: 34,
    near: 0.02,
    far: 60,
    minDistance: 0.12,
    maxDistance: 7,
    maxPolarAngle: Math.PI * 0.495,
    onUserOrbit: hooks.onUserOrbit,
  })

  // 灯光按整车尺度调整：阴影相机要罩住 1.2 m 长的车
  stage.keyLight.position.set(1.1, 1.9, 1.3)
  stage.keyLight.shadow.camera.left = -0.9
  stage.keyLight.shadow.camera.right = 0.9
  stage.keyLight.shadow.camera.top = 1.1
  stage.keyLight.shadow.camera.bottom = -0.6
  stage.keyLight.shadow.camera.near = 0.1
  stage.keyLight.shadow.camera.far = 6
  stage.keyLight.shadow.mapSize.set(2048, 2048)
  stage.keyLight.shadow.bias = -0.0006
  stage.keyLight.shadow.normalBias = 0.006
  stage.keyLight.shadow.camera.updateProjectionMatrix()
  stage.scene.environmentIntensity = 0.55
  stage.renderer.toneMappingExposure = 1

  const bike = createBikeModel()
  stage.scene.add(bike.root)


  // 地面：只接影子，不画地平线，浅色底上让车落地
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.ShadowMaterial({ opacity: 0.16 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = 0
  ground.receiveShadow = true
  stage.scene.add(ground)

  /* ---------------- 旁观者模式：指针锁定 + WASD 自由飞行 ----------------
   * 独立的一种观看模式：轨道控制停用，鼠标环顾、WASD 平移、Q/E 升降、Shift 加速。
   * 进入时先把当前相机朝向换算成 yaw/pitch，所以视角不会突然跳。
   */

  let spectator = false
  let locked = false
  let lookDragging = false
  let lastLook = { x: 0, y: 0 }
  let yaw = 0
  let pitch = 0
  const keys = new Set<string>()
  const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ')
  const moveVector = new THREE.Vector3()
  const forwardVector = new THREE.Vector3()
  const rightVector = new THREE.Vector3()

  const applySpectator = (enabled: boolean) => {
    if (enabled === spectator) return
    spectator = enabled
    if (enabled) {
      // 用当前朝向初始化 yaw / pitch（YXZ 顺序下从四元数取欧拉角）
      lookEuler.setFromQuaternion(stage.camera.quaternion, 'YXZ')
      yaw = lookEuler.y
      pitch = lookEuler.x
      stage.controls.enabled = false
      keys.clear()
      lookDragging = false
      return
    }
    // 退出：把轨道控制的目标放到相机正前方，避免镜头被拉回旧焦点
    keys.clear()
    lookDragging = false
    locked = false
    stage.controls.enabled = true
    forwardVector.set(0, 0, -1).applyEuler(lookEuler)
    stage.controls.target.copy(stage.camera.position).addScaledVector(forwardVector, 1.2)
    stage.controls.update()
  }

  const applyLook = (dx: number, dy: number) => {
    yaw -= dx * LOOK_SENSITIVITY
    pitch -= dy * LOOK_SENSITIVITY
    pitch = Math.max(-Math.PI / 2 + 0.06, Math.min(Math.PI / 2 - 0.06, pitch))
  }

  /** 指针锁定时用 movementX/Y 环顾 */
  const onMouseMoveLook = (event: MouseEvent) => {
    if (!locked) return
    applyLook(event.movementX, event.movementY)
  }

  /** 浏览器不允许指针锁定时（或在触屏上）按住拖动也能环顾 */
  const startDragLook = (event: PointerEvent) => {
    lookDragging = true
    lastLook = { x: event.clientX, y: event.clientY }
  }

  const moveDragLook = (event: PointerEvent) => {
    if (!lookDragging || locked) return
    applyLook(event.clientX - lastLook.x, event.clientY - lastLook.y)
    lastLook = { x: event.clientX, y: event.clientY }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!spectator) return
    const target = event.target as HTMLElement | null
    const typing =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
    if (typing) return
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      keys.add(event.code)
      event.preventDefault()
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.code)
  }

  const onPointerLockChange = () => {
    const nowLocked = document.pointerLockElement === canvas
    if (nowLocked === locked) return
    locked = nowLocked
    if (locked) {
      lookDragging = false
      return
    }
    // 指针锁定被解除（例如 Esc）：交回页面退出旁观者模式
    if (spectator) callbacks.onExitSpectator()
  }

  /** 滚轮换挡的节流：一次「滚一下」只换一挡，触控板的连续事件不会一口气跳好几挡 */
  let lastShiftWheelAt = 0
  const onWheel = (event: WheelEvent) => {
    if (!spectator) return
    // 旁观者模式下滚轮不平移也不缩放，直接吃掉，避免滚动整页
    event.preventDefault()
    const now = performance.now()
    if (now - lastShiftWheelAt < 180) return
    if (Math.abs(event.deltaY) < 1) return
    lastShiftWheelAt = now
    callbacks.onShiftStep(event.deltaY < 0 ? 1 : -1)
  }

  const requestLock = () => {
    try {
      const result = canvas.requestPointerLock?.()
      if (result && typeof (result as Promise<void>).catch === 'function') {
        ;(result as Promise<void>).catch(() => {
          /* 浏览器拒绝（例如刚退出锁定的冷却期、或页面在受限容器里）：保留拖动环顾 */
        })
      }
    } catch {
      /* 同上，回退到拖动环顾 */
    }
  }

  /* ---------------- 点选零件 ---------------- */

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let downAt = 0
  let moved = 0
  let down = false
  let lastPointer = { x: 0, y: 0 }

  const setPointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, stage.camera)
  }

  /* ---------------- 彩蛋：用鼠标拨前轮 ----------------
   * 不给任何文字提示，也不改变光标；只有按在轮子上拖才会转。
   * 它不影响传动、读数与任何模型状态，纯视觉。
   */

  let frontAngle = 0
  let frontVelocity = 0
  let spinning = false
  let spinSign = 1
  let spinCenter = { x: 0, y: 0 }
  let spinPrevAngle = 0
  let spinPrevTime = 0
  let spinLastMove = 0

  /** 前轮中心在视口里的像素坐标与「屏幕上顺时针 = 轮子顺时针」的符号 */
  const frontWheelScreen = () => {
    const projected = bike.frontWheelCenter.clone().project(stage.camera)
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
      // 相机在 +Z 一侧看着轮子时，屏幕顺时针就是轮子顺时针（rotation.z 取负）
      sign: stage.camera.position.z >= bike.frontWheelCenter.z ? 1 : -1,
      visible: projected.z < 1,
    }
  }

  const beginSpin = (event: PointerEvent) => {
    const screen = frontWheelScreen()
    spinning = true
    spinCenter = { x: screen.x, y: screen.y }
    spinSign = screen.sign
    spinPrevAngle = Math.atan2(event.clientY - screen.y, event.clientX - screen.x)
    spinPrevTime = performance.now()
    spinLastMove = 0
    stage.controls.enabled = false
    canvas.setPointerCapture(event.pointerId)
  }

  const moveSpin = (event: PointerEvent) => {
    const angle = Math.atan2(event.clientY - spinCenter.y, event.clientX - spinCenter.x)
    let delta = angle - spinPrevAngle
    if (delta > Math.PI) delta -= Math.PI * 2
    if (delta < -Math.PI) delta += Math.PI * 2
    spinPrevAngle = angle

    const now = performance.now()
    const dt = Math.max(0.004, (now - spinPrevTime) / 1000)
    spinPrevTime = now

    frontAngle += delta * spinSign
    // 角速度用一阶低通，松手后带一点惯性
    frontVelocity = frontVelocity * 0.6 + (delta * spinSign / dt) * 0.4
    spinLastMove = now
  }

  const endSpin = (event: PointerEvent) => {
    if (!spinning) return
    spinning = false
    stage.controls.enabled = true
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    // 松手前已经停住就不给惯性，避免「放一下继续转」
    if (performance.now() - spinLastMove > 90) frontVelocity = 0
    frontVelocity = Math.max(-14, Math.min(14, frontVelocity))
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return

    // 旁观者模式：点画面先尝试锁定鼠标；不管锁定成不成，按住拖动都能环顾
    if (spectator) {
      if (!locked) {
        requestLock()
        startDragLook(event)
        canvas.setPointerCapture(event.pointerId)
      }
      return
    }

    down = true
    moved = 0
    downAt = performance.now()
    lastPointer = { x: event.clientX, y: event.clientY }

    // 先看是不是按在前轮上：是的话进入拨轮，不转镜头
    setPointer(event)
    if (bike.hitsFrontWheel(raycaster)) {
      down = false
      beginSpin(event)
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (spectator) {
      moveDragLook(event)
      return
    }
    if (spinning) {
      moveSpin(event)
      return
    }
    if (!down) return
    moved += Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y)
    lastPointer = { x: event.clientX, y: event.clientY }
  }

  const onPointerUp = (event: PointerEvent) => {
    if (spectator) {
      lookDragging = false
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      return
    }
    if (spinning) {
      endSpin(event)
      return
    }
    if (!down) return
    down = false
    const isClick = moved < CLICK_MOVE_THRESHOLD && performance.now() - downAt < CLICK_TIME_LIMIT
    if (!isClick) return
    setPointer(event)
    callbacks.onPick(bike.pick(raycaster))
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (spinning) endSpin(event)
    lookDragging = false
    down = false
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('mousemove', onMouseMoveLook)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('pointerlockchange', onPointerLockChange)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  /* ---------------- 状态 ---------------- */

  let lastCameraView: CameraViewId | null = null
  let lastFrameTime = performance.now()

  const walk = (dt: number) => {
    if (!spectator) return
    lookEuler.set(pitch, yaw, 0, 'YXZ')
    forwardVector.set(0, 0, -1).applyEuler(lookEuler)
    rightVector.set(1, 0, 0).applyEuler(lookEuler)
    moveVector.set(0, 0, 0)
    if (keys.has('KeyW')) moveVector.add(forwardVector)
    if (keys.has('KeyS')) moveVector.sub(forwardVector)
    if (keys.has('KeyD')) moveVector.add(rightVector)
    if (keys.has('KeyA')) moveVector.sub(rightVector)
    if (keys.has('KeyE') || keys.has('Space')) moveVector.y += 1
    if (keys.has('KeyQ')) moveVector.y -= 1

    if (moveVector.lengthSq() > 0) {
      const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight')
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED
      stage.camera.position.addScaledVector(moveVector.normalize(), speed * dt)
    }
    stage.camera.rotation.order = 'YXZ'
    stage.camera.rotation.set(pitch, yaw, 0)
  }

  const runtime: StageRuntime<DerailleurSceneState> = {
    update(state) {
      // 拨轮惯性用真实时间推进：它不属于模型时间，暂停时也照转不误
      const now = performance.now()
      const dt = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000))
      lastFrameTime = now
      if (!spinning && frontVelocity !== 0) {
        frontAngle += frontVelocity * dt
        frontVelocity *= Math.exp(-2.2 * dt)
        if (Math.abs(frontVelocity) < 0.02) frontVelocity = 0
      }

      applySpectator(state.spectator)
      if (spectator) {
        walk(dt)
      } else if (state.cameraView !== lastCameraView) {
        lastCameraView = state.cameraView
        stage.setView(CAMERA_VIEWS[state.cameraView].pose, 0.7)
      }

      bike.update({ ...state, frontWheelAngle: frontAngle })
    },
    render() {
      stage.render()
    },
    resize(width, height, dpr) {
      // 窄屏保持水平视野，整车不会被正方形展台裁掉两端
      const aspect = width / Math.max(1, height)
      stage.camera.fov = THREE.MathUtils.radToDeg(
        2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(17)) * Math.max(1, 1.5 / aspect)),
      )
      stage.resize(width, height, dpr)
    },
    resetCamera() {
      applySpectator(false)
      stage.resetView()
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('mousemove', onMouseMoveLook)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      canvas.removeEventListener('wheel', onWheel)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      bike.dispose()
      stage.dispose()
    },
  }

  return runtime
}
