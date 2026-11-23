import type {WorkerVolume} from './volumeWorker.ts'
import type { CTSurfaceRequest } from './ctSurfaceBuilder.ts'
import { skullPreview } from './ctSkull.ts'
import type { Vec3 } from '@brainana/planning-core/model.ts'
let source:WorkerVolume|undefined
self.onmessage = (event: MessageEvent<CTSurfaceRequest>) => {
  try {
    if(event.data.source)source=event.data.source
    if(!source)throw Error('CT surface worker has no source image.')
    const { dims, values, matrix: m, slope, intercept } = source
    const {threshold,bounds,options}=event.data
    const sample = (p: Vec3) => {
      const x = Math.round(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]), y = Math.round(m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]), z = Math.round(m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14])
      return x < 0 || y < 0 || z < 0 || x >= dims[0] || y >= dims[1] || z >= dims[2] ? NaN : Number(values[x + y * dims[0] + z * dims[0] * dims[1]]) * slope + intercept
    }
    const result = skullPreview({ sample }, threshold, bounds, options, progress => self.postMessage({ progress }))
    self.postMessage({ result }, { transfer: [result.pts.buffer, result.tris.buffer] })
  } catch (error) { self.postMessage({ error: String(error) }) }
}
