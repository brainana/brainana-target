import type {Vec3} from '@brainana/planning-core/model.ts'
import type {TriangleSurface} from '@brainana/planning-core/surface-fit.ts'
import {SurfaceRayIndex} from '@brainana/planning-core/surface-rays.ts'
import {normalize} from '@brainana/planning-core/geometry.ts'
let cached: {surfaces:TriangleSurface[];index:SurfaceRayIndex}|undefined
/** Project dense independent stamps along the slice normal, bounded to nearby surface only. */
export function snapAvoidance(points:Vec3[],fill:Vec3[],radius:number,surfaces:TriangleSurface[],sliceNormal:Vec3):Vec3[]{
 if(!surfaces.length)throw new Error('Finalize a planning surface before using surface-snapped drawing.')
 if(!cached||surfaces.length!==cached.surfaces.length||surfaces.some((s,i)=>s.pts!==cached!.surfaces[i]?.pts||s.tris!==cached!.surfaces[i]?.tris))cached={surfaces,index:new SurfaceRayIndex(surfaces)}
 const index=cached.index,normal=normalize(sliceNormal),opposite=normal.map(v=>-v) as Vec3,samples:Vec3[]=[]
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[Math.min(i+1,points.length-1)],count=Math.max(1,Math.ceil(Math.hypot(...a.map((v,k)=>v-b[k]))/Math.max(.05,radius*.5)))
  if(samples.length+count+fill.length>16000)throw new Error('Surface stroke is too large. Use a larger brush or shorter strokes.')
  for(let j=0;j<count;j++)samples.push(a.map((v,k)=>v+(b[k]-v)*j/count) as Vec3)
 }
 const projected:Vec3[]=[]
 for(const point of [...samples,...fill]){
  const a=index.distance(point,normal,radius*2),b=index.distance(point,opposite,radius*2),distance=Math.min(a,b)
  if(!Number.isFinite(distance))continue
  const direction=a<=b?normal:opposite
  projected.push(point.map((v,k)=>v+distance*direction[k]) as Vec3)
 }
 if(!projected.length)throw new Error('No planning surface lies within twice the brush radius of this stroke. Move to slices near the surface.')
 return projected
}
