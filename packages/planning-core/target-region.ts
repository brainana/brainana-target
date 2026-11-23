import {voxelRayDepth} from './target-voxel-index.ts'
import type {Target,Vec3,Chamber,Grid,Electrode} from './model.ts'
import {targetApproach,trajectory,sub,dot,add,scale,cross,length} from './geometry.ts'
import {minimumTargetInsertion,maximumInsertion} from './hardware.ts'
export function targetFocus(t:Target):Vec3{
 if(t.region?.kind!=='voxels')return t.point
 const centers=t.region.centers,mean=centers.reduce((sum,p)=>add(sum,scale(p,1/centers.length)),[0,0,0] as Vec3)
 return centers.reduce((best,p)=>length(sub(p,mean))<length(sub(best,mean))?p:best,centers[0])
}
export const targetTolerance=(target:Target,pointTolerance:number):number=>target.region?1e-7:pointTolerance
/** Convert a vector to the reference voxel basis, preserving oblique and anisotropic cells. */
export function voxelCoordinates(v:Vec3,axes:[Vec3,Vec3,Vec3]):Vec3{
 const det=dot(axes[0],cross(axes[1],axes[2]));return [dot(v,cross(axes[1],axes[2]))/det,dot(v,cross(axes[2],axes[0]))/det,dot(v,cross(axes[0],axes[1]))/det]
}
export function inTargetRegion(t:Target,p:Vec3):boolean{
 if(!t.region)return length(sub(p,t.point))<1e-7
 if(t.region.kind==='sphere')return length(sub(p,t.point))<=t.region.radiusMm+1e-7
 const region=t.region;return region.centers.some(center=>voxelCoordinates(sub(p,center),region.axes).every(v=>Math.abs(v)<=.5+1e-7))
}
/** Choose a reachable tip within the actual target; the display halo never participates. */
export function targetRegionApproach(c:Chamber,g:Grid,hole:[number,number],t:Target,e?:Electrode):{depth:number;miss:number}{
 const point=targetApproach(c,g,hole,t.point,e)
 if(!t.region)return point
 const path=trajectory(c,g,e?{...e,hole}:{id:'region',name:'',gridId:g.id,hole,depth:0,diameter:.1,contactCount:1,contactLength:0,contactSpacing:0,color:'#ffffff',targetId:null}),lo=e?minimumTargetInsertion(e):0,hi=e?maximumInsertion(e):1000
 const preferred=point.depth,entry=path.entry,direction=path.direction
 let best:{depth:number;miss:number}|null=null
 const accept=(a:number,b:number)=>{a=Math.max(a,lo);b=Math.min(b,hi);if(a>b+1e-8)return;const depth=Math.max(a,Math.min(b,preferred));if(!best||Math.abs(depth-preferred)<Math.abs(best.depth-preferred))best={depth,miss:0}}
 if(t.region.kind==='sphere'){
  const delta=sub(t.point,entry),along=dot(delta,direction),perpendicular=length(sub(delta,scale(direction,along))),r=t.region.radiusMm
  if(perpendicular<=r){const span=Math.sqrt(Math.max(0,r*r-perpendicular*perpendicular));accept(along-span,along+span)}
 }else{
  const depth=voxelRayDepth(t.region,entry,direction,lo,hi,preferred)
  if(depth!==null)best={depth,miss:0}
 }
 return best??{depth:Math.max(lo,Math.min(hi,preferred)),miss:Infinity}
}
export function regionTip(c:Chamber,g:Grid,e:Electrode,t:Target):Vec3{const a=targetRegionApproach(c,g,e.hole,t,e),path=trajectory(c,g,e);return add(path.entry,scale(path.direction,a.depth))}
