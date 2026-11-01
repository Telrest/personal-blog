/**
 * 魔丸模式的三维世界：舞台、追尾镜头、旁观者模式、摔车演出与 X 光片。
 *
 * 分工：
 *  - model.ts 决定「发生了什么」（距离、速度、碰撞、阶段）；
 *  - 本文件只负责「看起来怎么样」：镜头、尘土、摔车姿态、骨骼卡片；
 *  - ride.ts / track.ts 负责零件与跑道本身。
 *
 * 镜头规则与展馆一致：只有三种来源——追尾跟随、旁观者模式里用户自己飞、
 * 摔车演出的固定机位。没有任何自动环绕，用户也不能把镜头弄丢。
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import phalanxUrl from '../exhibits/bone/assets/right-fifth-proximal-phalanx.glb?url'
import { CONFIG, clamp, clamp01 } from './config'
import { createStartGate } from './gate'
import type { GameView } from './model'
import { createRide } from './ride'
import { createTrack, type Quality } from './track'
import { createStage3D } from '../lib/stage3d'
import type { StageHooks, StageRuntime } from '../lib/stageContract'

export interface WorldState {
  view: GameView
  quality: Quality
}

export interface WorldCallbacks {
  /** 旁观者模式的指针锁定被系统解除（例如按 Esc） */
  onExitSpectator: () => void
}

const BASE_FOV = 58
/** 旁观者模式：鼠标灵敏度与移动速度（与馆内其它展品一致） */
const LOOK_SENSITIVITY = 0.0022
const WALK_SPEED = 1.3
const SPRINT_SPEED = 3.4

export async function createWorld(
  canvas: HTMLCanvasElement,
  hooks: StageHooks,
  callbacks: WorldCallbacks,
): Promise<StageRuntime<WorldState>> {
  const stage = createStage3D(canvas, {
    pose: { position: [0, 2.9, 6.6], target: [0, 1.0, -10] },
    background: 0xe8e4d6,
    fov: BASE_FOV,
    near: 0.12,
    far: 360,
    minDistance: 0.6,
    maxDistance: 60,
    maxPolarAngle: Math.PI * 0.5,
    shadows: true,
    environment: true,
    onUserOrbit: hooks.onUserOrbit,
  })
  // 这个场景不需要轨道控制：镜头只由追尾、旁观、摔车三种状态决定
  stage.controls.enabled = false
  stage.scene.add(stage.camera)

  // 天空：自上而下的浅色渐变，和雾色接上，远处自然消失
  const skyCanvas = document.createElement('canvas')
  skyCanvas.width = 4
  skyCanvas.height = 256
  const skyContext = skyCanvas.getContext('2d')
  if (skyContext) {
    const gradient = skyContext.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, '#c9dcec')
    gradient.addColorStop(0.55, '#e6e9e3')
    gradient.addColorStop(1, '#182a21')
    skyContext.fillStyle = gradient
    skyContext.fillRect(0, 0, 4, 256)
  }
  const skyTexture = new THREE.CanvasTexture(skyCanvas)
  skyTexture.colorSpace = THREE.SRGBColorSpace
  stage.scene.background = skyTexture
  const fog = new THREE.Fog(0xece8dc, 55, 190)
  stage.scene.fog = fog

  // 灯光按「室外跑道」调：主光压出影子，阴影相机只罩住车附近。
  // 室外场景很容易过曝，这里比展馆里的默认值压一档，红色路障才不会被晒成白色。
  stage.scene.traverse((child) => {
    if ((child as THREE.HemisphereLight).isHemisphereLight) {
      ;(child as THREE.HemisphereLight).intensity = 1
    }
    if ((child as THREE.DirectionalLight).isDirectionalLight) {
      const light = child as THREE.DirectionalLight
      if (light !== stage.keyLight) light.intensity = 0.4
    }
  })
  stage.scene.environmentIntensity = 0.45
  stage.keyLight.position.set(4.5, 9, 5)
  stage.keyLight.intensity = 2.05
  const shadow = stage.keyLight.shadow
  shadow.camera.left = -8
  shadow.camera.right = 8
  shadow.camera.top = 8
  shadow.camera.bottom = -8
  shadow.camera.near = 0.5
  shadow.camera.far = 34
  shadow.mapSize.set(1024, 1024)
  shadow.bias = -0.0009
  shadow.normalBias = 0.02
  shadow.camera.updateProjectionMatrix()
  stage.renderer.toneMappingExposure = 1.0

  const ride = createRide()
  stage.scene.add(ride.root)
  const track = createTrack()
  stage.scene.add(track.root)
  // 起点门楼：照「北航体能锻炼走廊」那张照片做的一版三维简化
  const startGate = createStartGate()
  stage.scene.add(startGate.group)

  /* ---------------------------------------------------------------------
     尘土：撞车那一下的卡通烟尘
     --------------------------------------------------------------------- */

  const dustCount = CONFIG.quality.dustHigh
  const dustGeometry = new THREE.IcosahedronGeometry(0.07, 0)
  const dustMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9d0bb,
    roughness: 1,
    transparent: true,
    opacity: 0.9,
    flatShading: true,
    depthWrite: false,
  })
  const dust = new THREE.InstancedMesh(dustGeometry, dustMaterial, dustCount)
  dust.frustumCulled = false
  dust.visible = false
  stage.scene.add(dust)
  const dustParticles = Array.from({ length: dustCount }, (_, index) => {
    const angle = (index / dustCount) * Math.PI * 2 + (index % 3) * 0.21
    return {
      angle,
      speed: 1.2 + ((index * 37) % 11) / 10,
      lift: 0.7 + ((index * 53) % 13) / 12,
      size: 0.5 + ((index * 29) % 9) / 10,
    }
  })

  /* ---------------------------------------------------------------------
     X 光片：复用骨折展品的第 5 趾近节趾骨（22 mm，CC BY 4.0）
     --------------------------------------------------------------------- */

  const card = new THREE.Group()
  card.visible = false
  stage.camera.add(card)

  const cardCanvas = document.createElement('canvas')
  cardCanvas.width = 512
  cardCanvas.height = 320
  const cardTexture = new THREE.CanvasTexture(cardCanvas)
  cardTexture.colorSpace = THREE.SRGBColorSpace
  cardTexture.anisotropy = 4
  drawCardFace(cardCanvas)

  const cardGeometry = new THREE.PlaneGeometry(0.27, 0.169)
  const cardMaterial = new THREE.MeshBasicMaterial({
    map: cardTexture,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const cardMesh = new THREE.Mesh(cardGeometry, cardMaterial)
  cardMesh.renderOrder = 20
  card.add(cardMesh)

  const boneGroup = new THREE.Group()
  boneGroup.position.set(0.012, 0.008, 0.02)
  card.add(boneGroup)

  // 卡片本身 depthTest:false 且 renderOrder 更大，骨头必须排在它后面画，
  // 否则会被半透明的卡面盖成一块黑影
  const setCardOrder = (root: THREE.Object3D, order: number) => {
    root.traverse((child) => {
      child.renderOrder = order
    })
  }

  // 兜底骨头：GLB 还没加载完或加载失败时先摆一根简化骨
  const fallbackBone = new THREE.Group()
  const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.55, metalness: 0.05 })
  const fallbackShaft = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.05, 4, 10), fallbackMaterial)
  fallbackShaft.rotation.z = Math.PI / 2.6
  fallbackBone.add(fallbackShaft)
  for (const side of [1, -1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), fallbackMaterial)
    knob.position.set(side * 0.032, side * 0.014, 0)
    fallbackBone.add(knob)
  }
  fallbackBone.scale.setScalar(0.9)
  boneGroup.add(fallbackBone)

  const crackGroup = new THREE.Group()
  const crackMaterial = new THREE.MeshBasicMaterial({ color: 0xff6a34, toneMapped: false })
  for (let i = 0; i < 5; i += 1) {
    const segment = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.0022, 0.0008), crackMaterial)
    segment.position.set(-0.026 + i * 0.013, Math.sin(i * 1.7) * 0.007, 0.03)
    segment.rotation.z = Math.sin(i * 2.1) * 0.9
    crackGroup.add(segment)
  }
  boneGroup.add(crackGroup)
  setCardOrder(boneGroup, 21)

  let disposed = false
  void (async () => {
    try {
      const gltf = await new GLTFLoader().loadAsync(phalanxUrl)
      if (disposed) return
      const source = gltf.scene
      const bounds = new THREE.Box3().setFromObject(source)
      const size = new THREE.Vector3()
      bounds.getSize(size)
      const longest = Math.max(size.x, size.y, size.z) || 1
      const targetScale = 0.072 / longest
      const center = new THREE.Vector3()
      bounds.getCenter(center)
      const wrapper = new THREE.Group()
      source.scale.setScalar(targetScale)
      source.position.set(-center.x * targetScale, -center.y * targetScale, -center.z * targetScale)
      wrapper.add(source)
      wrapper.rotation.set(0.25, -0.5, 0.18)
      boneGroup.add(wrapper)
      setCardOrder(wrapper, 21)
      fallbackBone.visible = false
    } catch {
      // 加载失败就用简化骨：演出照常，不把整局游戏带崩
    }
  })()

  /* ---------------------------------------------------------------------
     旁观者模式：指针锁定 + WASD 自由飞行（与变速器展品里的那一套一致）
     --------------------------------------------------------------------- */

  let spectator = false
  let locked = false
  let lookDragging = false
  let lastLook = { x: 0, y: 0 }
  let yaw = 0
  let pitch = 0
  const keys = new Set<string>()
  const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ')
  const forwardVector = new THREE.Vector3()
  const rightVector = new THREE.Vector3()
  const moveVector = new THREE.Vector3()

  const applySpectator = (enabled: boolean) => {
    if (enabled === spectator) return
    spectator = enabled
    if (enabled) {
      lookEuler.setFromQuaternion(stage.camera.quaternion, 'YXZ')
      yaw = lookEuler.y
      pitch = lookEuler.x
      keys.clear()
      lookDragging = false
      return
    }
    keys.clear()
    lookDragging = false
    if (document.pointerLockElement === canvas) document.exitPointerLock()
  }

  const applyLook = (dx: number, dy: number) => {
    yaw -= dx * LOOK_SENSITIVITY
    pitch -= dy * LOOK_SENSITIVITY
    pitch = clamp(pitch, -Math.PI / 2 + 0.06, Math.PI / 2 - 0.06)
  }

  const onMouseMoveLook = (event: MouseEvent) => {
    if (!locked) return
    applyLook(event.movementX, event.movementY)
  }

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
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
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
    // 锁定被系统解除（Esc）：交回页面退出旁观者模式
    if (spectator) callbacks.onExitSpectator()
  }

  const requestLock = () => {
    try {
      const result = canvas.requestPointerLock?.()
      if (result && typeof (result as Promise<void>).catch === 'function') {
        ;(result as Promise<void>).catch(() => {
          /* 浏览器拒绝时保留「按住拖动环顾」 */
        })
      }
    } catch {
      /* 同上 */
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!spectator) return
    if (!locked) {
      requestLock()
      startDragLook(event)
      canvas.setPointerCapture(event.pointerId)
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (spectator) moveDragLook(event)
  }

  const onPointerUp = (event: PointerEvent) => {
    lookDragging = false
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('mousemove', onMouseMoveLook)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('pointerlockchange', onPointerLockChange)

  /* ---------------------------------------------------------------------
     镜头
     --------------------------------------------------------------------- */

  const cameraPosition = new THREE.Vector3(0, 2.9, 6.6)
  const lookTarget = new THREE.Vector3(0, 1.05, -10)
  const desiredPosition = new THREE.Vector3()
  const desiredTarget = new THREE.Vector3()
  const shakeOffset = new THREE.Vector3()
  let aspect = 1.6
  let lastFrame = performance.now()
  let shake = 0

  const updateChaseTarget = (view: GameView) => {
    const speedRange = Math.max(1, CONFIG.speed.max - 12)
    const speedK = clamp01((view.speed - 12) / speedRange)
    const portrait = clamp01((1.15 - aspect) / 0.7)
    const distance = CONFIG.camera.distance + CONFIG.camera.distanceExtraAtMax * speedK + portrait * 1.9
    const height = CONFIG.camera.height + CONFIG.camera.heightExtraAtMax * speedK + portrait * 0.6
    desiredPosition.set(view.lateral * 0.65, height, distance)
    desiredTarget.set(view.lateral * 0.9, CONFIG.camera.lookHeight, -CONFIG.camera.lookAhead)
    const speedFov = BASE_FOV + CONFIG.camera.fovSpeedGain * speedK + (view.boosting ? CONFIG.camera.fovBoostGain : 0)
    stage.camera.fov = speedFov + portrait * 6
    stage.camera.updateProjectionMatrix()
  }

  const updateCamera = (view: GameView, dt: number) => {
    if (view.cameraMode === 'spectator') {
      applySpectator(true)
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
        if (stage.camera.position.y < 0.2) stage.camera.position.y = 0.2
      }
      stage.camera.rotation.order = 'YXZ'
      stage.camera.rotation.set(pitch, yaw, 0)
      return
    }

    applySpectator(false)

    const crashing = view.phase === 'crash' || view.phase === 'result'
    if (crashing) {
      // 摔车机位：绕到车的侧后方，能同时看见车、骑手和 X 光片
      const blend = clamp01(view.crashElapsed / 0.45)
      const eased = blend * blend * (3 - 2 * blend)
      desiredPosition.set(
        view.lateral + 2.7 * eased + 0.4,
        2.0 + 0.35 * eased,
        5.6 - 2.4 * eased,
      )
      desiredTarget.set(view.lateral + 0.35 * eased, 0.95, -0.9)
      cameraPosition.lerp(desiredPosition, 1 - Math.exp(-6 * dt))
      lookTarget.lerp(desiredTarget, 1 - Math.exp(-6 * dt))
      if (view.crashElapsed < 0.5) {
        shake = 0.09 * (1 - view.crashElapsed / 0.5)
      }
    } else {
      updateChaseTarget(view)
      cameraPosition.lerp(desiredPosition, 1 - Math.exp(-CONFIG.camera.follow * dt))
      lookTarget.lerp(desiredTarget, 1 - Math.exp(-CONFIG.camera.follow * dt))
      shake = 0
    }

    shakeOffset.set(0, 0, 0)
    if (shake > 0) {
      shakeOffset.set(
        (Math.random() * 2 - 1) * shake,
        (Math.random() * 2 - 1) * shake,
        (Math.random() * 2 - 1) * shake * 0.5,
      )
    }
    stage.camera.position.copy(cameraPosition).add(shakeOffset)
    stage.camera.up.set(0, 1, 0)
    stage.camera.lookAt(lookTarget)
    // 车身倾斜时镜头跟着侧一点，离心力看得出来
    stage.camera.rotateZ(-view.lean * 0.12)
  }

  /* ---------------------------------------------------------------------
     摔车演出：尘土 + X 光片
     --------------------------------------------------------------------- */

  const dustMatrix = new THREE.Matrix4()
  const dustQuaternion = new THREE.Quaternion()
  const dustPosition = new THREE.Vector3()
  const dustScale = new THREE.Vector3()

  const updateCrashEffects = (view: GameView) => {
    const crashing = view.phase === 'crash' || view.phase === 'result'
    if (!crashing) {
      dust.visible = false
      dust.count = 0
      card.visible = false
      cardMaterial.opacity = 0
      return
    }

    const elapsed = view.crashElapsed
    const progress = clamp01(elapsed / 1.35)
    dust.visible = true
    dust.count = quality === 'low' ? Math.min(dustCount, CONFIG.quality.dustLow) : dustCount
    dustMaterial.opacity = 0.9 * (1 - progress)
    for (let i = 0; i < dust.count; i += 1) {
      const particle = dustParticles[i]
      const travel = particle.speed * progress * 1.9
      dustPosition.set(
        (view.lateral + 0.2) + Math.cos(particle.angle) * travel * 0.75,
        0.14 + particle.lift * progress * 0.75 - progress * progress * 0.5,
        0.3 + Math.sin(particle.angle) * travel * 0.5,
      )
      dustScale.setScalar(particle.size * (0.5 + progress * 0.9))
      dustQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), particle.angle + progress * 2)
      dustMatrix.compose(dustPosition, dustQuaternion, dustScale)
      dust.setMatrixAt(i, dustMatrix)
    }
    dust.instanceMatrix.needsUpdate = true

    // X 光片：碰撞 0.45 s 后弹出，出现在画面左下角
    const appear = clamp01((elapsed - 0.45) / 0.35)
    card.visible = appear > 0
    if (!card.visible) return
    const overshoot = 1 + Math.sin(appear * Math.PI) * 0.12
    card.scale.setScalar(0.6 + 0.4 * appear * overshoot)
    cardMaterial.opacity = appear
    // 画面左下角：按当前视野换算卡片位置，窄屏也不会飞出屏幕
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)) * 0.62
    const halfWidth = halfHeight * aspect
    card.position.set(-halfWidth + 0.19, -halfHeight + 0.13, -0.62)
    boneGroup.rotation.y = Math.sin(elapsed * 0.9) * 0.25
    crackGroup.visible = elapsed > 0.9
  }

  /* ---------------------------------------------------------------------
     帧循环
     --------------------------------------------------------------------- */

  let quality: Quality = 'high'
  let lastPixelRatio = 0
  let lastWidth = 1
  let lastHeight = 1
  let lastDpr = 1

  const applyQuality = () => {
    const cap = quality === 'high' ? CONFIG.quality.highPixelRatio : CONFIG.quality.lowPixelRatio
    const ratio = Math.min(lastDpr, cap)
    if (ratio !== lastPixelRatio) {
      lastPixelRatio = ratio
      stage.renderer.setPixelRatio(ratio)
    }
    stage.keyLight.castShadow = quality === 'high'
    track.setQuality(quality)
  }

  const runtime: StageRuntime<WorldState> = {
    update(state) {
      const now = performance.now()
      const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000))
      lastFrame = now

      if (state.quality !== quality) {
        quality = state.quality
        applyQuality()
      }

      ride.update(state.view)
      track.update(state.view)
      startGate.update(state.view.distance, quality)
      updateCamera(state.view, dt)
      updateCrashEffects(state.view)

      // 撞击点附近的灯稍微跟着车走，影子不会因为车靠边而丢
      stage.keyLight.position.set(4.5 + state.view.lateral * 0.6, 9, 5)
      stage.keyLight.target.position.set(state.view.lateral, 0, 0)
      stage.keyLight.target.updateMatrixWorld()
    },

    render() {
      stage.render()
    },

    resize(width, height, dpr) {
      lastWidth = width
      lastHeight = height
      lastDpr = dpr
      aspect = width / Math.max(1, height)
      stage.resize(width, height, dpr)
      applyQuality()
      const portrait = clamp01((1.15 - aspect) / 0.7)
      stage.camera.fov = BASE_FOV + portrait * 8
      stage.camera.updateProjectionMatrix()
    },

    resetCamera() {
      applySpectator(false)
      cameraPosition.set(0, CONFIG.camera.height, CONFIG.camera.distance)
      lookTarget.set(0, CONFIG.camera.lookHeight, -CONFIG.camera.lookAhead)
      stage.camera.position.copy(cameraPosition)
      stage.camera.lookAt(lookTarget)
    },

    dispose() {
      disposed = true
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('mousemove', onMouseMoveLook)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      dust.dispose()
      dustGeometry.dispose()
      dustMaterial.dispose()
      cardGeometry.dispose()
      cardMaterial.dispose()
      cardTexture.dispose()
      fallbackMaterial.dispose()
      crackMaterial.dispose()
      crackGroup.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh) mesh.geometry.dispose()
      })
      fallbackBone.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh) mesh.geometry.dispose()
      })
      boneGroup.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh) mesh.geometry.dispose()
      })
      ride.dispose()
      track.dispose()
      startGate.dispose()
      stage.scene.background = null
      skyTexture.dispose()
      stage.dispose()
      void lastWidth
      void lastHeight
    },
  }

  return runtime
}

/* =========================================================================
   X 光片的画面：画在 canvas 上，贴到相机前的平面上
   ========================================================================= */

function drawCardFace(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const width = canvas.width
  const height = canvas.height
  context.clearRect(0, 0, width, height)

  const radius = 20
  const inset = 8
  context.beginPath()
  context.moveTo(inset + radius, inset)
  context.arcTo(width - inset, inset, width - inset, height - inset, radius)
  context.arcTo(width - inset, height - inset, inset, height - inset, radius)
  context.arcTo(inset, height - inset, inset, inset, radius)
  context.arcTo(inset, inset, width - inset, inset, radius)
  context.closePath()
  context.fillStyle = 'rgba(17, 23, 30, 0.9)'
  context.fill()
  context.lineWidth = 3
  context.strokeStyle = 'rgba(244, 241, 233, 0.4)'
  context.stroke()

  context.fillStyle = '#e9c46a'
  context.font = '700 26px "Segoe UI", system-ui, sans-serif'
  context.textBaseline = 'alphabetic'
  context.fillText('X 光片 · 教学示意', 34, 52)

  context.strokeStyle = 'rgba(244, 241, 233, 0.22)'
  context.lineWidth = 1.5
  context.beginPath()
  context.moveTo(34, 66)
  context.lineTo(width - 34, 66)
  context.stroke()

  context.fillStyle = '#12211b'
  context.font = '600 34px "Segoe UI", system-ui, sans-serif'
  context.fillText('右第 5 趾近节趾骨', 34, 272)

  context.fillStyle = '#9fb0bd'
  context.font = '400 21px "Segoe UI", system-ui, sans-serif'
  context.fillText('卡通演出，不代表真实伤情', 34, 300)

  // 四角刻度：一点工程图纸的味道
  context.strokeStyle = 'rgba(244, 241, 233, 0.35)'
  context.lineWidth = 2
  for (const [x, y, dx, dy] of [
    [26, 26, 16, 0],
    [26, 26, 0, 16],
    [width - 26, 26, -16, 0],
    [width - 26, 26, 0, 16],
    [26, height - 26, 16, 0],
    [width - 26, height - 26, -16, 0],
  ] as const) {
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + dx, y + dy)
    context.stroke()
  }
}
