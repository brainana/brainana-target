import { mat4, vec3 } from 'gl-matrix'
import type { Vec3 } from '@brainana/planning-core/model.ts'
import type { MeshGeometry } from './primitives.ts'
/** Unproject using the same camera matrix as the preview; independent of device pixel ratio. */
export function surfaceRay(matrix: mat4, x: number, y: number): [Vec3, Vec3] | null {
  const inverse=mat4.invert(mat4.create(),matrix)
  if(!inverse)return null
  const a=vec3.transformMat4(vec3.create(),[x*2-1,1-y*2,-1],inverse)
  const b=vec3.transformMat4(vec3.create(),[x*2-1,1-y*2,1],inverse)
  return [Array.from(a) as Vec3,Array.from(vec3.normalize(b,vec3.sub(b,b,a))) as Vec3]
}
export function raySurface(mesh:{pts:ArrayLike<number>;tris:ArrayLike<number>},origin:Vec3,direction:Vec3):Vec3|null{
  let nearest=Infinity
  const a=vec3.create(),b=vec3.create(),c=vec3.create(),ab=vec3.create(),ac=vec3.create(),p=vec3.create(),s=vec3.create(),q=vec3.create()
  for(let i=0;i<mesh.tris.length;i+=3){
    for(let k=0;k<3;k++){a[k]=mesh.pts[mesh.tris[i]*3+k];b[k]=mesh.pts[mesh.tris[i+1]*3+k];c[k]=mesh.pts[mesh.tris[i+2]*3+k]}
    vec3.sub(ab,b,a);vec3.sub(ac,c,a);vec3.cross(p,direction,ac)
    const det=vec3.dot(ab,p);if(Math.abs(det)<1e-8)continue
    vec3.sub(s,origin,a);const u=vec3.dot(s,p)/det;if(u<0||u>1)continue
    vec3.cross(q,s,ab);const v=vec3.dot(direction,q)/det;if(v<0||u+v>1)continue
    const t=vec3.dot(ac,q)/det;if(t>=0&&t<nearest)nearest=t
  }
  return Number.isFinite(nearest)?origin.map((v,k)=>v+nearest*direction[k]) as Vec3:null
}
/** Pick opening volumes in front of the first bone hit, including empty hole centres. */
export function rayOpening<T extends {center:Vec3;radius:number}>(items:T[],origin:Vec3,direction:Vec3,hit:Vec3|null):T|null{
  const limit=hit?Math.hypot(...hit.map((v,k)=>v-origin[k])):Infinity
  let selected:T|null=null,best=Infinity
  for(const item of items){const delta=item.center.map((v,k)=>v-origin[k]),t=delta.reduce((n,v,k)=>n+v*direction[k],0)
    if(t<0||t>limit+item.radius)continue
    const distance=Math.hypot(...delta.map((v,k)=>v-t*direction[k]))
    if(distance<=item.radius&&t<best){selected=item;best=t}
  }
  return selected
}
const rimEdges = new WeakMap<MeshGeometry, Array<{a:number;b:number;normal:Vec3}>>()
/** Anchor a manual click to a nearby boundary, not the opposite wall behind a hole.
 * The point stays on the click ray at the closest rim depth; no bone is filled.
 */
export function rayRimPoint(mesh:MeshGeometry,origin:Vec3,direction:Vec3,hit:Vec3|null,tolerance=3):Vec3|null{
  let boundary=rimEdges.get(mesh)
  if(!boundary){
  const edges=new Map<number,{a:number;b:number;normal:Vec3;count:number}>(),vertices=mesh.pts.length/3
  for(let i=0;i<mesh.tris.length;i+=3)for(let j=0;j<3;j++){
    const a=mesh.tris[i+j],b=mesh.tris[i+(j+1)%3],key=Math.min(a,b)*vertices+Math.max(a,b),edge=edges.get(key)
    if(edge)edge.count++;else {
      const c=mesh.tris[i+(j+2)%3],u=[0,1,2].map(k=>mesh.pts[b*3+k]-mesh.pts[a*3+k]),v=[0,1,2].map(k=>mesh.pts[c*3+k]-mesh.pts[a*3+k])
      edges.set(key,{a,b,count:1,normal:[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]})
    }
  }
  boundary=Array.from(edges.values()).filter(e=>e.count===1);rimEdges.set(mesh,boundary)
  }
  const limit=hit?Math.hypot(...hit.map((v,k)=>v-origin[k])):Infinity
  let best=Infinity,distance=Infinity
  for(const edge of boundary){
    if(edge.normal.reduce((sum,v,k)=>sum+v*direction[k],0)>=0)continue
    const a=[0,1,2].map(k=>mesh.pts[edge.a*3+k]-origin[k]),b=[0,1,2].map(k=>mesh.pts[edge.b*3+k]-mesh.pts[edge.a*3+k])
    const da=a.reduce((s,v,k)=>s+v*direction[k],0),db=b.reduce((s,v,k)=>s+v*direction[k],0)
    const perpendicular=a.map((v,k)=>v-da*direction[k]),tangent=b.map((v,k)=>v-db*direction[k])
    const length=tangent.reduce((s,v)=>s+v*v,0),u=length?Math.max(0,Math.min(1,-perpendicular.reduce((s,v,k)=>s+v*tangent[k],0)/length)):0
    const t=da+u*db,d=Math.hypot(...perpendicular.map((v,k)=>v+u*tangent[k]))
    if(t<0||t>limit+tolerance||d>tolerance)continue
    // Prefer the frontmost rim, then closest edge within the same surface layer.
    if(t<best-tolerance||(Math.abs(t-best)<=tolerance&&d<distance)){best=t;distance=d}
  }
  return Number.isFinite(best)?origin.map((v,k)=>v+best*direction[k]) as Vec3:null
}
