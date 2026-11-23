import type { SurfaceOpening,Vec3 } from '@brainana/planning-core/model.ts'
import {planeBasis} from './openingGeometry.ts'
import type {MeshGeometry} from './primitives.ts'
/** Display annotation only. Never modifies the finalized skull mesh. */
export function openingMarker(opening:SurfaceOpening,reference:Vec3):MeshGeometry{
  let pts:Float32Array,tris:number[]=[]
  if(opening.patch?.pts.length){pts=new Float32Array(opening.patch.pts);tris=[...opening.patch.tris]}
  else{
    let normal=opening.normal??opening.center.map((v,k)=>v-reference[k]) as Vec3
    const length=Math.hypot(...normal);normal=length?normal.map(v=>v/length) as Vec3:[0,0,1]
    const [u,v]=planeBasis(normal),points=[...opening.center],r=opening.radius
    for(let i=0;i<48;i++){const a=i*Math.PI/24;for(let k=0;k<3;k++)points.push(opening.center[k]+r*(Math.cos(a)*u[k]+Math.sin(a)*v[k]));tris.push(0,i+1,(i+1)%48+1)}
    pts=new Float32Array(points)
  }
  // Both sides remain visible when rotating; this is a colored annotation, not bone.
  const front=[...tris];for(let i=0;i<front.length;i+=3)tris.push(front[i+2],front[i+1],front[i])
  return {pts,tris:new Uint32Array(tris)}
}
