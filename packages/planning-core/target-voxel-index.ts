import type {Vec3,Target} from './model.ts'
import {dot,cross,sub} from './geometry.ts'
type Region=Extract<NonNullable<Target['region']>,{kind:'voxels'}>
type Box={lo:Vec3;hi:Vec3;children?:Box[]}
export const inverseVoxelBasis=(axes:[Vec3,Vec3,Vec3]):[Vec3,Vec3,Vec3]=>{
 const det=dot(axes[0],cross(axes[1],axes[2]));return [cross(axes[1],axes[2]),cross(axes[2],axes[0]),cross(axes[0],axes[1])].map(row=>row.map(v=>v/det) as Vec3) as [Vec3,Vec3,Vec3]
}
export const applyBasis=(rows:[Vec3,Vec3,Vec3],v:Vec3):Vec3=>rows.map(row=>dot(row,v)) as Vec3
function tree(boxes:Box[]):Box{
 const lo=[0,1,2].map(k=>Math.min(...boxes.map(b=>b.lo[k]))) as Vec3,hi=[0,1,2].map(k=>Math.max(...boxes.map(b=>b.hi[k]))) as Vec3
 if(boxes.length<=8)return {lo,hi,children:boxes}
 const axis=[0,1,2].sort((a,b)=>(hi[b]-lo[b])-(hi[a]-lo[a]))[0];boxes.sort((a,b)=>a.lo[axis]-b.lo[axis]);const half=Math.floor(boxes.length/2)
 return {lo,hi,children:[tree(boxes.slice(0,half)),tree(boxes.slice(half))]}
}
const cache=new WeakMap<Region,{rows:[Vec3,Vec3,Vec3];origin:Vec3;tree:Box}>()
/** Spatial index built once per target recipe, shared by all grid-hole / placement tests. */
export function voxelRayDepth(region:Region,entry:Vec3,direction:Vec3,minimum:number,maximum:number,preferred:number):number|null{
 let index=cache.get(region)
 if(!index){const rows=inverseVoxelBasis(region.axes),origin=region.centers[0];index={rows,origin,tree:tree(region.centers.map(center=>{const p=applyBasis(rows,sub(center,origin));return {lo:p.map(v=>v-.5) as Vec3,hi:p.map(v=>v+.5) as Vec3}}))};cache.set(region,index)}
 const position=applyBasis(index.rows,sub(entry,index.origin)),velocity=applyBasis(index.rows,direction)
 let best:number|null=null,distance=Infinity
 const visit=(node:Box)=>{
  let lo=minimum,hi=maximum
  for(let k=0;k<3;k++){if(Math.abs(velocity[k])<1e-12){if(position[k]<node.lo[k]||position[k]>node.hi[k])return}else{const a=(node.lo[k]-position[k])/velocity[k],b=(node.hi[k]-position[k])/velocity[k];lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi+1e-8)return}}
  const depth=Math.max(lo,Math.min(hi,preferred));if(Math.abs(depth-preferred)>=distance)return
  if(node.children){for(const child of node.children)visit(child)}else{best=depth;distance=Math.abs(depth-preferred)}
 }
 visit(index.tree);return best
}
