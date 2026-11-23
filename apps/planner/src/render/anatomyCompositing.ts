import { layerLimit, firstDepthUnit, bandFragment, peelFragment } from './depthLayers.ts'
import { volumeLayer } from './volumeLayer.ts'
import type { Niivue, NVMesh } from '@niivue/niivue'
import type { mat4 } from 'gl-matrix'

type DepthTarget = { framebuffer: WebGLFramebuffer; texture: WebGLTexture }
type DrawPass = { previous: WebGLTexture } | { band: number }
type Shader = NonNullable<Niivue['meshShaders'][number]['shader']>

/** Keep front and deeper anatomical surfaces in depth order around the hardware. */
export function installAnatomyCompositing(
  viewer: Niivue, getAnatomy: () => NVMesh[], cutPlane?: () => number[],
): void {
  const original = viewer.drawMesh3D.bind(viewer)
  const bandShaders = new Map<number, Shader>()
  const peelShaders = new Map<number, Shader>()
  const depths: DepthTarget[] = []
  let size = ''
  let unavailable = false
  const gl = viewer.gl
  const volume = volumeLayer(gl)
  const originalVolume = viewer.drawImage3D.bind(viewer)
  viewer.drawImage3D = (...args) => {
    volume.active = false
    if (unavailable || viewer.uiData.mouseDepthPicker || !viewer.meshes.some(mesh => mesh.visible && mesh.opacity > 0 && !!mesh.tris?.length)) return originalVolume(...args)
    try { volume.capture(viewer.canvas!.width, viewer.canvas!.height, () => originalVolume(...args)) }
    catch (error) { unavailable=true; console.warn('Volume depth compositing unavailable:',error); originalVolume(...args) }
  }

  function target(width: number, height: number): DepthTarget {
    const texture = gl.createTexture(), framebuffer = gl.createFramebuffer()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0)
    gl.drawBuffers([gl.NONE])
    gl.readBuffer(gl.NONE)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer)
      gl.deleteTexture(texture)
      throw new Error('Anatomy depth framebuffer is incomplete')
    }
    return { framebuffer, texture }
  }

  function shaderFor(index: number, pass: DrawPass): Shader {
    const peeling = 'previous' in pass
    const cache = peeling ? peelShaders : bandShaders
    const existing = cache.get(index)
    if (existing) return existing
    const fragment = viewer.meshShaders[index].Frag.replace(/void\s+main\s*\(\s*\)/, 'void shadeMesh()')
      + (peeling ? peelFragment : bandFragment)
    const shader = viewer.createCustomMeshShader(fragment, peeling ? 'Anatomy depth peel' : 'Anatomy depth bands').shader
    if (!shader) throw new Error('Could not initialize depth compositing')
    cache.set(index, shader)
    return shader
  }

  function draw(meshes: NVMesh[], mvp: mat4, normals: mat4, depthCount: number, pass?: DrawPass): void {
    for (const mesh of meshes) {
      const index = mesh.meshShaderIndex
      const shader = pass ? shaderFor(index, pass) : viewer.meshShaders[index].shader
      if (!shader) continue
      shader.use(gl)
      const uniforms = shader.uniforms
      gl.uniformMatrix4fv(uniforms.mvpMtx, false, mvp)
      gl.uniformMatrix4fv(uniforms.normMtx, false, normals)
      gl.uniform1f(uniforms.opacity, mesh.opacity)
      if (uniforms.cutPlane && cutPlane) gl.uniform4fv(uniforms.cutPlane, cutPlane())
      if (pass && 'previous' in pass) {
        gl.activeTexture(gl.TEXTURE0 + firstDepthUnit)
        gl.bindTexture(gl.TEXTURE_2D, pass.previous)
        gl.uniform1i(uniforms.previousDepth, firstDepthUnit)
      } else if (pass) {
        for (let i = 0; i < layerLimit; i++) gl.uniform1i(uniforms['anatomyDepth' + i], firstDepthUnit + i)
        gl.uniform1i(uniforms.depthCount, depthCount)
        gl.uniform1i(uniforms.meshBand, pass.band)
        gl.depthMask(mesh.opacity >= 1)
        if (mesh.opacity < 1) gl.enable(gl.BLEND)
        else gl.disable(gl.BLEND)
      }
      gl.bindVertexArray(mesh.vao)
      gl.drawElements(gl.TRIANGLES, mesh.indexCount!, gl.UNSIGNED_INT, 0)
    }
  }

  viewer.drawMesh3D = (depthTest = true, alpha = 1, mvp, model, normals, is2D) => {
    if (!viewer.volumes.length) volume.active = false
    if (unavailable || !depthTest || alpha !== 1 || is2D || !mvp || !normals || viewer.uiData.mouseDepthPicker)
      return original(depthTest, alpha, mvp, model, normals, is2D)
    // removeMesh unloads GPU resources before every redraw during project replacement.
    const visible = (mesh: NVMesh) => mesh.visible && mesh.opacity > 0 && !!mesh.tris?.length && !!mesh.pts?.length
    const anatomy = getAnatomy().filter(visible)
    const { width, height } = viewer.canvas!
    if ((!anatomy.length && !volume.active) || !width || !height)
      return original(depthTest, alpha, mvp, model, normals, is2D)

    const anatomySet = new Set(anatomy)
    const hardware = viewer.meshes.filter(mesh => visible(mesh) && !anatomySet.has(mesh))
    const depthCount = !volume.active && anatomy.every(mesh => mesh.opacity >= 1) ? 1 : layerLimit
    const drawBuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const readBuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number
    const activeVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null
    const oldTextures: (WebGLTexture | null)[] = []
    for (let i = 0; i < layerLimit; i++) {
      gl.activeTexture(gl.TEXTURE0 + firstDepthUnit + i)
      oldTextures.push(gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null)
    }
    try {
      const dimensions = width + ':' + height
      if (dimensions !== size) {
        for (const target of depths.splice(0)) {
          gl.deleteFramebuffer(target.framebuffer)
          gl.deleteTexture(target.texture)
        }
        size = dimensions
      }
      while (depths.length < depthCount) depths.push(target(width, height))
      gl.enable(gl.DEPTH_TEST)
      // The far wall of a shell is visible through the front wall at reduced opacity.
      gl.disable(gl.CULL_FACE)
      gl.depthFunc(gl.LEQUAL)
      gl.depthMask(true)
      gl.disable(gl.BLEND)
      for (let i = 0; i < depthCount; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, depths[i].framebuffer)
        gl.clear(gl.DEPTH_BUFFER_BIT)
        const pass = i ? { previous: depths[i - 1].texture } : undefined
        draw(anatomy, mvp, normals, depthCount, pass)
        volume.draw(depthCount, pass)
      }
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawBuffer)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readBuffer)
      for (let i = 0; i < layerLimit; i++) {
        gl.activeTexture(gl.TEXTURE0 + firstDepthUnit + i)
        gl.bindTexture(gl.TEXTURE_2D, (depths[i] ?? depths[0]).texture)
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      for (let i = depthCount - 1; i >= 0; i--) {
        gl.enable(gl.CULL_FACE)
        gl.cullFace(gl.BACK)
        draw(hardware, mvp, normals, depthCount, { band: i })
        gl.disable(gl.CULL_FACE)
        draw(anatomy, mvp, normals, depthCount, { band: layerLimit + i })
        volume.draw(depthCount, { band: layerLimit + i })
      }
      gl.enable(gl.CULL_FACE)
      gl.cullFace(gl.BACK)
      draw(hardware, mvp, normals, depthCount, { band: -1 })
      viewer.readyForSync = true
    } catch (error) {
      unavailable = true
      console.warn('Anatomy depth compositing unavailable:', error)
    } finally {
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawBuffer)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readBuffer)
      for (const [i, texture] of oldTextures.entries()) {
        gl.activeTexture(gl.TEXTURE0 + firstDepthUnit + i)
        gl.bindTexture(gl.TEXTURE_2D, texture)
      }
      gl.activeTexture(activeTexture)
      gl.bindVertexArray(activeVao)
      gl.depthMask(true)
      gl.disable(gl.BLEND)
    }
    if (unavailable) { volume.draw(0); original(depthTest, alpha, mvp, model, normals, is2D) }
  }
}
