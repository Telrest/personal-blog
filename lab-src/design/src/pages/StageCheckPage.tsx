import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import type * as ThreeNS from 'three'
import { ModelStage } from '../components/ModelStage'
import { CameraBar } from '../components/controls/CameraBar'
import { ControlPanel, ControlSection } from '../components/controls/ControlPanel'
import { Readout } from '../components/controls/Readout'
import { TransportBar } from '../components/controls/TransportBar'
import { createSimClock } from '../lib/clock'
import { fmt } from '../lib/format'
import type { StageFactory, StageRuntime } from '../lib/stageContract'

interface CheckState {
  spin: number
}

/**
 * 三维舞台自检页（不在导航里，开发与验收用）。
 *
 * 它渲染的是占位几何，不是任何展品。用途只有三个：
 *  1. 确认 three.js 能在这个设备上正常出画；
 *  2. 确认暂停 / 重置 / 观察速度 / 镜头锁定 / 回到默认视角这一套控制真的有效；
 *  3. 确认离开页面后动画停止、GPU 资源释放。
 */
const checkFactory: StageFactory<CheckState> = async (canvas, hooks) => {
  const [{ createStage3D }, THREE] = await Promise.all([import('../lib/stage3d'), import('three')])

  const stage = createStage3D(canvas, {
    pose: { position: [1.45, 1.1, 2.0], target: [0, 0.3, 0] },
    background: 0xece8dc,
    onUserOrbit: hooks.onUserOrbit,
    minDistance: 0.6,
    maxDistance: 6,
  })

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 64),
    new THREE.MeshStandardMaterial({ color: 0xf7f4ec, roughness: 0.95, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  stage.scene.add(ground)

  const grid = new THREE.GridHelper(5, 20, 0xc6bfab, 0xded8c9)
  grid.position.y = 0.001
  const gridMaterial = grid.material as ThreeNS.Material
  gridMaterial.transparent = true
  gridMaterial.opacity = 0.55
  stage.scene.add(grid)

  const group = new THREE.Group()
  group.position.y = 0.32
  stage.scene.add(group)

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.42, 0.42),
    new THREE.MeshStandardMaterial({ color: 0xb8432d, roughness: 0.55, metalness: 0.05 }),
  )
  box.position.set(-0.36, 0, 0)
  box.castShadow = true
  box.receiveShadow = true
  group.add(box)

  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.065, 24, 64),
    new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.45, metalness: 0.25 }),
  )
  torus.position.set(0.36, 0, 0)
  torus.rotation.x = Math.PI / 2
  torus.castShadow = true
  group.add(torus)

  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.6, 32),
    new THREE.MeshStandardMaterial({ color: 0x2c5c8c, roughness: 0.5, metalness: 0.1 }),
  )
  cylinder.position.set(0, 0.02, 0.42)
  cylinder.castShadow = true
  group.add(cylinder)

  const runtime: StageRuntime<CheckState> = {
    update(state) {
      group.rotation.y = state.spin
    },
    render() {
      stage.render()
    },
    resize(width, height, dpr) {
      stage.resize(width, height, dpr)
    },
    resetCamera() {
      stage.resetView()
    },
    dispose() {
      stage.dispose()
    },
  }

  return runtime
}

export default function StageCheckPage() {
  const [clock] = useState(() => createSimClock({ playing: true, speed: 1, notifyHz: 12 }))
  const clockState = useSyncExternalStore(clock.subscribe, clock.get, clock.get)
  const [cameraMoved, setCameraMoved] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)

  return (
    <main id="main" className="page-exhibit">
      <div className="shell">
        <nav className="breadcrumb" aria-label="面包屑">
          <Link to="/" className="breadcrumb__link">
            ← 全部展品
          </Link>
        </nav>

        <header className="exhibit-head">
          <p className="eyebrow">
            <span className="eyebrow__index">自检</span>
            <span className="eyebrow__text">三维舞台可用性检查</span>
          </p>
          <h1 className="exhibit-head__title">舞台自检</h1>
          <p className="exhibit-head__question">
            这一页出现的几何体是占位物，不代表任何展品。它只用来确认三维舞台、控制条与镜头锁定是否正常。
          </p>
        </header>

        <div className="workspace">
          <div className="workspace__main">
            <div className="workspace__stage">
              <ModelStage<CheckState>
                factory={checkFactory}
                ariaLabel="三维舞台自检：三个占位几何体在缓慢旋转"
                onUserOrbit={() => setCameraMoved(true)}
                resetCameraNonce={resetNonce}
                onFrame={(dt, runtime) => {
                  clock.tick(dt)
                  runtime.update({ spin: clock.get().time * 0.9 })
                }}
                fallback={
                  <p>
                    三维视图暂时不可用。展品页在同等情况下会改为显示同一套原理的图文替代内容，
                    不会出现空白画面。
                  </p>
                }
              />
            </div>
          </div>

          <aside className="workspace__side" aria-label="自检控制">
            <ControlPanel title="自检控制" subtitle="与展品页共用同一批组件">
              <ControlSection title="观察">
                <TransportBar
                  playing={clockState.playing}
                  speed={clockState.speed}
                  onToggle={() => clock.toggle()}
                  onReset={() => clock.reset()}
                  onSpeedChange={(speed) => clock.setSpeed(speed)}
                  timeLabel={`${fmt(clockState.time, 2)} s`}
                />
                <CameraBar
                  cameraMoved={cameraMoved}
                  onResetCamera={() => {
                    setCameraMoved(false)
                    setResetNonce((value) => value + 1)
                  }}
                />
              </ControlSection>

              <ControlSection title="状态">
                <Readout
                  items={[
                    { label: '时钟', value: clockState.playing ? '运行中' : '已暂停' },
                    { label: '模型时间', value: fmt(clockState.time, 2), unit: 's' },
                    { label: '观察速度', value: `${clockState.speed}×` },
                    { label: '镜头', value: cameraMoved ? '自由视角' : '展馆视角' },
                  ]}
                />
              </ControlSection>
            </ControlPanel>
          </aside>
        </div>

        <p className="check-note">
          离开本页时，帧循环会停止，几何体、材质、贴图与 GPU 上下文会被释放。
          若设备没有 WebGL，这一页会显示上面的图文替代说明，而不是黑屏。
        </p>
      </div>
    </main>
  )
}
