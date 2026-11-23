import {geometryIdentity} from '../render/avoidanceKey.ts'
import type {Project} from '@brainana/planning-core/model.ts'
/** A preview belongs to planning geometry, not to the currently selected sidebar tab. */
export function placementInputs(project:Project):string{
 return JSON.stringify([project.id,project.planningIntent,project.frame,project.headposts?.map(({mesh,...h})=>[h,geometryIdentity(mesh)]),project.chambers,project.grids,project.electrodes,project.targets.map(({region,...t})=>[t,region?.kind==='voxels'?geometryIdentity(region):region]),project.avoidRegions?.map(({surfacePatch,...r})=>[r,geometryIdentity(surfacePatch)]),project.surfaceOpenings?.map(({patch,...o})=>[o,geometryIdentity(patch)]),project.planning,project.planningSurfaceIds,project.assets.map(a=>[a.id,a.sha256,a.role,a.surfaceKind,a.imageDisplay?.skull&&{...a.imageDisplay.skull,show:undefined,opacity:undefined}])])
}
export class PlacementPreviewState{
 #key=''
 #project:Project|null=null
 begin(base:Project|null,preview:Project|null):Project|null{
  this.#key=base&&preview?placementInputs(base):'';this.#project=preview;return preview
 }
 synchronize(base:Project|null):Project|null{
  if(!base||!this.#project||placementInputs(base)!==this.#key){this.clear();return null}
  // Display-only edits and project naming are kept without reverting the previewed hardware.
  this.#project={...base,chambers:this.#project.chambers,grids:this.#project.grids,electrodes:this.#project.electrodes}
  return this.#project
 }
 clear():void{this.#key='';this.#project=null}
}
