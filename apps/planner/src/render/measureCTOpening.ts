import type { Vec3 } from '@brainana/planning-core/model.ts'
import { apertureWidths, planeBasis, type Aperture, type OpeningMeasurement } from './openingGeometry.ts'
/** Check the actual CT rather than assuming a mesh boundary is a physical hole.
 * A local tangent-plane air component must be enclosed by thresholded bone.
 * Maximum intensity along a short normal slab tolerates outer-surface curvature.
 */
export function measureCTOpening(candidate:Aperture,sample:(p:Vec3)=>number,threshold:number,nativeMm:number,resolutionMm=nativeMm): (Aperture & {measurement:OpeningMeasurement})|null{
  const step=Math.max(.05,nativeMm/2),extent=candidate.radius+Math.max(2*nativeMm,1)
  const half=Math.ceil(extent/step),side=half*2+1
  // A very large opening or underspecified image must not freeze interactive detection.
  if(side>401||side<3)return null
  const [u,v]=planeBasis(candidate.normal),bone=new Uint8Array(side*side)
  const depth=Math.max(1,2*nativeMm),layers=Math.ceil(2*depth/step)
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
    const a=(x-half)*step,b=(y-half)*step
    for(let z=0;z<=layers;z++){
      const d=-depth+z*2*depth/layers,p=candidate.center.map((q,k)=>q+a*u[k]+b*v[k]+d*candidate.normal[k]) as Vec3,value=sample(p)
      if(!Number.isFinite(value))return null
      if(value>=threshold){bone[x+y*side]=1;break}
    }
  }
  // Do not relocate an artefactual centre to an unrelated neighbouring hole.
  const seed=half+half*side;if(bone[seed])return null
  const seen=new Uint8Array(bone.length),queue=[seed];seen[seed]=1
  let sx=0,sy=0
  const outline:number[][]=[]
  for(let i=0;i<queue.length;i++){
    const index=queue[i],x=index%side,y=Math.floor(index/side)
    if(!x||!y||x===side-1||y===side-1)return null
    sx+=(x-half)*step;sy+=(y-half)*step
    const neighbors=[index-1,index+1,index-side,index+side]
    if(neighbors.some(n=>bone[n]))for(const [dx,dy] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]])outline.push([(x-half+dx)*step,(y-half+dy)*step])
    for(const n of neighbors)if(!bone[n]&&!seen[n]){seen[n]=1;queue.push(n)}
  }
  if(!outline.length)return null
  sx/=queue.length;sy/=queue.length
  const center=candidate.center.map((q,k)=>q+sx*u[k]+sy*v[k]) as Vec3
  const [minimumWidth,maximumWidth]=apertureWidths(outline),diameter=2*Math.sqrt(queue.length*step**2/Math.PI)
  const radius=Math.max(...outline.map(p=>Math.hypot(p[0]-sx,p[1]-sy)))
  // Preserve the actual connected aperture footprint as a separate annotation.
  // It is never added to the skull surface or mounting-support geometry.
  let patch:Aperture['patch']
  if(queue.length<=5000){
    const pts:number[]=[],tris:number[]=[]
    for(const index of queue){const x=index%side,y=Math.floor(index/side),base=pts.length/3
      for(const [dx,dy] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]])for(let k=0;k<3;k++)pts.push(candidate.center[k]+(x-half+dx)*step*u[k]+(y-half+dy)*step*v[k])
      tris.push(base,base+1,base+2,base,base+2,base+3)
    }
    patch={pts,tris}
  }
  return {...candidate,center,radius,diameter,minimumWidth,maximumWidth,...(patch?{patch}:{}),measurement:{diameter,minimumWidth,maximumWidth,resolutionMm,source:'ct'}}
}
