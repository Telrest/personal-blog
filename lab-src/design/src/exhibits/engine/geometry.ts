import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ENGINE, PART_SPOOL, flowPoint, radiusAt, type EngineDisplay, type EnginePart, type EngineSnapshot } from './model'

export interface EngineGeometry {
  root: THREE.Group
  update(state: EngineSnapshot, display: EngineDisplay): void
  pick(ray: THREE.Raycaster): EnginePart | null
  dispose(): void
}

/** Profile is the outer radius along X; closing the profile gives both walls and end rings. */
export function shellGeometry(profile: readonly (readonly [number, number])[], wall: number, cut = false): THREE.BufferGeometry {
  const section = [...profile.map(([x, r]) => [x, r]), ...[...profile].reverse().map(([x, r]) => [x, r - wall])]
  section.push(section[0])
  const segments = cut ? 84 : 112, start = cut ? Math.PI / 2 : 0, arc = cut ? Math.PI * 1.5 : Math.PI * 2
  const vertices: number[] = [], indices: number[] = []
  for (let i = 0; i < section.length; i += 1) {
    for (let j = 0; j <= segments; j += 1) {
      const a = start + (j / segments) * arc, [x, r] = section[i]
      vertices.push(x, r * Math.cos(a), r * Math.sin(a))
      if (i + 1 < section.length && j < segments) {
        const k = i * (segments + 1) + j
        indices.push(k, k + 1, k + segments + 1, k + 1, k + segments + 2, k + segments + 1)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals()
  return g
}

/** Closed swept airfoil for fixed vanes. Camber, stagger and radial twist are teaching geometry. */
export function vaneGeometry(hub: number, tip: number, chord: number, stagger = 0.4): THREE.BufferGeometry {
  const span = 5, around = 24, vertices: number[] = [], indices: number[] = []
  for (let j = 0; j <= span; j += 1) {
    const s = j / span, angle = stagger - s * 0.24, r = hub + (tip - hub) * s
    for (let i = 0; i <= around; i += 1) {
      const phase = (i / around) * Math.PI * 2
      const u = (1 - Math.cos(phase)) / 2
      const thickness = 5 * 0.1 * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1036 * u ** 4)
      const a = (u - 0.45) * chord * (1 - 0.18 * s)
      const b = chord * (0.07 * Math.sin(Math.PI * u) + Math.sign(Math.sin(phase)) * thickness)
      vertices.push(a * Math.cos(angle) - b * Math.sin(angle), r, a * Math.sin(angle) + b * Math.cos(angle) + 0.03 * s * s)
      if (j < span && i < around) {
        const k = j * (around + 1) + i
        indices.push(k, k + around + 1, k + 1, k + 1, k + around + 1, k + around + 2)
      }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals()
  return g
}

export async function createEngineGeometry(): Promise<EngineGeometry> {
  const asset = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}engine/rotors.glb`)
  const root = new THREE.Group(); root.name = 'turbofan'
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
  const parts = new Map<EnginePart, THREE.Group>(), spinning: Array<{ node: THREE.Object3D; spool: 'lp' | 'hp' }> = []
  const casings: Array<{ full: THREE.Object3D; open: THREE.Object3D; owner: EnginePart }> = []
  const materialSets = new Map<EnginePart, Set<THREE.MeshStandardMaterial>>()
  const neutral = new Map<THREE.MeshStandardMaterial, THREE.Color>()
  const neutralMaps = new Map<THREE.MeshStandardMaterial, THREE.Texture | null>()
  const explosion: Record<EnginePart, [number, number, number]> = {
    nacelle: [0, 2.2, 0], fan: [-0.75, 0, 0], lpc: [-0.36, 0, 0], hpc: [0, 0, 0],
    combustor: [0.4, 0.65, 0], hpt: [0.8, 0, 0], lpt: [1.1, 0, 0],
    'lp-shaft': [0, -0.35, 0], 'hp-shaft': [0, 0.35, 0], nozzle: [1.65, 0, 0],
  }
  function trackMaterial<T extends THREE.Material>(m: T): T {
    materials.add(m)
    for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value)
    return m
  }
  function ownMaterial(id: EnginePart, m: THREE.MeshStandardMaterial) {
    trackMaterial(m); neutral.set(m, m.color.clone()); neutralMaps.set(m, m.map)
    if (!materialSets.has(id)) materialSets.set(id, new Set())
    materialSets.get(id)!.add(m)
    return m
  }
  const steel = (color: number, roughness = 0.42, metalness = 0.72) => new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide })
  function group(id: EnginePart) {
    if (!parts.has(id)) { const node = new THREE.Group(); node.name = id; node.userData.part = id; root.add(node); parts.set(id, node) }
    return parts.get(id)!
  }
  function add(id: EnginePart, geometry: THREE.BufferGeometry, m: THREE.MeshStandardMaterial, parent = group(id)) {
    geometries.add(geometry)
    const mesh = new THREE.Mesh(geometry, ownMaterial(id, m)); mesh.userData.part = id
    mesh.castShadow = !m.transparent; mesh.receiveShadow = false; parent.add(mesh); return mesh
  }
  const cutEdge = 0x9c5b43
  function casing(id: EnginePart, profile: readonly (readonly [number, number])[], wall: number, color: number, parent = group(id)) {
    const full = new THREE.Group(), open = new THREE.Group()
    add(id, shellGeometry(profile, wall), steel(color), full)
    add(id, shellGeometry(profile, wall, true), steel(color), open)
    for (const angle of [0, Math.PI / 2]) {
      const pos: number[] = [], index: number[] = []
      for (let i = 0; i < profile.length; i += 1) {
        const [x, r] = profile[i]
        for (const radius of [r, r - wall]) pos.push(x, radius * Math.cos(angle), radius * Math.sin(angle))
        if (i) { const k = i * 2; index.push(k - 2, k - 1, k, k, k - 1, k + 1) }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(index); geo.computeVertexNormals()
      add(id, geo, steel(cutEdge, 0.66, 0.15), open)
    }
    parent.add(full, open); casings.push({ full, open, owner: id })
    return { full, open }
  }
  function axialCylinder(id: EnginePart, r: number, start: number, end: number, color: number) {
    const mesh = add(id, new THREE.CylinderGeometry(r, r, end - start, 64), steel(color, 0.3))
    mesh.rotation.z = -Math.PI / 2; mesh.position.x = (start + end) / 2; return mesh
  }

  // Reused CC0 meshes already have X-forward geometry, UVs and separate rotating assemblies.
  asset.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    const id = node.name as EnginePart
    if (!['fan', 'lpc', 'hpc', 'hpt', 'lpt'].includes(id)) return
    const source = node.material as THREE.MeshStandardMaterial
    trackMaterial(source)
    const sourceMat = source.clone()
    if (id === 'fan') { sourceMat.color.multiply(new THREE.Color(0xa6b2bd)); sourceMat.metalness = 0.72; sourceMat.roughness = 0.4 }
    const mat = ownMaterial(id, sourceMat); mat.envMapIntensity = 0.95
    node.material = mat; geometries.add(node.geometry); node.castShadow = true; node.userData.part = id
    const pivot = new THREE.Group(); pivot.name = `${id}-rotor`; pivot.add(node.clone()); group(id).add(pivot)
    spinning.push({ node: pivot, spool: PART_SPOOL[id] as 'lp' | 'hp' })
  })

  // Close the source hub with an inlet spinner, carried by the low-pressure rotor.
  const spinnerGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0, -1.56), new THREE.Vector2(0.055, -1.50),
    new THREE.Vector2(0.16, -1.31), new THREE.Vector2(0.205, -1.18),
    new THREE.Vector2(0.21, -1.09), new THREE.Vector2(0, -1.09),
  ], 64)
  const spinner = add('fan', spinnerGeo, steel(0x687c8c, 0.36))
  spinner.rotation.z = -Math.PI / 2
  const spinnerPivot = new THREE.Group(); group('fan').remove(spinner); spinnerPivot.add(spinner); group('fan').add(spinnerPivot)
  spinning.push({ node: spinnerPivot, spool: 'lp' })

  casing('nacelle', ENGINE.nacelle, 0.045, 0xaab6bf)
  casing('nacelle', ENGINE.coreCase, 0.025, 0x8796a1)
  for (const [x, r] of [[-1.48, 0.966], [-0.48, 0.86], [0.31, 0.729], [1.18, 0.565]]) {
    casing('nacelle', [[x - 0.012, r], [x + 0.012, r]], 0.018, 0x596773)
  }

  // Static vane rows. Their parents never rotate with either spool.
  function vanes(id: EnginePart, x: number, hub: number, radius: number, count: number, chord: number, warm = false) {
    const geo = vaneGeometry(hub, radius, chord, warm ? -0.5 : 0.42); geometries.add(geo)
    const mat = ownMaterial(id, steel(warm ? 0xb99b67 : 0x9caebb, 0.44))
    const instances = new THREE.InstancedMesh(geo, mat, count)
    const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), axis = new THREE.Vector3(1, 0, 0)
    for (let i = 0; i < count; i += 1) {
      quaternion.setFromAxisAngle(axis, (i / count) * Math.PI * 2)
      matrix.compose(new THREE.Vector3(x, 0, 0), quaternion, new THREE.Vector3(1, 1, 1)); instances.setMatrixAt(i, matrix)
    }
    instances.userData.part = id; instances.userData.fixedVanes = true; instances.name = `${id}-stator-${x}`
    instances.castShadow = true; group(id).add(instances)
  }
  vanes('nacelle', -0.93, 0.48, 0.875, 24, 0.1)
  ENGINE.rotorStations.lpc.forEach((x, i) => vanes('lpc', x + 0.044, 0.324, 0.435 - i * 0.01, 30, 0.05))
  ENGINE.rotorStations.hpc.forEach((x, i) => vanes('hpc', x + 0.047, 0.24 - i * 0.006, 0.341 - i * 0.009, 36, 0.048))
  vanes('hpt', 0.72, 0.23, 0.335, 28, 0.05, true)
  ENGINE.rotorStations.lpt.forEach((x, i) => vanes('lpt', x - 0.043, 0.25, 0.36 + i * 0.014, 32, 0.044, true))

  // Hollow annular burner, perforated liners and discrete fuel nozzles.
  casing('combustor', [[0.30, 0.402], [0.34, 0.426], [0.61, 0.435], [0.70, 0.37]], 0.018, 0x9a6145)
  casing('combustor', [[0.31, 0.23], [0.38, 0.247], [0.62, 0.247], [0.69, 0.235]], 0.014, 0x84644d)
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2
    const injector = add('combustor', new THREE.CylinderGeometry(0.018, 0.026, 0.095, 10), steel(0x596776))
    injector.rotation.z = -Math.PI / 2; injector.position.set(0.33, 0.34 * Math.cos(a), 0.34 * Math.sin(a))
  }
  const flameMaterial = ownMaterial('combustor', new THREE.MeshStandardMaterial({ color: 0xffba55, emissive: 0xee641c,
    emissiveIntensity: 0.8, roughness: 1, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }))
  const flame = add('combustor', shellGeometry([[0.37, 0.34], [0.43, 0.365], [0.58, 0.35], [0.65, 0.31]], 0.028, true), flameMaterial)
  flame.castShadow = false; flame.name = 'annular-flame'

  const lpShaft = axialCylinder('lp-shaft', ENGINE.lpShaft.radius, ENGINE.lpShaft.start, ENGINE.lpShaft.end, 0x3279aa)
  spinning.push({ node: lpShaft, spool: 'lp' })
  const hp = ENGINE.hpShaft
  casing('hp-shaft', [[hp.start, hp.outer], [hp.end, hp.outer]], hp.outer - hp.inner, 0xca7a38)
  // HP cylinder remains rotationally symmetric; a narrow key strip makes its angular motion legible.
  for (const id of ['lp-shaft', 'hp-shaft'] as const) {
    const r = id === 'lp-shaft' ? ENGINE.lpShaft.radius : hp.outer
    const stripe = add(id, new THREE.BoxGeometry(0.65, 0.009, 0.012), steel(id === 'lp-shaft' ? 0xd9eefa : 0xfee3b2, 0.5, 0.2))
    stripe.position.set(0.1, r, 0)
    const pivot = new THREE.Group(); group(id).remove(stripe); pivot.add(stripe); group(id).add(pivot)
    spinning.push({ node: pivot, spool: id === 'lp-shaft' ? 'lp' : 'hp' })
  }

  casing('nozzle', [[1.33, 0.39], [1.43, 0.37], [1.69, 0.30], [1.86, 0.26]], 0.022, 0x5c6c79)
  const coneGeo = new THREE.LatheGeometry([new THREE.Vector2(0.18, 1.22), new THREE.Vector2(0.185, 1.34), new THREE.Vector2(0.11, 1.61), new THREE.Vector2(0.006, 1.96)], 64)
  const cone = add('nozzle', coneGeo, steel(0x56616b, 0.35)); cone.rotation.z = -Math.PI / 2

  // Museum supports are display hardware, not claimed engine internals.
  const supports = new THREE.Group(); supports.name = 'exhibition-supports'; root.add(supports)
  const baseMat = trackMaterial(steel(0x60686a, 0.65, 0.2))
  for (const x of [-0.8, 0.9]) {
    const underside = radiusAt(ENGINE.nacelle, x), height = 1.1325 - underside
    const supportGeo = new THREE.BoxGeometry(0.1, height, 0.48); geometries.add(supportGeo)
    const support = new THREE.Mesh(supportGeo, baseMat); support.position.set(x, -(1.1325 + underside) / 2, 0); supports.add(support)
  }
  const baseGeo = new THREE.BoxGeometry(2.7, 0.055, 1.12); geometries.add(baseGeo)
  const base = new THREE.Mesh(baseGeo, baseMat); base.position.set(0, -1.16, 0); base.receiveShadow = true; supports.add(base)

  // Deterministic stream dots and ribbons read the same model path and travel integral.
  const flowGroups = { core: new THREE.Group(), bypass: new THREE.Group() }
  const particleCount = 288, buffers: Record<'core' | 'bypass', THREE.BufferAttribute> = {} as Record<'core' | 'bypass', THREE.BufferAttribute>
  for (const path of ['core', 'bypass'] as const) {
    root.add(flowGroups[path]); flowGroups[path].name = `${path}-airflow`
    const geo = new THREE.BufferGeometry(); geometries.add(geo)
    const position = new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3).setUsage(THREE.DynamicDrawUsage)
    const colors = new Float32Array(particleCount * 3)
    geo.setAttribute('position', position); geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); buffers[path] = position
    const mat = trackMaterial(new THREE.PointsMaterial({ size: 0.027, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true }))
    const points = new THREE.Points(geo, mat); points.frustumCulled = false; flowGroups[path].add(points)
    for (let lane = 0; lane < 5; lane += 1) {
      const a = 0.12 + (lane / 4) * 1.28
      const vertices: number[] = []
      for (let i = 0; i <= 80; i += 1) vertices.push(...flowPoint(path, i === 80 ? 0.99999 : i / 80, a))
      const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometries.add(lineGeo)
      const lineMat = trackMaterial(new THREE.LineBasicMaterial({ color: path === 'core' ? 0xb56937 : 0x3785a2, transparent: true, opacity: 0.40, depthWrite: false }))
      flowGroups[path].add(new THREE.Line(lineGeo, lineMat))
    }
  }

  let lastStyle = ''
  function update(state: EngineSnapshot, display: EngineDisplay) {
    const { view, isolate, selected } = display
    const style = `${view}/${isolate}/${selected}`
    if (style !== lastStyle) {
      lastStyle = style
      for (const [id, node] of parts) {
        const spool = PART_SPOOL[id]
        node.visible = isolate === 'all' || (isolate === 'shafts' ? id === 'lp-shaft' || id === 'hp-shaft' : spool === isolate)
      }
      // Fixed vane carriers stay fixed in assembled mode, but are hidden when isolating a rotating system.
      root.traverse((node) => { if (node.userData.fixedVanes) node.visible = isolate === 'all' })
      for (const c of casings) {
        const open = c.owner === 'hp-shaft' ? view !== 'exterior' || isolate === 'shafts' : view === 'cutaway'
        c.full.visible = !open; c.open.visible = open
      }
      for (const [id, set] of materialSets) for (const mat of set) {
        mat.color.copy(neutral.get(mat)!)
        const teachingColor = isolate !== 'all' && PART_SPOOL[id] !== 'fixed'
        const map = teachingColor ? null : neutralMaps.get(mat) ?? null
        if (mat.map !== map) { mat.map = map; mat.needsUpdate = true }
        if (teachingColor) mat.color.setHex(PART_SPOOL[id] === 'lp' ? 0x408ab5 : 0xd18a43)
        if (mat !== flameMaterial) { mat.emissive.setHex(selected === id ? 0x925a26 : 0); mat.emissiveIntensity = selected === id ? 0.22 : 0 }
      }
    }
    for (const [id, node] of parts) node.position.set(...explosion[id]).multiplyScalar(display.explode)
    for (const item of spinning) item.node.rotation.x = item.spool === 'lp' ? state.lpAngle : state.hpAngle
    supports.visible = isolate === 'all' && display.explode < 0.05
    flameMaterial.emissiveIntensity = 0.45 + state.heat * 0.65
    flameMaterial.opacity = 0.45 + state.heat * 0.25
    for (const path of ['core', 'bypass'] as const) {
      const visible = isolate === 'all' && display.explode < 0.02 && (display.flow === 'both' || display.flow === path)
      flowGroups[path].visible = visible
      if (!visible) continue
      const pos = buffers[path], col = (flowGroups[path].children[0] as THREE.Points).geometry.attributes.color
      for (let i = 0; i < particleCount; i += 1) {
        const lane = i % 12, index = Math.floor(i / 12)
        const progress = (index / 24 + state.travel * (path === 'core' ? 0.85 : 1) + lane * 0.021) % 1
        const a = (lane / 12) * Math.PI * 2 + 0.08
        const p = flowPoint(path, progress, a, (i % 3 - 1) * 0.012); pos.setXYZ(i, ...p)
        const hot = path === 'core' && p[0] >= 0.34
        col.setXYZ(i, hot ? 0.9 : 0.09, hot ? 0.34 + 0.12 * state.heat : 0.49, hot ? 0.07 : 0.7)
      }
      pos.needsUpdate = true; col.needsUpdate = true
      ;(flowGroups[path].children[0] as THREE.Points).geometry.setDrawRange(0, display.quality === 'low' ? 144 : particleCount)
    }
  }

  function pick(ray: THREE.Raycaster): EnginePart | null {
    for (const hit of ray.intersectObject(root, true)) {
      let node: THREE.Object3D | null = hit.object, id: EnginePart | null = null, visible = true
      for (; node; node = node.parent) { if (!node.visible) visible = false; if (!id && node.userData.part) id = node.userData.part as EnginePart }
      if (visible && id) return id
    }
    return null
  }
  function dispose() {
    root.traverse((node) => { if (node instanceof THREE.InstancedMesh) node.dispose() })
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
    for (const texture of textures) texture.dispose()
    root.clear()
  }
  return { root, update, pick, dispose }
}
