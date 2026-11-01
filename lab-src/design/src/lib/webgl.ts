/**
 * WebGL 能力检测。
 *
 * 不支持时展品要退回到「可理解的图文替代」，而不是给一块黑屏。
 * 检测只建一次上下文，然后立刻释放，避免占用浏览器有限的上下文名额。
 */

export interface WebGLReport {
  ok: boolean
  /** 2 = WebGL2，1 = WebGL1，0 = 不可用 */
  version: 0 | 1 | 2
  /** 显卡/驱动标识，便于在页面里显示「正在用哪块 GPU 渲染」 */
  renderer: string | null
  reason: string | null
}

let cached: WebGLReport | null = null

export function detectWebGL(): WebGLReport {
  if (cached) return cached

  if (typeof document === 'undefined') {
    cached = { ok: false, version: 0, renderer: null, reason: '没有浏览器环境' }
    return cached
  }

  let canvas: HTMLCanvasElement | null = document.createElement('canvas')
  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null

  try {
    gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false })
    if (gl) {
      cached = { ok: true, version: 2, renderer: readRenderer(gl), reason: null }
    } else {
      gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false })
      cached = gl
        ? { ok: true, version: 1, renderer: readRenderer(gl), reason: null }
        : {
            ok: false,
            version: 0,
            renderer: null,
            reason: '浏览器没有提供 WebGL 上下文，可能是显卡驱动被禁用或浏览器关闭了硬件加速。',
          }
    }
  } catch (error) {
    cached = {
      ok: false,
      version: 0,
      renderer: null,
      reason: error instanceof Error ? error.message : '创建 WebGL 上下文失败。',
    }
  } finally {
    // 主动丢弃这个探测上下文，别占着名额
    const lose = gl?.getExtension('WEBGL_lose_context')
    lose?.loseContext()
    gl = null
    canvas = null
  }

  return cached
}

function readRenderer(gl: WebGL2RenderingContext | WebGLRenderingContext): string | null {
  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    if (debugInfo) {
      const value = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      return typeof value === 'string' ? value : null
    }
    const fallback = gl.getParameter(gl.RENDERER)
    return typeof fallback === 'string' ? fallback : null
  } catch {
    return null
  }
}

/** 软件渲染（SwiftShader / llvmpipe / Microsoft Basic Render）通常带不动 60 fps */
export function isSoftwareRenderer(renderer: string | null): boolean {
  if (!renderer) return false
  const name = renderer.toLowerCase()
  return ['swiftshader', 'llvmpipe', 'basic render', 'software', 'mesa offscreen'].some((token) =>
    name.includes(token),
  )
}
