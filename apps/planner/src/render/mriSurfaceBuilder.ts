import { mriSurface, type MRISurfaceSettings } from './mriSurface.ts'
import type { VolumeSampler } from './volume.ts'
import { volumeWorker, type WorkerVolume } from './volumeWorker.ts'
import { boundaryVoxels, type VoxelGrid } from './boundaryVoxels.ts'
export type MRISurfaceSource = WorkerVolume
export interface MRISurfaceRequest { source?: WorkerVolume; settings: MRISurfaceSettings; brain?:WorkerVolume; grid?: VoxelGrid }
const maskSources=new WeakMap<VolumeSampler,VolumeSampler>()
const client = volumeWorker(
  () => new Worker(new URL('./mriSurfaceWorker.ts', import.meta.url), { type: 'module' }),
  (volume, request: { settings: MRISurfaceSettings; brain?:WorkerVolume; grid?: VoxelGrid }) => {
    const surface = mriSurface(volume, request.settings, maskSources.get(volume))
    return { ...surface, boundary: boundaryVoxels(surface, request.grid ?? { dims: volume.dims, matrix: volume.worldToVoxel }, surface.reconstructedFaces) }
  },
  'Updating MRI surface estimate…',
)
export const disposeMRISurface = (volume:VolumeSampler):void=>{client.dispose(volume);maskSources.delete(volume)}
export function buildMRISurface(volume: VolumeSampler, settings: MRISurfaceSettings, signal?: AbortSignal, brain?:VolumeSampler, grid?: VoxelGrid) {
  if(maskSources.get(volume)!==brain){client.dispose(volume);if(brain)maskSources.set(volume,brain);else maskSources.delete(volume)}
  return client.build(volume, { settings, grid }, signal,()=>brain?{brain:{dims:brain.dims,values:brain.values,matrix:brain.worldToVoxel,slope:brain.slope,intercept:brain.intercept}}:{})
}
