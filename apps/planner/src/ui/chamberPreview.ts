import { disposePreview } from '../render/disposePreview.ts'
import {gridWedge,gridChannel,gridChannelLength} from '../render/gridGeometry.ts'
import { Niivue, NVMesh, SLICE_TYPE } from '@niivue/niivue'
import { h } from '@brainana/ui/dom.ts'
import { gridHoles, holeLocal } from '@brainana/planning-core/geometry.ts'
import type { Chamber, Grid } from '@brainana/planning-core/model.ts'
import { ring, sphere, combine,cylinder } from '../render/primitives.ts'
import { button, note } from './controls.ts'
/** Isolated hardware viewer: dimensions only, never an anatomical pose. */
export function chamberPreview() {
  if (typeof MutationObserver === 'undefined') return { element: note('Interactive 3D preview requires a browser graphics context.'), update: (_chamber: Chamber, _grid?: Grid) => {} }
  const canvas = h('canvas', { width: 500, height: 300, class: 'chamber-preview-3d', ariaLabel: 'Rotatable 3D chamber and grid preview' })
  const message = note('Enter chamber dimensions to activate the rotatable 3D preview.')
  const root = h('div', { class: 'chamber-preview' }, [canvas, message])
  let nv: Niivue | null = null, ready = false, closed = false, wasConnected = false, key = ''
  let pending: { chamber: Chamber; grid?: Grid } | null = null
  const dispose = () => { closed = true; observer.disconnect(); disposePreview(nv) }
  const paint = () => {
    if (!ready || !nv || !pending || closed) return
    for (const mesh of [...nv.meshes]) nv.removeMesh(mesh)
    const c = { ...pending.chamber, pose: { origin: [0, 0, 0] as [number, number, number], angles: [0, 0, 0] as [number, number, number] } }
    const body = ring(c.pose, c.innerRadius, c.innerRadius + c.wallThickness, c.height, 64)
    nv.addMesh(new NVMesh(body.pts, body.tris, 'Chamber dimensions', new Uint8Array([230, 161, 58, 255]), .8, true, nv.gl))
    if (pending.grid?.enabled !== false && pending.grid) {
      const grid = pending.grid, holes = gridHoles(c, grid).slice(0, 1000)
      const wedge=gridWedge(c,grid);nv.addMesh(new NVMesh(wedge.pts,wedge.tris,'Schematic wedge insert',new Uint8Array([180,200,220,255]),.18,true,nv.gl))
      const marks = combine(holes.flatMap(hole => [sphere(holeLocal(grid, hole,c), Math.min(.15, grid.spacing / 5), 8, 4),...(gridChannelLength(c,grid,hole)>1e-8?[cylinder(...gridChannel(c,grid,hole),.1,8)]:[])]))
      if (marks.tris.length) nv.addMesh(new NVMesh(marks.pts, marks.tris, 'Grid hole centres', new Uint8Array([90, 220, 220, 255]), 1, true, nv.gl))
    }
    nv.drawScene(); message.textContent = "Drag to rotate; scroll to zoom. Grid markers show the guide-hole centres. Grid thickness and angle follow the dimensions you enter."
  }
  const start = async () => {
    if (nv || !root.isConnected || !pending || closed) return
    nv = new Niivue({ backColor: [.06, .05, .04, 1], isColorbar: false, isOrientCube: true, dragAndDropEnabled: false })
    try { await nv.attachToCanvas(canvas); if (closed || !root.isConnected) { disposePreview(nv); return }; ready = true; nv.setSliceType(SLICE_TYPE.RENDER); nv.setRenderAzimuthElevation(120, 25); paint() }
    catch (error) { message.textContent = `3D preview unavailable: ${String(error)}. The dimension layout remains available.`; disposePreview(nv) }
  }
  const observer = new MutationObserver(() => {
    if (root.isConnected) { wasConnected = true; void start() }
    else if (wasConnected) dispose()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  root.append(h('div', { class: 'camera-buttons' }, [button('Top', () => nv?.setRenderAzimuthElevation(0, 90)), button('Side', () => nv?.setRenderAzimuthElevation(0, 0)), button('Fit', () => nv?.setScale(1))]))
  return { element: root, update: (chamber: Chamber, grid?: Grid) => { const signature = JSON.stringify([chamber.innerRadius, chamber.wallThickness, chamber.height, grid]); if (signature === key) return; key = signature; pending = { chamber, grid }; if (ready) paint(); else void start() } }
}
