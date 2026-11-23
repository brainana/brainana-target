import type {Project,Vec3} from '@brainana/planning-core/model.ts'
import {electrodeAssembly} from '@brainana/planning-core/electrode-frame.ts'
import {electrodePaths,sub,add,scale,dot,length} from '@brainana/planning-core/geometry.ts'
import {maskIsosurface} from '../render/maskIsosurface.ts'

export interface Track {start:Vec3;tip:Vec3}
export interface PlannedTrack extends Track {id:string;name:string;target?:Vec3;targetId?:string}

export function plannedTracks(project:Project):PlannedTrack[]{
 return project.electrodes.flatMap(e=>{
  const a=electrodeAssembly(project,e)
  if(!a||a.chamber.placementState==='unplaced'||e.direct?.unplaced)return []
  const target=project.targets.find(t=>t.id===e.targetId)
  return electrodePaths(a.chamber,a.grid,e,false).flatMap((p,i)=>length(sub(p.tip,p.entry))<1e-8?[]:[{
   id:`${e.id}:${i}`,name:`${e.name} · shaft ${i+1}`,start:p.entry,tip:p.tip,
   ...(target&&i===(e.hardware?.selectedShank??0)?{target:target.point,targetId:target.id}:{}),
  }])
 })
}

/** Direction is from the confirmed start toward the confirmed tip. */
export function compareTracks(plan:PlannedTrack,actual:Track){
 const p=sub(plan.tip,plan.start),a=sub(actual.tip,actual.start),pl=length(p),al=length(a)
 if(pl<1e-8||al<1e-8)throw new Error('Both paths must have distinct endpoints.')
 const u=scale(p,1/pl),v=scale(a,1/al),offset=sub(actual.tip,plan.tip),axial=dot(offset,u)
 const cosine=Math.max(-1,Math.min(1,dot(u,v)))
 return {tipErrorMm:length(offset),tipOffsetRASmm:offset,axialTipErrorMm:axial,
  lateralTipErrorMm:length(sub(offset,scale(u,axial))),directionErrorDegrees:Math.acos(cosine)*180/Math.PI,
  plannedSpanMm:pl,observedSpanMm:al,observedFitStartToPlannedReferenceMm:length(sub(actual.start,plan.start)),
  ...(plan.target?{tipToTargetPointMm:length(sub(actual.tip,plan.target))}:{})}
}

export interface MaskSource {dims:Vec3;values:ArrayLike<number>;matrix:ArrayLike<number>;slope:number;intercept:number}
const world=(m:ArrayLike<number>,x:number,y:number,z:number):Vec3=>[0,1,2].map(k=>m[k]*x+m[k+4]*y+m[k+8]*z+m[k+12]) as Vec3

// A symmetric 3×3 Jacobi solve avoids depending on an initial direction that
// can be exactly perpendicular to the actual dominant axis.
function principalAxis(cov:Float64Array):Vec3{
 const basis=new Float64Array([1,0,0,0,1,0,0,0,1])
 const pairs=[[0,1],[0,2],[1,2]]
 for(let iteration=0;iteration<40;iteration++){
  const [p,q]=pairs.reduce((a,b)=>Math.abs(cov[b[0]*3+b[1]])>Math.abs(cov[a[0]*3+a[1]])?b:a)
  const off=cov[p*3+q],a=cov[p*4],b=cov[q*4]
  if(Math.abs(off)<=1e-13*Math.max(Math.abs(cov[0]),Math.abs(cov[4]),Math.abs(cov[8])))break
  const angle=.5*Math.atan2(2*off,b-a),c=Math.cos(angle),d=Math.sin(angle)
  for(let k=0;k<3;k++){
   if(k!==p&&k!==q){
    const x=cov[k*3+p],y=cov[k*3+q]
    cov[k*3+p]=cov[p*3+k]=c*x-d*y;cov[k*3+q]=cov[q*3+k]=d*x+c*y
   }
   const x=basis[k*3+p],y=basis[k*3+q]
   basis[k*3+p]=c*x-d*y;basis[k*3+q]=d*x+c*y
  }
  cov[p*4]=c*c*a-2*c*d*off+d*d*b;cov[q*4]=d*d*a+2*c*d*off+c*c*b
  cov[p*3+q]=cov[q*3+p]=0
 }
 const [first,second]=[0,1,2].sort((a,b)=>cov[b*4]-cov[a*4])
 if(!Number.isFinite(cov[first*4])||cov[first*4]<1e-12)throw new Error('The mask has no measurable axis.')
 if(cov[first*4]-cov[second*4]<=cov[first*4]*1e-6)throw new Error('The mask has no unique long axis. Segment one electrode track and remove unrelated voxels.')
 const direction:Vec3=[basis[first],basis[3+first],basis[6+first]]
 const major=[0,1,2].reduce((a,b)=>Math.abs(direction[b])>Math.abs(direction[a])?b:a)
 return direction[major]<0?scale(direction,-1):direction
}

/** Fit all positive voxels in physical coordinates, then mesh the same cropped native lattice. */
export function fitMask(s:MaskSource){
 const [nx,ny,nz]=s.dims
 const lo=[nx,ny,nz],hi=[0,0,0],center:Vec3=[0,0,0],second=new Float64Array(9)
 let count=0
 const occupied=(i:number)=>{const value=s.values[i]*s.slope+s.intercept;return Number.isFinite(value)&&value>0}
 const visit=(fn:(x:number,y:number,z:number)=>void)=>{
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0,i=(z*ny+y)*nx;x<nx;x++,i++)if(occupied(i))fn(x,y,z)
 }
 visit((x,y,z)=>{
  const ijk=[x,y,z],p=world(s.matrix,x,y,z),delta=sub(p,center)
  if(++count>1_000_000)throw new Error('This mask is too large for an individual electrode track.')
  for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],ijk[i]);hi[i]=Math.max(hi[i],ijk[i]);center[i]+=delta[i]/count}
  const weight=(count-1)/count
  for(let i=0;i<3;i++)for(let j=i;j<3;j++){second[i*3+j]+=delta[i]*delta[j]*weight;second[j*3+i]=second[i*3+j]}
 })
 if(count<2)throw new Error('The track mask needs at least two positive voxels.')
 const axis=principalAxis(second)
 let min=Infinity,max=-Infinity,residual=0
 const dims=hi.map((n,i)=>n-lo[i]+1),n=dims.reduce((a,b)=>a*b,1)
 if(n>16_000_000)throw new Error('The mask spans too large a region. Crop to one electrode and remove stray islands.')
 const cropped=new Uint8Array(n)
 for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
  if(!occupied((z*ny+y)*nx+x))continue
  const p=sub(world(s.matrix,x,y,z),center),t=dot(p,axis)
  min=Math.min(min,t);max=Math.max(max,t);residual+=Math.max(0,dot(p,p)-t*t)
  cropped[(x-lo[0])+dims[0]*((y-lo[1])+dims[1]*(z-lo[2]))]=1
 }
 if(max-min<1e-6)throw new Error('The mask has no measurable length.')
 // Isosurface samples at lattice-cell centers. Transform every vertex with the full voxel affine.
 const mesh=maskIsosurface(cropped,dims,[-.5,-.5,-.5],dims.map(d=>d-.5) as Vec3,1)
 for(let i=0;i<mesh.pts.length;i+=3)mesh.pts.set(world(s.matrix,mesh.pts[i]+lo[0],mesh.pts[i+1]+lo[1],mesh.pts[i+2]+lo[2]),i)
 const m=s.matrix,det=m[0]*(m[5]*m[10]-m[6]*m[9])-m[4]*(m[1]*m[10]-m[2]*m[9])+m[8]*(m[1]*m[6]-m[2]*m[5])
 if(det<0)for(let i=0;i<mesh.tris.length;i+=3)[mesh.tris[i+1],mesh.tris[i+2]]=[mesh.tris[i+2],mesh.tris[i+1]]
 return {start:add(center,scale(axis,min)),tip:add(center,scale(axis,max)),center,count,rmsMm:Math.sqrt(residual/count),mesh}
}

export function cortexDistance(point:Vec3,pts:ArrayLike<number>,tris:ArrayLike<number>,closest:(p:Vec3,a:Vec3,b:Vec3,c:Vec3)=>Vec3){
 let nearest:Vec3|undefined,min=Infinity
 for(let i=0;i<tris.length;i+=3){
  const vertex=(j:number):Vec3=>{const k=tris[i+j]*3;return [pts[k],pts[k+1],pts[k+2]]}
  const q=closest(point,vertex(0),vertex(1),vertex(2)),d=sub(q,point),distance=dot(d,d)
  if(distance<min){nearest=q;min=distance}
 }
 return nearest?{point:nearest,distanceMm:Math.sqrt(min)}:null
}

/** Find the longest in-mask section of a shaft. This is display geometry only. */
export function clipTrackToMask(track:Track,sample:(p:Vec3)=>number,stepMm:number):Track|null{
 const delta=sub(track.tip,track.start),steps=Math.max(1,Math.min(100000,Math.ceil(length(delta)/stepMm)))
 const at=(i:number)=>add(track.start,scale(delta,i/steps))
 let start=-1,bestStart=0,bestEnd=0
 for(let i=0;i<=steps+1;i++){
  const value=i<=steps?sample(at(i)):NaN
  if(Number.isFinite(value)&&value>0){if(start<0)start=i}
  else if(start>=0){if(i-1-start>bestEnd-bestStart){bestStart=start;bestEnd=i-1}start=-1}
 }
 return bestEnd>bestStart?{start:at(bestStart),tip:at(bestEnd)}:null
}

/** FreeSurfer's current big-endian morphometry format; one scalar per vertex. */
export function readMorphometry(bytes:Uint8Array):Float32Array{
 if(bytes.length<15||bytes[0]!==255||bytes[1]!==255||bytes[2]!==255)throw new Error('Expected a FreeSurfer curvature or sulcal depth file.')
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=view.getInt32(3)
 if(n<1||view.getInt32(11)!==1||bytes.length!==15+4*n)throw new Error('Invalid surface metric vertex count.')
 return Float32Array.from({length:n},(_,i)=>view.getFloat32(15+i*4))
}
