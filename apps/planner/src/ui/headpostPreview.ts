import type { Headpost } from '@brainana/planning-core/model.ts'
import { headpostGeometry } from '../render/headpostGeometry.ts'
import { headpostBounds } from '@brainana/planning-core/headposts.ts'
import { surfacePreview } from './surfacePreview.ts'
/** Local hardware geometry only: editing a draft never places it in the anatomical scene. */
export function headpostPreview() {
  const viewer=surfacePreview(true)
  viewer.element.classList.add('headpost-preview')
  viewer.element.querySelector('canvas')!.ariaLabel='Rotatable 3D headpost preview'
  viewer.element.append(viewer.message)
  let last:Headpost['mesh']|undefined,key=''
  return {element:viewer.element,update:(post:Headpost|null, warning?:string)=>{
    if(!post){key='';last=undefined;viewer.update(null,'Enter all measured dimensions, or import the headpost model, to see its rotatable 3D preview.');return}
    const signature=JSON.stringify([post.reference,warning,post.postDiameter,post.postHeight,post.baseDiameter,post.baseThickness])
    if(signature===key&&post.mesh===last)return
    key=signature;last=post.mesh
    const local={...post,pose:{origin:[0,0,0] as [number,number,number],angles:[0,0,0] as [number,number,number]}}
    viewer.setBounds(headpostBounds(local))
    viewer.update(headpostGeometry(local),warning??(post.mesh?'Imported headpost model. Drag to rotate; scroll to zoom. Placement coordinates do not change this dimensions preview.':'Headpost and baseplate preview. Drag to rotate or scroll to zoom.'))
  }}
}
