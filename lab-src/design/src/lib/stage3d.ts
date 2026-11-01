/**
 * 统一的 three.js 舞台（所有 3D 展品共用）。
 *
 * 这里只做「光源 + 相机 + 渲染器 + 轨道控制 + 释放」，
 * 不摆放任何展品零件——零件由各展品的 geometry.ts 负责。
 *
 * 两条硬规则写在这里，而不是靠各展品自觉：
 *  1. 相机只有两种移动来源：用户自己拖，或用户点了「回到默认视角」。
 *     没有任何自动回正、自动环绕。用户动过镜头后 getUserMovedCamera() 永久为 true。
 *  2. dispose() 会把场景里的几何体、材质、贴图、环境贴图、渲染器全部释放；
 *     离开展品页后动画循环停、GPU 资源还回去。
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export type Vec3Tuple = [number, number, number]

export interface ViewPose {
  position: Vec3Tuple
  target: Vec3Tuple
}

export interface Stage3DOptions {
  /** 背景色。浅色展馆默认比纸面略深一档，模型与地面才立得起来 */
  background?: number
  fov?: number
  near?: number
  far?: number
  /** 初始相机位置与注视点，同时作为「默认视角」 */
  pose: ViewPose
  minDistance?: number
  maxDistance?: number
  /** 限制镜头别钻到地面以下，默认略低于地平线 */
  maxPolarAngle?: number
  shadows?: boolean
  /** 用 RoomEnvironment 提供柔和环境光，PBR 材质在浅色场景里不会发死 */
  environment?: boolean
  /** 用户第一次自己动镜头时回调一次 */
  onUserOrbit?: () => void
}

export interface Stage3D {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  /** 主光源，展品需要自己调阴影范围时用 */
  keyLight: THREE.DirectionalLight
  setView(pose: ViewPose, durationSeconds?: number): void
  resetView(durationSeconds?: number): void
  getUserMovedCamera(): boolean
  render(): void
  resize(width: number, height: number, dpr: number): void
  dispose(): void
}

export function createStage3D(canvas: HTMLCanvasElement, options: Stage3DOptions): Stage3D {
  const {
    background = 0x0f1b16,
    fov = 36,
    near = 0.02,
    far = 400,
    pose,
    minDistance = 0.05,
    maxDistance = 60,
    maxPolarAngle = Math.PI * 0.52,
    shadows = true,
    environment = true,
    onUserOrbit,
  } = options

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setClearColor(background, 1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  // 剖切观察需要
  renderer.localClippingEnabled = true
  if (shadows) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(background)

  const camera = new THREE.PerspectiveCamera(fov, 1, near, far)
  camera.position.set(...pose.position)

  const controls = new OrbitControls(camera, canvas)
  controls.target.set(...pose.target)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.minDistance = minDistance
  controls.maxDistance = maxDistance
  controls.maxPolarAngle = maxPolarAngle
  controls.zoomSpeed = 0.8
  controls.rotateSpeed = 0.75
  controls.update()

  // 环境光：半球光打底，主光塑形，补光压住暗部
  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfc7b4, 1.15)
  scene.add(hemi)

  const keyLight = new THREE.DirectionalLight(0xfff6e8, 2.1)
  keyLight.position.set(2.4, 4.2, 3.0)
  if (shadows) {
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    keyLight.shadow.bias = -0.0012
    keyLight.shadow.normalBias = 0.02
    const cam = keyLight.shadow.camera
    cam.near = 0.1
    cam.far = 30
    cam.left = -6
    cam.right = 6
    cam.top = 6
    cam.bottom = -6
    cam.updateProjectionMatrix()
  }
  scene.add(keyLight)

  const fill = new THREE.DirectionalLight(0xdce8f5, 0.55)
  fill.position.set(-3.4, 1.6, -2.2)
  scene.add(fill)

  let pmrem: THREE.PMREMGenerator | null = null
  let envTarget: THREE.WebGLRenderTarget | null = null
  if (environment) {
    pmrem = new THREE.PMREMGenerator(renderer)
    envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envTarget.texture
    scene.environmentIntensity = 0.55
  }

  // ---- 相机补间：只在 setView / resetView 时启动，绝不自动触发 ----------
  let tween: {
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    start: number
    duration: number
  } | null = null

  let userMoved = false

  const onControlStart = () => {
    tween = null
    if (!userMoved) {
      userMoved = true
      onUserOrbit?.()
    }
  }
  controls.addEventListener('start', onControlStart)

  const setView = (next: ViewPose, durationSeconds = 0.65) => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    if (durationSeconds <= 0 || reduced) {
      camera.position.set(...next.position)
      controls.target.set(...next.target)
      controls.update()
      tween = null
      return
    }
    tween = {
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(...next.position),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(...next.target),
      start: performance.now(),
      duration: durationSeconds * 1000,
    }
  }

  const smoothstep = (x: number) => x * x * (3 - 2 * x)

  const render = () => {
    if (tween) {
      const raw = Math.min(1, (performance.now() - tween.start) / tween.duration)
      const k = smoothstep(raw)
      camera.position.lerpVectors(tween.fromPos, tween.toPos, k)
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k)
      if (raw >= 1) tween = null
    }
    // 轨道控制被关掉时（例如展品切到自由飞行的旁观者模式），
    // 不能再让 update() 每帧把相机拉回 target，否则会覆盖展品自己的相机运动。
    if (controls.enabled) controls.update()
    renderer.render(scene, camera)
  }

  const resize = (width: number, height: number, dpr: number) => {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    renderer.setPixelRatio(Math.min(Math.max(dpr, 0.75), 2))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  const dispose = () => {
    controls.removeEventListener('start', onControlStart)
    controls.dispose()
    disposeObjectTree(scene)
    scene.environment = null
    envTarget?.dispose()
    pmrem?.dispose()
    scene.clear()
    renderer.dispose()
    // 主动交回 GPU 上下文，多开几次展品也不会耗尽上下文名额
    renderer.forceContextLoss()
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    keyLight,
    setView: (next, duration) => setView(next, duration),
    resetView: (duration) => setView(pose, duration),
    getUserMovedCamera: () => userMoved,
    render,
    resize,
    dispose,
  }
}

/** 释放整棵场景树：几何体、材质、材质里的贴图 */
export function disposeObjectTree(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>()

  root.traverse((object) => {
    const holder = object as THREE.Mesh & { material?: THREE.Material | THREE.Material[] }
    holder.geometry?.dispose()
    const material = holder.material
    if (Array.isArray(material)) {
      for (const item of material) materials.add(item)
    } else if (material) {
      materials.add(material)
    }
  })

  for (const material of materials) {
    for (const value of Object.values(material)) {
      const texture = value as THREE.Texture | null
      if (texture && (texture as THREE.Texture).isTexture) texture.dispose()
    }
    material.dispose()
  }
}
