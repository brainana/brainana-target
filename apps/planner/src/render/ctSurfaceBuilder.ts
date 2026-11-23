import { skullPreview, type CTSurfaceOptions } from './ctSkull.ts'
import type { VolumeSampler } from './volume.ts'
import type { Vec3 } from '@brainana/planning-core/model.ts'
import { volumeWorker, type WorkerVolume } from './volumeWorker.ts'
interface CTSettings { threshold: number; bounds: [Vec3, Vec3]; options: CTSurfaceOptions }
export interface CTSurfaceRequest extends CTSettings { source?: WorkerVolume }
export type CTSurfaceResponse = { error: string } | { result: ReturnType<typeof skullPreview> } | { progress: string }
const client = volumeWorker(
  () => new Worker(new URL('./ctSurfaceWorker.ts', import.meta.url), { type: 'module' }),
  (volume, request: CTSettings) => skullPreview(volume, request.threshold, request.bounds, request.options),
  'Updating CT planning surface…',
)
export const disposeCTSurface = client.dispose
export function buildCTSurface(volume: VolumeSampler, threshold: number, bounds: [Vec3, Vec3], options: CTSurfaceOptions = {}, signal?: AbortSignal) {
  return client.build(volume, { threshold, bounds, options }, signal)
}
