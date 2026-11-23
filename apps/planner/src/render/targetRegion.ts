import type {Target,Vec3} from '@brainana/planning-core/model.ts'
import type {Plane} from '@brainana/planning-core/reslice.ts'
import {sub,dot,cross,add,scale,length} from '@brainana/planning-core/geometry.ts'
import {inverseVoxelBasis,applyBasis} from '@brainana/planning-core/target-voxel-index.ts'
import {sphere,type MeshGeometry} from './primitives.ts'
export function targetRegionMesh(target:Target):MeshGeometry|null{
 const region=target.region;if(!region)return null
 if(region.kind==='sphere')return sphere(target.point,region.radiusMm,32,16)
 const pts:number[]=[],tris:number[]=[],key=(p:Vec3)=>p.map(n=>n.toFixed(5)).join(','),centers=new Set(region.centers.map(key))
 const corners=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]
 const faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]],neighbors:[[number,number],...[number,number][]]=[[2,-1],[2,1],[1,-1],[1,1],[0,-1],[0,1]]
 for(const center of region.centers)faces.forEach((face,f)=>{const [axis,sign]=neighbors[f];if(centers.has(key(add(center,scale(region.axes[axis],sign)))))return;const start=pts.length/3;for(const i of face)pts.push(...region.axes.reduce((p,a,k)=>add(p,scale(a,corners[i][k])),center));tris.push(start,start+1,start+2,start,start+2,start+3)})
 return {pts:new Float32Array(pts),tris:new Uint32Array(tris)}
}
/** Exact physical-plane intersection raster; works for oblique/anisotropic reference voxels. */
export function rasterTargetRegion(data:Uint8ClampedArray,w:number,h:number,plane:Plane,t:Target):void{
 const region=t.region;if(!region)return
 const normal=cross(plane.right,plane.up),sx=plane.widthMm/w,sy=plane.heightMm/h,color=[1,3,5].map(i=>parseInt(t.color.slice(i,i+2),16))
 const paint=(center:Vec3,rx:number,ry:number,rz:number,test:(delta:Vec3)=>boolean)=>{
  const delta=sub(center,plane.center),x=dot(delta,plane.right),y=dot(delta,plane.up),z=dot(delta,normal);if(Math.abs(z)>rz)return
  const left=Math.max(0,Math.floor((x-rx)/sx+w/2)),right=Math.min(w-1,Math.ceil((x+rx)/sx+w/2)),top=Math.max(0,Math.floor(h/2-(y+ry)/sy)),bottom=Math.min(h-1,Math.ceil(h/2-(y-ry)/sy))
  for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++){const p=add(scale(plane.right,(col+.5-w/2)*sx-x),add(scale(plane.up,(h/2-row-.5)*sy-y),scale(normal,-z)));if(!test(p))continue;const i=(row*w+col)*4;data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];data[i+3]=130}
 }
 if(region.kind==='sphere'){const r=region.radiusMm;paint(t.point,r,r,r,d=>length(d)<=r)}else{const inverse=inverseVoxelBasis(region.axes);const extent=(axis:Vec3)=>region.axes.reduce((sum,a)=>sum+Math.abs(dot(a,axis))/2,0);for(const center of region.centers)paint(center,extent(plane.right),extent(plane.up),extent(normal),d=>applyBasis(inverse,d).every(v=>Math.abs(v)<=.5+1e-7))}
}
const regionBounds=new WeakMap<object,[Vec3,Vec3]>()
export function targetRegionIntersectsPlane(t:Target,plane:Pick<Plane,'center'|'right'|'up'>):boolean{
 const region=t.region;if(!region)return false
 const normal=cross(plane.right,plane.up)
 if(region.kind==='sphere')return Math.abs(dot(sub(t.point,plane.center),normal))<=region.radiusMm
 let bounds=regionBounds.get(region)
 if(!bounds){const extent=[0,1,2].map(k=>region.axes.reduce((sum,a)=>sum+Math.abs(a[k])/2,0)),lo:Vec3=[Infinity,Infinity,Infinity],hi:Vec3=[-Infinity,-Infinity,-Infinity];for(const p of region.centers)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]-extent[k]);hi[k]=Math.max(hi[k],p[k]+extent[k])}bounds=[lo,hi];regionBounds.set(region,bounds)}
 const center=bounds[0].map((v,k)=>(v+bounds![1][k])/2) as Vec3,span=bounds[1].reduce((sum,v,k)=>sum+Math.abs(normal[k])*(v-bounds![0][k])/2,0)
 return Math.abs(dot(sub(center,plane.center),normal))<=span+1e-7
}
