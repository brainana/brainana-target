import { mriSurface } from './mriSurface.ts'
import { boundaryVoxels } from './boundaryVoxels.ts'
import type { MRISurfaceRequest, MRISurfaceSource } from './mriSurfaceBuilder.ts'
import type { Vec3 } from '@brainana/planning-core/model.ts'
let source: MRISurfaceSource | undefined
let brainSource:MRISurfaceSource|undefined
const samplers=new WeakMap<MRISurfaceSource,{sample:(p:Vec3)=>number}>()
self.onmessage = (event: MessageEvent<MRISurfaceRequest>) => {
  try {
    if (event.data.source){source = event.data.source;brainSource=event.data.brain}
    if (!source) throw Error('MRI surface worker has no source image.')
    const sampler=(input:MRISurfaceSource)=>{
      const cached=samplers.get(input);if(cached)return cached
      const value={sample:(p:Vec3)=>{
      const {dims,values,matrix:m,slope,intercept}=input
      const x=Math.round(m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12]),y=Math.round(m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13]),z=Math.round(m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14])
      return x<0||y<0||z<0||x>=dims[0]||y>=dims[1]||z>=dims[2]?NaN:Number(values[x+y*dims[0]+z*dims[0]*dims[1]])*slope+intercept
    }};samplers.set(input,value);return value
    }
    const surface = mriSurface(sampler(source), event.data.settings,brainSource?sampler(brainSource):undefined)
    const boundary = boundaryVoxels(surface, event.data.grid ?? source, surface.reconstructedFaces)
    const result = { ...surface, boundary }
    const transfer = [result.pts.buffer, result.tris.buffer, boundary.labels.buffer, boundary.worldToVoxel.buffer, boundary.file.buffer]
    if (result.reconstructedFaces) transfer.push(result.reconstructedFaces.buffer)
    self.postMessage({ result }, { transfer })
  } catch (error) { self.postMessage({ error: String(error) }) }
}
