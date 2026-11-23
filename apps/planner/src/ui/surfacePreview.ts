import { disposePreview } from '../render/disposePreview.ts'
import { installAnatomyCompositing } from '../render/anatomyCompositing.ts'
import { ctSurfaceColor } from '../render/display.ts'
import { openingColors, openingCategory } from './openingAppearance.ts'
import { detectOpenings, type OpeningCandidate } from '../render/detectOpenings.ts'
import { surfaceRay, raySurface, rayOpening, rayRimPoint } from '../render/surfacePicking.ts'
import { Niivue, NVMesh, SLICE_TYPE } from '@niivue/niivue'
import { h } from '@brainana/ui/dom.ts'
import { lockPreviewFrame } from '../render/surfaceFrame.ts'
import type { SurfaceOpening, Vec3 } from '@brainana/planning-core/model.ts'
import { openingMarker } from '../render/openingMarker.ts'
import { combine } from '../render/primitives.ts'
import type { MeshGeometry } from '../render/primitives.ts'
import { note } from './controls.ts'
/** Isolated, temporary geometry. Never alters the main scene or project assets. */
export function surfacePreview(ephemeral = false) {
  const createCanvas = () => h('canvas', { width: 600, height: 400, class: 'surface-preview-canvas', ariaLabel: 'Live surface preparation preview' })
  let canvas = createCanvas()
  const message = note('Choose a source and adjust its controls to generate a live preview.')
  const viewport = h('div', { class: 'surface-preview-viewport' }, [canvas])
  const element = h('div', { class: 'surface-live-preview' }, [viewport])
  let nv: Niivue | null = null, ready = false, starting = false, pending: MeshGeometry | null = null, wasConnected = false, failed = false
  let view: { azimuth: number; elevation: number; scale: number; position: Niivue['position'] } | null = null
  let reconstructedFaces: Uint8Array | undefined
  let ctOpacity: number | null = null
  let interaction: {select:(id:string)=>void;add:(point:Vec3,candidate?:OpeningCandidate)=>void;locate:(point:Vec3)=>void;rimTolerance?:()=>number}|null=null
  let detectedFor:MeshGeometry|null=null, holes:OpeningCandidate[]=[]
  const pick=(event:MouseEvent,manual:boolean)=>{
    if(!interaction||!nv||!ready||!pending)return
    const rect=canvas.getBoundingClientRect()
    if(!rect.width||!rect.height)return
    const matrix=nv.calculateMvpMatrix(null,[0,0,canvas.width,canvas.height],nv.scene.renderAzimuth,nv.scene.renderElevation)[0]
    const ray=surfaceRay(matrix,(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height)
    if(!ray)return
    const [origin,direction]=ray,hit=raySurface(pending,origin,direction)
    const tolerance=interaction.rimTolerance?.()??3
    const rim=rayRimPoint(pending,origin,direction,hit,tolerance)
    const marker=rayOpening(openings,origin,direction,rim??hit)
    if(marker){interaction?.locate([...marker.center]);interaction?.select(marker.id);return}
    if(!manual)return
    if(detectedFor!==pending&&fixedBounds){holes=detectOpenings(pending,fixedBounds,.01,.1,100);detectedFor=pending}
    const hole=rayOpening(holes,origin,direction,rim??hit)
    const matchingRim=rim??(hole?rayRimPoint(pending,origin,direction,hit,Math.max(tolerance,hole.radius)):null)
    if(hole&&matchingRim&&Math.abs(hole.center.reduce((sum,v,k)=>sum+(v-matchingRim[k])*direction[k],0))<=2*Math.max(tolerance,hole.radius))interaction?.add(hole.center,hole)
    else {
      if(rim)interaction.add(rim)
      else message.textContent="The app could not find an opening edge near this click. Try increasing the manual opening diameter or add the marker from a CT slice. No marker was added on the far side of the skull."
    }
  }
  let down:{x:number;y:number}|null=null
  const bindCanvas = () => {
    canvas.addEventListener('pointerdown',e=>{if(e.button===0)down={x:e.clientX,y:e.clientY}})
    canvas.addEventListener('pointerup',e=>{if(e.button===0&&down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<4)pick(e,false);down=null})
    canvas.addEventListener('pointercancel',()=>{down=null})
    canvas.addEventListener('contextmenu',e=>{if(!interaction)return;e.preventDefault();pick(e,true)})
  }
  bindCanvas()
  let fixedBounds: [Vec3, Vec3] | null = null
  let openings:SurfaceOpening[]=[],openingKey:string|null=null,selectedOpening:string|null=null
  const paintOpenings=()=>{
    if(!ready||!nv)return
    for(const mesh of [...nv.meshes])if(mesh.name.startsWith('Opening markers'))nv.removeMesh(mesh)
    for(const category of Object.keys(openingColors) as Array<keyof typeof openingColors>){
      const color=openingColors[category],items=openings.filter(o=>openingCategory(o,openingKey,selectedOpening)===category)
      if(!items.length)continue
      const geometry=combine(items.map(o=>openingMarker(o,fixedBounds?fixedBounds[0].map((v,k)=>(v+fixedBounds![1][k])/2) as Vec3:[0,0,0])))
      const mesh=new NVMesh(geometry.pts,geometry.tris,`Opening markers ${category}`,new Uint8Array(color),category==='selected'?.9:.65,true,nv.gl)
      if(fixedBounds)lockPreviewFrame(mesh,fixedBounds);nv.addMesh(mesh)
    }
    nv.drawScene()
  }
  const paint = () => {
    if (!ready || !nv) return
    for (const mesh of [...nv.meshes]) nv.removeMesh(mesh)
    if (pending) {
      const parts = reconstructedFaces ? [[], []] as number[][] : null
      if (parts) for (let i = 0; i < pending.tris.length; i += 3) parts[reconstructedFaces![i / 3] ? 1 : 0].push(pending.tris[i], pending.tris[i + 1], pending.tris[i + 2])
      for (let category = 0; category < (parts ? 2 : 1); category++) {
        const tris = parts ? new Uint32Array(parts[category]) : pending.tris
        if (!tris.length) continue
        const mesh = new NVMesh(pending.pts, tris, category ? 'Reconstructed boundary patches' : 'Surface preparation draft', ctOpacity !== null ? ctSurfaceColor() : new Uint8Array(category ? [255, 183, 73, 255] : [215, 221, 230, 255]), ctOpacity ?? 1, true, nv.gl)
        // Keep image bounds as the pivot/scale while threshold or patch coverage changes.
        if (fixedBounds) lockPreviewFrame(mesh, fixedBounds)
        nv.addMesh(mesh)
      }
    }
    paintOpenings()
    nv.drawScene()
  }
  const dispose = () => {
    const viewer = nv
    if (viewer && ready) view = {
      azimuth: viewer.scene.renderAzimuth, elevation: viewer.scene.renderElevation,
      scale: viewer.volScaleMultiplier, position: viewer.position ? [viewer.position[0],viewer.position[1],viewer.position[2]] : undefined,
    }
    ready = false; nv = null; starting = false; down = null
    if (!viewer) return
    disposePreview(viewer)
    // A released WebGL context remains lost on its canvas. Reopening needs a new canvas.
    const replacement = createCanvas()
    canvas.replaceWith(replacement)
    canvas = replacement
    bindCanvas()
  }
  const release = () => {
    dispose()
    pending = null; reconstructedFaces = undefined; detectedFor = null; holes = []
    openings = []; openingKey = null; selectedOpening = null; interaction = null
  }
  const resetView = () => {
    view = null
    if (nv && ready) { nv.position=undefined; nv.volScaleMultiplier=1; nv.setRenderAzimuthElevation(120,25) }
  }
  const setCTDisplay = (opacity: number | null) => {
    if (ctOpacity === opacity) return
    const changedMode = (ctOpacity === null) !== (opacity === null)
    ctOpacity = opacity
    if (!nv || !ready) return
    if (changedMode) paint()
    else {
      for (const mesh of nv.meshes) if (!mesh.name.startsWith('Opening markers')) mesh.opacity = opacity ?? 1
      nv.drawScene()
    }
  }
  const start = async () => {
    if (nv || starting || failed || !element.isConnected || !pending) return
    starting = true
    const viewer = new Niivue({ backColor: [.055, .05, .04, 1], isColorbar: false, isOrientCube: true, dragAndDropEnabled: false })
    nv = viewer
    try {
      // Match the main viewer's depth textures and pixel sampling, including transparent CT walls.
      await viewer.attachToCanvas(canvas, false)
      if (!element.isConnected || nv !== viewer) { disposePreview(viewer); return }
      installAnatomyCompositing(viewer, () => ctOpacity === null ? [] : viewer.meshes.filter(mesh => !mesh.name.startsWith('Opening markers')))
      ready = true; viewer.setSliceType(SLICE_TYPE.RENDER); paint()
      viewer.position = view?.position
      viewer.volScaleMultiplier = view?.scale ?? 1
      viewer.setRenderAzimuthElevation(view?.azimuth ?? 120, view?.elevation ?? 25)
    }
    catch (error) { if(nv===viewer){failed = true; message.textContent = `Preview graphics unavailable: ${String(error)}`;dispose()}else disposePreview(viewer) }
    finally { if(nv===viewer)starting = false }
  }
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => { if (element.isConnected) { wasConnected = true; void start() } else if (wasConnected) { wasConnected = false; failed = false; dispose(); if (ephemeral) observer.disconnect() } })
    observer.observe(document.body, { childList: true, subtree: true })
  }
  return { element, message, release, resetView, setCTDisplay, setSelectedOpening:(id:string|null)=>{selectedOpening=id;paintOpenings()}, setInteraction:(value:typeof interaction)=>{interaction=value}, setOpenings:(items:SurfaceOpening[],key:string|null)=>{openings=items;openingKey=key;paintOpenings()}, setBounds: (bounds: [Vec3, Vec3] | null) => { fixedBounds = structuredClone(bounds) }, update: (geometry: MeshGeometry | null, text: string, reconstructed?: Uint8Array) => { const changed = pending !== geometry || reconstructedFaces !== reconstructed; if (changed) failed = false; if(pending !== geometry){detectedFor=null;holes=[]} pending = geometry; reconstructedFaces = reconstructed; message.textContent = text; if (ready && changed) paint(); else if (typeof MutationObserver !== 'undefined') void start() } }
}
