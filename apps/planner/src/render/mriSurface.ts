import { corticalEnvelope } from './corticalEnvelope.ts'
import {estimateBrainRegion} from './mriBrainRegion.ts'
import {mriDarkBand,type ScalarImage,type DarkBandReport} from './mriDarkBand.ts'
import type {Asset,Vec3} from '@brainana/planning-core/model.ts'
import {maskIsosurface} from './maskIsosurface.ts'
import {smoothSurface} from './smoothSurface.ts'
import {applySurfaceBrush} from './surfaceBrush.ts'
export type MRISurfaceSettings=NonNullable<Asset['mriSurface']>
/** Exact squared Euclidean distance transform on an isotropic, physical-mm lattice. */
export function distanceTransform(mask:Uint8Array,dims:number[],feature:0|1):Float32Array {
 const result=new Float32Array(mask.length),limit=1e15
 for(let i=0;i<mask.length;i++)result[i]=mask[i]===feature?0:limit
 const longest=Math.max(...dims),f=new Float64Array(longest),d=new Float64Array(longest),v=new Int32Array(longest),z=new Float64Array(longest+1)
 for(let axis=0;axis<3;axis++){
  const axes=[0,1,2].filter(k=>k!==axis),n=dims[axis],stride=[1,dims[0],dims[0]*dims[1]],s=stride[axis]
  for(let b=0;b<dims[axes[1]];b++)for(let a=0;a<dims[axes[0]];a++){
   const base=a*stride[axes[0]]+b*stride[axes[1]]
   for(let q=0;q<n;q++)f[q]=result[base+q*s]
   let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity
   for(let q=1;q<n;q++){
    let intersection=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*(q-v[k]))
    while(k>0&&intersection<=z[k]){k--;intersection=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*(q-v[k]))}
    k++;v[k]=q;z[k]=intersection;z[k+1]=Infinity
   }
   k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;d[q]=(q-v[k])**2+f[v[k]];result[base+q*s]=d[q]}
  }
 }
 return result
}
function neighbors(i:number,d:number[],visit:(n:number)=>void):void {
 const x=i%d[0],y=Math.floor(i/d[0])%d[1],z=Math.floor(i/(d[0]*d[1]))
 if(x)visit(i-1);if(x+1<d[0])visit(i+1);if(y)visit(i-d[0]);if(y+1<d[1])visit(i+d[0]);if(z)visit(i-d[0]*d[1]);if(z+1<d[2])visit(i+d[0]*d[1])
}
export function cleanMask(mask:Uint8Array,dims:number[],largest:boolean,fillHoles:boolean):void {
 const queue=new Int32Array(mask.length),seen=new Uint8Array(mask.length)
 if(largest){let best=0,bestSeed=-1
  for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){let head=0,tail=1;queue[0]=i;seen[i]=1;while(head<tail)neighbors(queue[head++],dims,n=>{if(mask[n]&&!seen[n]){seen[n]=1;queue[tail++]=n}});if(tail>best){best=tail;bestSeed=i}}
  seen.fill(0);if(bestSeed>=0){let head=0,tail=1;queue[0]=bestSeed;seen[bestSeed]=1;while(head<tail)neighbors(queue[head++],dims,n=>{if(mask[n]&&!seen[n]){seen[n]=1;queue[tail++]=n}})}
  for(let i=0;i<mask.length;i++)mask[i]=seen[i]
 }
 if(fillHoles){seen.fill(0);let head=0,tail=0;const [nx,ny,nz]=dims
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)if(!x||!y||!z||x===nx-1||y===ny-1||z===nz-1){const i=x+y*nx+z*nx*ny;if(!mask[i]&&!seen[i]){seen[i]=1;queue[tail++]=i}}
  while(head<tail)neighbors(queue[head++],dims,n=>{if(!mask[n]&&!seen[n]){seen[n]=1;queue[tail++]=n}})
  for(let i=0;i<mask.length;i++)if(!mask[i]&&!seen[i])mask[i]=1
 }
}
export function mriSurface(volume:{sample:(p:Vec3,nearest?:boolean)=>number},settings:MRISurfaceSettings,brain?:ScalarImage){
 if(settings.brainEstimate){brain=estimateBrainRegion(volume,settings);if(settings.method==='brain-dilate'||settings.method==='brain-envelope')volume=brain}
 if(settings.method==='dark-band-head')return mriDarkBand(volume,undefined,settings)
 if(settings.method==='dark-band'){if(!brain)throw Error('Load an aligned brain-only mask to locate the dark band beneath the scalp.');return mriDarkBand(volume,brain,settings)}
 const {bounds:[lo,hi],spacingMm:step,offsetMm,method,threshold}=settings
 if(!Number.isFinite(step)||step<.05||step>20||!Number.isFinite(offsetMm)||offsetMm<0||offsetMm>30||!Number.isFinite(threshold)||![...lo,...hi].every(Number.isFinite)||hi.some((v,k)=>v<=lo[k]))throw Error('Invalid MRI surface settings.')
 const dims=lo.map((v,k)=>Math.ceil((hi[k]-v)/step)),count=dims.reduce((a,b)=>a*b,1)
 if(count>24000000)throw Error('MRI surface needs more than 24 million samples. Crop more tightly or choose coarser detail. The app will not silently downsample.')
 const mask=new Uint8Array(count),point:Vec3=[0,0,0]
 for(let z=0;z<dims[2];z++)for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++){
  point[0]=lo[0]+x*step+Math.min(step,hi[0]-lo[0]-x*step)/2
  point[1]=lo[1]+y*step+Math.min(step,hi[1]-lo[1]-y*step)/2
  point[2]=lo[2]+z*step+Math.min(step,hi[2]-lo[2]-z*step)/2
  const value=volume.sample(point,true)
  if(Number.isFinite(value)&&value>=(settings.brainEstimate ? .5 : threshold))mask[x+y*dims[0]+z*dims[0]*dims[1]]=1
 }
 if(!mask.some(Boolean))throw Error('The mask is empty in this crop. Check mask alignment and the foreground threshold.')
 cleanMask(mask,dims,settings.largest,settings.fillHoles)
 if(offsetMm>0&&method!=='brain-envelope'){
  const expand=method==='brain-dilate',distance=distanceTransform(mask,dims,expand?1:0),radius=(offsetMm/step)**2
  for(let i=0;i<count;i++){const x=i%dims[0],y=Math.floor(i/dims[0])%dims[1],z=Math.floor(i/(dims[0]*dims[1]));const squared=expand?distance[i]:Math.min(distance[i],(x+1)**2,(dims[0]-x)**2,(y+1)**2,(dims[1]-y)**2,(z+1)**2,(dims[2]-z)**2);mask[i]=expand?Number(squared<=radius):Number(!!mask[i]&&squared>radius)}
 }
 if(settings.edits?.length)applySurfaceBrush(mask,dims,lo,hi,step,settings.edits)
 if(!mask.some(Boolean))throw Error('No surface remains. Reduce the inward offset or restore erased areas.')
 const raw=maskIsosurface(mask,dims,lo,hi,step),triangles:number[]=[]
 // Open crop boundaries must never become artificial mounting supports.
 let croppedFaces=0
 for(let i=0;i<raw.tris.length;i+=3){const face=raw.tris.subarray(i,i+3);if([0,1,2].some(k=>Array.from(face).every(v=>raw.pts[v*3+k]<lo[k]+step*.51)||Array.from(face).every(v=>raw.pts[v*3+k]>hi[k]-step*.51))){croppedFaces++;continue}triangles.push(...face)}
 const mesh={pts:raw.pts,tris:new Uint32Array(triangles)}
 if(method==='brain-envelope'){
  if(croppedFaces)throw Error('The brain region touches a crop edge. Enlarge the crop to include the full region before building its envelope.')
  const envelope = corticalEnvelope([mesh], offsetMm)
  return {...envelope,reconstructedFaces:new Uint8Array(envelope.tris.length/3).fill(1),report:{samples:count,croppedFaces,spacingMm:step,darkBand:undefined as DarkBandReport|undefined}}
 }
 if(!mesh.tris.length)throw Error('No usable surface remains away from the crop boundary.')
 return {...(settings.smooth?smoothSurface(mesh,lo,hi,step):mesh),reconstructedFaces:undefined as Uint8Array|undefined,report:{samples:count,croppedFaces,spacingMm:step,darkBand:undefined as DarkBandReport|undefined}}
}
