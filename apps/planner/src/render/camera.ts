import { MULTIPLANAR_TYPE, SLICE_TYPE, type Niivue } from '@niivue/niivue'
import type { Vec3 } from '@brainana/planning-core/model.ts'
export interface CameraState {
  pivot3D: number[]
  furthestFromPivot: number
  position?: ArrayLike<number>
  scene: {volScaleMultiplier:number}
}
/** Keep anatomy framing independent of the physical length of added implants. */
export function frameBounds(camera: CameraState, bounds: [Vec3,Vec3]): void {
  camera.pivot3D=bounds[0].map((v,k)=>(v+bounds[1][k])/2)
  camera.furthestFromPivot=Math.max(1,Math.hypot(...bounds[1].map((v,k)=>v-bounds[0][k]))/2)
}
/** Screen-relative translation: NiiVue mirrors model X before camera translation. */
export function panCamera(camera:CameraState,right:number,up:number): Vec3 {
  const zoom=camera.scene.volScaleMultiplier
  const step=.12*.8*camera.furthestFromPivot/(Number.isFinite(zoom)&&zoom>0?zoom:1)
  return [(camera.position?.[0]??0)-right*step,(camera.position?.[1]??0)+up*step,0]
}

/** 3D setups may be much larger than their anatomical reference image. */
export function zoomRender(viewer:Niivue,factor:number):void {
 const next=viewer.scene.volScaleMultiplier*factor
 if(Number.isFinite(next)&&next>0)viewer.setScale(next)
}

/** Retain native clip-plane scrolling, without NiiVue's anatomy-sized zoom limits. */
export function installRenderZoom(viewer:Niivue):void {
 const nativeScroll=viewer.sliceScroll3D.bind(viewer)
 viewer.sliceScroll3D=(change=0)=>{
  const clip=viewer.scene.clipPlaneDepthAziElevs[viewer.uiData.activeClipPlaneIndex]
  if(viewer.volumes.length&&clip&&clip[0]<1.8){nativeScroll(change);return}
  if(change)zoomRender(viewer,change>0?1.1:.9)
 }
}

/** Keep the chosen crosshair at the same screen location while changing 2D scale. */
export function anchoredSliceZoom(pan:ArrayLike<number>,crosshair:ArrayLike<number>,factor:number|null):[number,number,number,number]{
 if(factor===null)return [0,0,0,1]
 const zoom=Math.max(.25,Math.min(8,pan[3]*factor)),delta=pan[3]-zoom
 return [pan[0]+delta*crosshair[0],pan[1]+delta*crosshair[1],pan[2]+delta*crosshair[2],zoom]
}

export const cardinalLayouts = [
  { value: 'column', label: '3 slices · column' },
  { value: 'row', label: '3 slices · row' },
  { value: 'cardinal', label: '3 slices · grid' },
  { value: 'axial', label: 'Axial only' },
  { value: 'coronal', label: 'Coronal only' },
  { value: 'sagittal', label: 'Sagittal only' },
] as const

export function applySliceLayout(viewer: Niivue, mode: string): void {
  const plane = mode === 'axial' ? SLICE_TYPE.AXIAL : mode === 'coronal' ? SLICE_TYPE.CORONAL : mode === 'sagittal' ? SLICE_TYPE.SAGITTAL : SLICE_TYPE.MULTIPLANAR
  if (plane === SLICE_TYPE.MULTIPLANAR) {
    viewer.setMultiplanarLayout(mode === 'row' ? MULTIPLANAR_TYPE.ROW : mode === 'column' ? MULTIPLANAR_TYPE.COLUMN : MULTIPLANAR_TYPE.GRID)
  }
  viewer.setSliceType(plane)
}
