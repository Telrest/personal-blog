import type { StageHooks, StageRuntime } from '../../lib/stageContract'
import { CAMERAS } from './content'
import type { EngineDisplay, EnginePart, EngineSnapshot } from './model'

export interface EngineSceneState { model: EngineSnapshot; display: EngineDisplay }

export async function createEngineScene(canvas: HTMLCanvasElement, hooks: StageHooks, onPick: (id: EnginePart | null) => void): Promise<StageRuntime<EngineSceneState>> {
  const [{ createStage3D }, { createEngineGeometry }, THREE] = await Promise.all([
    import('../../lib/stage3d'), import('./geometry'), import('three'),
  ])
  const stage = createStage3D(canvas, {
    pose: CAMERAS.overview.pose, fov: 32, background: 0x0f1b16,
    minDistance: 0.65, maxDistance: 15, near: 0.025, far: 50,
    maxPolarAngle: Math.PI * 0.59, onUserOrbit: hooks.onUserOrbit,
  })
  let engine: Awaited<ReturnType<typeof createEngineGeometry>>
  try { engine = await createEngineGeometry() } catch (error) { stage.dispose(); throw error }
  stage.scene.add(engine.root)
  stage.renderer.toneMappingExposure = 0.88
  stage.renderer.shadowMap.type = THREE.PCFShadowMap
  stage.scene.environmentIntensity = 0.85
  stage.keyLight.position.set(-2.4, 4.5, 3.3)
  stage.keyLight.shadow.camera.left = -4; stage.keyLight.shadow.camera.right = 4
  stage.keyLight.shadow.camera.top = 4; stage.keyLight.shadow.camera.bottom = -3
  stage.keyLight.shadow.normalBias = 0.006; stage.keyLight.shadow.camera.updateProjectionMatrix()
  const rim = new THREE.DirectionalLight(0xe1eeff, 1.2); rim.position.set(2.0, 2.0, -3.4); stage.scene.add(rim)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.12 }))
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.195; floor.receiveShadow = true; stage.scene.add(floor)
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2()
  let down: { x: number; y: number } | null = null
  function onDown(event: PointerEvent) { if (event.button === 0) down = { x: event.clientX, y: event.clientY } }
  function onUp(event: PointerEvent) {
    const initial = down; down = null
    if (!initial || Math.hypot(event.clientX - initial.x, event.clientY - initial.y) > 5) return
    const rect = canvas.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    ray.setFromCamera(pointer, stage.camera); onPick(engine.pick(ray))
  }
  const onCancel = () => { down = null }
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onCancel)
  let lastCamera = '', lastQuality = '', width = 1, height = 1, density = 1, frames = 0, sampleStart = performance.now()
  const resize = () => {
    stage.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(16)) * Math.max(1, 1.2 / (width / height))))
    stage.resize(width, height, Math.min(density, lastQuality === 'low' ? 1 : 1.5))
  }
  return {
    update({ model, display }) {
      engine.update(model, display)
      if (display.camera !== lastCamera) { lastCamera = display.camera; stage.setView(CAMERAS[display.camera].pose, 0.65) }
      if (lastQuality !== display.quality) { lastQuality = display.quality; stage.renderer.shadowMap.enabled = display.quality !== 'low'; resize() }
    },
    render() {
      stage.render(); frames += 1
      const now = performance.now()
      if (now - sampleStart >= 1200) {
        canvas.dataset.fps = (frames * 1000 / (now - sampleStart)).toFixed(1)
        canvas.dataset.drawCalls = String(stage.renderer.info.render.calls)
        canvas.dataset.triangles = String(stage.renderer.info.render.triangles)
        sampleStart = now; frames = 0
      }
    },
    resize(w, h, dpr) { width = Math.max(1, w); height = Math.max(1, h); density = dpr; resize() },
    resetCamera() { lastCamera = 'overview'; stage.resetView() },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel)
      stage.scene.remove(engine.root); engine.dispose(); stage.dispose()
    },
  }
}
