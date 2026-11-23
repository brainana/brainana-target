import { NVMesh, type Niivue } from '@niivue/niivue'
import { layerOpacity, type SceneDisplay, type SceneLayer } from './display.ts'
import type { ScenePart } from './sceneParts.ts'
interface Entry { part: ScenePart; geometry: ScenePart['geometry']; mesh: NVMesh }
/** Own GPU meshes separately from domain geometry; unchanged buffers stay on the GPU. */
export class SceneMeshes {
  #viewers = new Map<Niivue, Map<string, Entry>>()
  /** The scene removes its GPU meshes before forgetting their cache on project replacement. */
  clear(): void { this.#viewers.clear() }
  mesh(viewer: Niivue, key: string): NVMesh | undefined { return this.#viewers.get(viewer)?.get(key)?.mesh }
  pickableMeshes(viewer: Niivue, prefix: string): NVMesh[] {
    return Array.from(this.#viewers.get(viewer) ?? [])
      .filter(([key]) => key.startsWith(prefix)).map(([, { mesh }]) => mesh)
  }
  pickable(viewer: Niivue, prefix: string): ScenePart['geometry'][] {
    return Array.from(this.#viewers.get(viewer) ?? [])
      .filter(([key, { mesh }]) => key.startsWith(prefix) && mesh.opacity > 0)
      .map(([, { geometry }]) => geometry)
  }
  update(viewer: Niivue, parts: ScenePart[], overview: boolean, display: SceneDisplay): Array<{ mesh: NVMesh; layer: SceneLayer; opacity: number }> {
    const previous = this.#viewers.get(viewer) ?? new Map<string, Entry>(), next = new Map<string, Entry>()
    const shown: Array<{ mesh: NVMesh; layer: SceneLayer; opacity: number }> = []
    for (const [index, part] of parts.entries()) {
      if (!overview && (part.avoidance || part.renderOnly)) continue
      const key = part.key ?? `overlay:${index}:${part.name}`, geometry = overview ? part.overviewGeometry ?? part.geometry : part.geometry
      const old = previous.get(key)
      let mesh: NVMesh
      if (old && old.geometry.pts === geometry.pts && old.geometry.tris === geometry.tris && old.part.color === part.color) mesh = old.mesh
      else {
        if (old) viewer.removeMesh(old.mesh)
        const rgba = new Uint8Array([parseInt(part.color.slice(1, 3), 16), parseInt(part.color.slice(3, 5), 16), parseInt(part.color.slice(5, 7), 16), 255])
        mesh = new NVMesh(geometry.pts, geometry.tris, part.name, rgba, part.opacity, true, viewer.gl)
        viewer.addMesh(mesh)
      }
      mesh.name = part.name
      mesh.opacity = (overview || part.layer === 'stereotax') && !part.placementOverlay ? layerOpacity(display, part.layer, part.opacity) : part.opacity
      next.set(key, { part, geometry, mesh })
      if (overview && !part.placementOverlay) shown.push({ mesh, layer: part.layer, opacity: part.opacity })
    }
    for (const [key, old] of previous) if (!next.has(key)) viewer.removeMesh(old.mesh)
    // Preserve the established part order, including transparent meshes, without re-uploading buffers.
    const owned = new Set([...previous.values(), ...next.values()].map(entry => entry.mesh))
    viewer.meshes = [...viewer.meshes.filter(mesh => !owned.has(mesh)), ...[...next.values()].map(entry => entry.mesh)]
    this.#viewers.set(viewer, next)
    return shown
  }
}
