import type {Vec3,AvoidRegion} from './model.ts'
import type {TriangleSurface} from './surface-fit.ts'
import {segmentTriangleDistance} from './wall-mesh.ts'
/** Paint only the actual surface triangles. Subdivide boundary triangles for brush precision. */
export function surfacePatch(surfaces:TriangleSurface[],centers:Vec3[],radius:number):NonNullable<AvoidRegion['surfacePatch']>{
 const pts:number[]=[],tris:number[]=[],r2=radius*radius
 const bins=new Map<string,Vec3[]>(),cell=Math.max(radius,.1),key=(x:number,y:number,z:number)=>`${x},${y},${z}`
 for(const p of centers){const k=key(...p.map(v=>Math.floor(v/cell)) as Vec3);const list=bins.get(k)??[];list.push(p);bins.set(k,list)}
 const nearby=(a:Vec3,b:Vec3,c:Vec3)=>{
  const lo=a.map((v,k)=>Math.floor((Math.min(v,b[k],c[k])-radius)/cell)),hi=a.map((v,k)=>Math.floor((Math.max(v,b[k],c[k])+radius)/cell)),items:Vec3[]=[]
  if(hi.reduce((n,v,k)=>n*(v-lo[k]+1),1)>10000)return centers
  for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++)items.push(...(bins.get(key(x,y,z))??[]))
  return items
 }
 const inside=(p:Vec3)=>centers.some(c=>p.reduce((s,v,k)=>s+(v-c[k])**2,0)<=r2)
 const mid=(a:Vec3,b:Vec3)=>a.map((v,k)=>(v+b[k])/2) as Vec3
 const visit=(a:Vec3,b:Vec3,c:Vec3,depth:number)=>{
  if(!nearby(a,b,c).some(p=>segmentTriangleDistance(p,p,a,b,c)<=radius))return
  const flags=[inside(a),inside(b),inside(c)]
  if(!flags.every(Boolean)&&depth<5&&Math.max(Math.hypot(...a.map((v,k)=>v-b[k])),Math.hypot(...b.map((v,k)=>v-c[k])),Math.hypot(...c.map((v,k)=>v-a[k])))>Math.max(.15,radius/8)){
   const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);visit(a,ab,ca,depth+1);visit(ab,b,bc,depth+1);visit(ca,bc,c,depth+1);visit(ab,bc,ca,depth+1);return
  }
  if(!inside(a.map((v,k)=>(v+b[k]+c[k])/3) as Vec3))return
  const i=pts.length/3;pts.push(...a,...b,...c);tris.push(i,i+1,i+2)
  if(tris.length>600000)throw new Error('Surface brush region is too large. Use smaller strokes.')
 }
 const lo=[0,1,2].map(k=>Math.min(...centers.map(p=>p[k]))-radius),hi=[0,1,2].map(k=>Math.max(...centers.map(p=>p[k]))+radius)
 for(const s of surfaces)for(let i=0;i<s.tris.length;i+=3){
  const ia=s.tris[i]*3,ib=s.tris[i+1]*3,ic=s.tris[i+2]*3
  if([0,1,2].some(k=>Math.min(s.pts[ia+k],s.pts[ib+k],s.pts[ic+k])>hi[k]||Math.max(s.pts[ia+k],s.pts[ib+k],s.pts[ic+k])<lo[k]))continue
  const v=(j:number)=>[s.pts[s.tris[i+j]*3],s.pts[s.tris[i+j]*3+1],s.pts[s.tris[i+j]*3+2]] as Vec3;visit(v(0),v(1),v(2),0)}
 if(!tris.length)throw new Error('No planning surface is covered by this brush stroke.')
 return {pts,tris}
}
interface Node {lo:Vec3;hi:Vec3;faces?:[Vec3,Vec3,Vec3][];children?:Node[]}
const trees=new WeakMap<NonNullable<AvoidRegion['surfacePatch']>,Node>()
/** Cached spatial hierarchy for repeated trajectory queries against a painted patch. */
export function patchDistance(patch:NonNullable<AvoidRegion['surfacePatch']>,a:Vec3,b:Vec3):number{
 let tree=trees.get(patch)
 if(!tree){
  const faces:[Vec3,Vec3,Vec3][]=[]
  for(let i=0;i<patch.tris.length;i+=3)faces.push([0,1,2].map(j=>[0,1,2].map(k=>patch.pts[patch.tris[i+j]*3+k]) as Vec3) as [Vec3,Vec3,Vec3])
  const build=(faces:[Vec3,Vec3,Vec3][]):Node=>{
   const lo:Vec3=[Infinity,Infinity,Infinity],hi:Vec3=[-Infinity,-Infinity,-Infinity]
   for(const face of faces)for(const p of face)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k])}
   if(faces.length<=12)return {lo,hi,faces}
   const axis=[0,1,2].sort((a,b)=>(hi[b]-lo[b])-(hi[a]-lo[a]))[0]
   faces.sort((a,b)=>a.reduce((s,v)=>s+v[axis],0)-b.reduce((s,v)=>s+v[axis],0));const split=faces.length>>1
   return {lo,hi,children:[build(faces.slice(0,split)),build(faces.slice(split))]}
  }
  tree=build(faces);trees.set(patch,tree)
 }
 let distance=Infinity
 const lower=(node:Node)=>Math.hypot(...node.lo.map((v,k)=>Math.max(0,v-Math.max(a[k],b[k]),Math.min(a[k],b[k])-node.hi[k])))
 const visit=(node:Node)=>{
  if(distance===0||lower(node)>=distance)return
  if(node.faces)for(const face of node.faces){distance=Math.min(distance,segmentTriangleDistance(a,b,...face));if(distance===0)return}
  else for(const child of [...node.children!].sort((a,b)=>lower(a)-lower(b)))visit(child)
 }
 visit(tree);return distance
}
