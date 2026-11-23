import { bandTest, depthEpsilon, firstDepthUnit, layerLimit } from './depthLayers.ts'
type Pass = { previous: WebGLTexture } | { band: number }
type Target = { framebuffer: WebGLFramebuffer; color: WebGLTexture; depth: WebGLTexture; width: number; height: number }

/** Capture the ray-cast volume as a translucent layer, so its first hit cannot punch out bone. */
export function volumeLayer(gl: WebGL2RenderingContext) {
  let target: Target | undefined, program: WebGLProgram | undefined, vao: WebGLVertexArrayObject | null = null
  let uniforms: Record<string, WebGLUniformLocation | null> = {}
  const state = { active: false, capture, draw }
  function texture(internal: number, format: number, type: number, width: number, height: number) {
    const result = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, result)
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    return result
  }
  function capture(width: number, height: number, render: () => void) {
    state.active = false
    const drawBuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING), readBuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)
    const clearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE), bound = gl.getParameter(gl.TEXTURE_BINDING_2D)
    const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE)
    const blendFactors = [gl.BLEND_SRC_RGB,gl.BLEND_DST_RGB,gl.BLEND_SRC_ALPHA,gl.BLEND_DST_ALPHA].map(value=>gl.getParameter(value))
    const blend = gl.blendFunc
    try {
      if (!target || target.width !== width || target.height !== height) {
        if (target) { gl.deleteFramebuffer(target.framebuffer); gl.deleteTexture(target.color); gl.deleteTexture(target.depth) }
        const color = texture(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, width, height)
        const depth = texture(gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, width, height)
        const framebuffer = gl.createFramebuffer()!
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0)
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]); gl.readBuffer(gl.COLOR_ATTACHMENT0)
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          gl.deleteFramebuffer(framebuffer); gl.deleteTexture(color); gl.deleteTexture(depth)
          target = undefined
          throw Error('Volume layer framebuffer is incomplete')
        }
        target = { framebuffer, color, depth, width, height }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
      gl.clearColor(0, 0, 0, 0); gl.depthMask(true)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      // NiiVue enables blending inside render(). Capture its straight RGBA output exactly once;
      // applying source alpha here and again during layer compositing would square its opacity.
      gl.blendFunc = () => blend.call(gl, gl.ONE, gl.ZERO)
      render()
      state.active = true
    } finally {
      gl.blendFunc = blend
      gl.blendFuncSeparate(blendFactors[0],blendFactors[1],blendFactors[2],blendFactors[3])
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawBuffer); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readBuffer)
      gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3])
      gl.activeTexture(activeTexture); gl.bindTexture(gl.TEXTURE_2D, bound)
    }
  }
  function shader(type: number, source: string) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source); gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw Error(message ?? 'Volume layer shader failed') }
    return shader
  }
  function initialize() {
    const vertex = shader(gl.VERTEX_SHADER, `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`)
    const fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D volumeColor;
uniform highp sampler2D volumeDepth;
uniform highp sampler2D previousDepth;
uniform int layerPass;
out vec4 color;
${bandTest}
void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  color = texelFetch(volumeColor, pixel, 0);
  if (color.a <= 0.0) discard;
  float z = texelFetch(volumeDepth, pixel, 0).r;
  if (z >= 1.0) discard;
  if (layerPass == 1 && z <= texelFetch(previousDepth, pixel, 0).r + ${depthEpsilon}) discard;
  if (layerPass == 2 && !insideDepthBand(z, pixel)) discard;
  gl_FragDepth = z;
}`)
    program = gl.createProgram()!
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
    gl.deleteShader(vertex); gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program) ?? 'Volume layer link failed')
    vao = gl.createVertexArray()
    uniforms = Object.fromEntries(['volumeColor','volumeDepth','previousDepth','layerPass','depthCount','meshBand',...Array.from({length:layerLimit},(_,i)=>'anatomyDepth'+i)].map(name=>[name,gl.getUniformLocation(program!,name)]))
  }
  function draw(depthCount: number, pass?: Pass) {
    if (!state.active || !target) return
    if (!program) initialize()
    const active = gl.getParameter(gl.ACTIVE_TEXTURE), bindings: (WebGLTexture | null)[] = []
    try {
      for (const [i, value] of [target.color, target.depth].entries()) {
        gl.activeTexture(gl.TEXTURE0 + i); bindings.push(gl.getParameter(gl.TEXTURE_BINDING_2D)); gl.bindTexture(gl.TEXTURE_2D, value)
      }
      gl.useProgram(program!)
      gl.uniform1i(uniforms.volumeColor, 0); gl.uniform1i(uniforms.volumeDepth, 1)
      gl.uniform1i(uniforms.layerPass, pass && 'previous' in pass ? 1 : pass ? 2 : 0)
      gl.uniform1i(uniforms.previousDepth, firstDepthUnit)
      if (pass && 'previous' in pass) { gl.activeTexture(gl.TEXTURE0 + firstDepthUnit); gl.bindTexture(gl.TEXTURE_2D, pass.previous) }
      if (pass && 'band' in pass) {
        for (let i=0;i<layerLimit;i++) gl.uniform1i(uniforms['anatomyDepth'+i],firstDepthUnit+i)
        gl.uniform1i(uniforms.depthCount, depthCount); gl.uniform1i(uniforms.meshBand, pass.band)
        gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA)
      }
      if (!pass && depthCount === 0) { gl.depthMask(true); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA) }
      gl.disable(gl.CULL_FACE); gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES,0,3)
    } finally {
      for (let i=0;i<bindings.length;i++) { gl.activeTexture(gl.TEXTURE0+i); gl.bindTexture(gl.TEXTURE_2D,bindings[i]) }
      gl.activeTexture(active)
    }
  }
  return state
}
