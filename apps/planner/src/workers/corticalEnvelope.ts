import type { TriangleSurface } from '@brainana/planning-core/surface-fit.ts'
import { corticalEnvelope } from '../render/corticalEnvelope.ts'

export interface CorticalEnvelopeRequest { surfaces: TriangleSurface[]; offsetMm: number }
self.onmessage = (event: MessageEvent<CorticalEnvelopeRequest>) => {
  try {
    const result = corticalEnvelope(event.data.surfaces, event.data.offsetMm)
    self.postMessage({ kind: 'result', value: result }, { transfer: [result.pts.buffer, result.tris.buffer] })
  } catch (error) {
    self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
