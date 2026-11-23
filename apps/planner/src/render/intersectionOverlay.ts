import { NVMesh, type Niivue } from '@niivue/niivue'
import { type IntersectionResult, type IntersectionSurface } from './intersections.ts'
import type { Vec3 } from '@brainana/planning-core/model.ts'
import type { ScenePart } from './sceneParts.ts'
import { combine, sphere } from './primitives.ts'
import { workerTask } from '../workers/task.ts'

export function hardwareIntersectionSurfaces(parts: ScenePart[]): IntersectionSurface[] {
  return parts.flatMap(part => part.collisionGroup && part.geometry.tris.length ? [{
    ...part.geometry, group: part.collisionGroup, name: part.collisionName ?? part.name, penetration: part.layer === 'guideTubes' || part.collisionGroup.startsWith('electrode:'), gridSolid: part.gridSolid,
  }] : [])
}

export class IntersectionOverlay {
  #enabled = false
  #last: IntersectionSurface[] = []
  #timer?: ReturnType<typeof setTimeout>
  #job?: AbortController
  #markers: Array<[Niivue, NVMesh]> = []
  #overlay3D?: NVMesh
  #installed = false
  #points: Vec3[] = []
  #next = 0
  get hasPoints(): boolean { return this.#points.length > 0 }
  nextPoint(): Vec3 | undefined {
    if (!this.#points.length) return undefined
    const point = this.#points[this.#next]
    this.#next = (this.#next + 1) % this.#points.length
    return point
  }
  status = (_text: string, _checking = false): void => {}

  constructor(private readonly viewers: Niivue[]) {}

  update(enabled: boolean, sources: IntersectionSurface[]): void {
    if (!enabled && !this.#enabled) return
    const same = enabled && this.#enabled && sources.length === this.#last.length && sources.every((item, i) =>
      item.pts === this.#last[i].pts && item.tris === this.#last[i].tris &&
      item.group === this.#last[i].group && item.name === this.#last[i].name,
    )
    if (same) return
    this.#enabled = enabled
    clearTimeout(this.#timer)
    this.#job?.abort()
    this.#job = undefined
    this.#last = enabled ? sources : []
    this.#clearMarkers()
    if (!enabled) { this.status(''); return }
    if (!sources.some(a => !a.anatomy && sources.some(b => b.group !== a.group))) {
      this.status('Add modeled objects or anatomy surfaces to check intersections.')
      return
    }
    this.status('Checking intersections…', true)
    this.#timer = setTimeout(() => {
      const job = new AbortController()
      this.#job = job
      void workerTask<IntersectionSurface[], IntersectionResult>(
        () => new Worker(new URL('../workers/intersections.ts', import.meta.url), { type: 'module' }),
        sources, { signal: job.signal },
      ).then(result => {
        if (job.signal.aborted) return
        this.#points = result.points
        if (result.points.length || result.overlap.tris.length) {
          const shape = combine([result.overlap, ...result.points.map(point => sphere(point, .65, 8, 6))])
          const [render, ...slices] = this.viewers
          this.#installOverlay(render)
          this.#overlay3D = new NVMesh(shape.pts, shape.tris, 'Overlaps', new Uint8Array([255, 45, 40, 255]), 1, true, render.gl)
          render.drawScene()
          for (const viewer of slices) {
            const mesh = new NVMesh(shape.pts, shape.tris, 'Overlaps', new Uint8Array([255, 45, 40, 255]), 1, true, viewer.gl)
            viewer.addMesh(mesh)
            viewer.drawScene()
            this.#markers.push([viewer, mesh])
          }
        }
        const noAnatomy = !sources.some(item => item.anatomy)
        this.status(result.pairs.length
          ? `Red overlaps · ${result.pairs.slice(0, 3).join(', ')}${result.pairs.length > 3 ? ` +${result.pairs.length - 3} more` : ''}${result.limited ? ' · representative points' : ''}`
          : 'No intersections found in the modeled surfaces.' + (noAnatomy ? ' Load an anatomy mesh to check the anatomy.' : ''))
      }).catch(error => {
        if (!job.signal.aborted) this.status('Could not check intersections. ' + String(error))
      })
    }, 200)
  }

  #installOverlay(viewer: Niivue): void {
    if (this.#installed) return
    this.#installed = true
    const draw = viewer.drawMesh3D.bind(viewer)
    viewer.drawMesh3D = (depthTest = true, alpha = 1, mvp, model, normals, is2D) => {
      draw(depthTest, alpha, mvp, model, normals, is2D)
      const mesh = this.#overlay3D
      if (!mesh || !depthTest || alpha !== 1 || is2D || !mvp || !normals || viewer.uiData.mouseDepthPicker) return
      const gl = viewer.gl, shader = viewer.meshShaders[mesh.meshShaderIndex]?.shader
      if (!shader) return
      const depth = gl.isEnabled(gl.DEPTH_TEST), cull = gl.isEnabled(gl.CULL_FACE), blend = gl.isEnabled(gl.BLEND)
      const mask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean
      const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null
      const vao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null
      try {
        gl.disable(gl.DEPTH_TEST)
        gl.disable(gl.CULL_FACE)
        gl.disable(gl.BLEND)
        gl.depthMask(false)
        shader.use(gl)
        gl.uniformMatrix4fv(shader.uniforms.mvpMtx, false, mvp)
        gl.uniformMatrix4fv(shader.uniforms.normMtx, false, normals)
        gl.uniform1f(shader.uniforms.opacity, 1)
        gl.bindVertexArray(mesh.vao)
        gl.drawElements(gl.TRIANGLES, mesh.indexCount!, gl.UNSIGNED_INT, 0)
      } finally {
        if (depth) gl.enable(gl.DEPTH_TEST)
        if (cull) gl.enable(gl.CULL_FACE)
        if (blend) gl.enable(gl.BLEND)
        gl.depthMask(mask)
        gl.useProgram(program)
        gl.bindVertexArray(vao)
      }
    }
  }

  #clearMarkers(): void {
    if (this.#overlay3D) {
      const [viewer] = this.viewers
      this.#overlay3D.unloadMesh(viewer.gl)
      this.#overlay3D = undefined
      viewer.drawScene()
    }
    for (const [viewer, mesh] of this.#markers) {
      viewer.removeMesh(mesh)
      viewer.drawScene()
    }
    this.#markers = []
    this.#points = []
    this.#next = 0
  }
}
