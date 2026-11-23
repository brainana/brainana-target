import type {AvoidRegion,Vec3} from '@brainana/planning-core/model.ts'
import type {MeshGeometry} from './primitives.ts'
/** Tiny display-only outward offset avoids coincident surface depth flicker. */
export function surfacePaint(patch:NonNullable<AvoidRegion['surfacePatch']>,center:Vec3):MeshGeometry{
 const pts=new Float32Array(patch.pts),tris=new Uint32Array(patch.tris)
 for(let i=0;i<tris.length;i+=3){
  const ids=[tris[i],tris[i+1],tris[i+2]],v=ids.map(id=>[pts[id*3],pts[id*3+1],pts[id*3+2]]),a=v[1].map((n,k)=>n-v[0][k]),b=v[2].map((n,k)=>n-v[0][k]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n)||1
  const sign=n.reduce((s,x,k)=>s+x*((v[0][k]+v[1][k]+v[2][k])/3-center[k]),0)<0?-1:1
  for(const id of ids)for(let k=0;k<3;k++)pts[id*3+k]+=.03*sign*n[k]/length
 }
 return {pts,tris}
}
