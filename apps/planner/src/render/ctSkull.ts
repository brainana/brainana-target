import { selectMaskComponents } from './maskComponents.ts'
import { applySurfaceBrush } from './surfaceBrush.ts'
import type { SurfaceBrushStroke } from '@brainana/planning-core/model.ts'
import { outerSkull } from './outerSkull.ts'
import { smoothSurface, type SurfaceSmoothing } from './smoothSurface.ts'
import { maskIsosurface } from './maskIsosurface.ts'
import { mat4, vec3 } from 'gl-matrix'
import type { Vec3 } from '@brainana/planning-core/model.ts'
import type { VolumeSampler } from './volume.ts'
export interface CTSurfaceOptions { edits?: SurfaceBrushStroke[]; smoothing?: SurfaceSmoothing; representation?: 'voxel' | 'isosurface' | 'smooth' | 'outer'; center?: Vec3; componentSeed?: Vec3; spacingMm?: number; components?: 'all' | 'largest' }
/** Deterministic threshold segmentation in physical RAS coordinates; source pixels are immutable. */
export function skullPreview(volume: Pick<VolumeSampler, 'sample'>, threshold: number, bounds: [Vec3, Vec3], options: CTSurfaceOptions = {}, progress?: (message: string) => void) {
  const step = options.spacingMm ?? 2, [lo, hi] = bounds
  if ((!Number.isFinite(step) || step < 0.05 || step > 20) || !Number.isFinite(threshold) || ![...lo, ...hi].every(Number.isFinite) || hi.some((v, i) => v <= lo[i])) throw new Error('Invalid CT surface resolution, threshold or crop bounds.')
  const dims = lo.map((v, i) => Math.ceil((hi[i] - v) / step))
  const sampleCount = dims.reduce((a, b) => a * b, 1)
  if (dims.some(v => v < 1) || !Number.isSafeInteger(sampleCount))
    throw new Error('The crop and sample spacing do not define a valid sampling grid.')
  const [nx, ny, nz] = dims
  let mask: Uint8Array
  try { mask = new Uint8Array(sampleCount) }
  catch { throw new Error(`Could not allocate ${(sampleCount / 1048576).toFixed(1)} MiB for the CT sampling mask at ${step} mm. Free memory or adjust the crop or spacing.`) }
  progress?.(`Sampling CT at ${step} mm · ${sampleCount.toLocaleString()} samples…`)
  const positions = dims.map((n, k) => Float64Array.from({ length: n }, (_, i) =>
    lo[k] + i * step + Math.min(step, hi[k] - lo[k] - i * step) / 2))
  let originalVoxels = 0, index = 0
  const point: Vec3 = [0, 0, 0]
  for (let z = 0; z < nz; z++) {
    point[2] = positions[2][z]
    for (let y = 0; y < ny; y++) {
      point[1] = positions[1][y]
      for (let x = 0; x < nx; x++, index++) {
        point[0] = positions[0][x]
        const value = volume.sample(point, true)
        if (Number.isFinite(value) && value >= threshold) { mask[index] = 1; originalVoxels++ }
      }
    }
    if (z % 8 === 0) progress?.(`Sampling CT at ${step} mm · ${Math.round(100 * (z + 1) / nz)}%…`)
  }
  if (options.edits?.length) applySurfaceBrush(mask, dims, lo, hi, step, options.edits)
  if (options.edits?.length && !mask.some(Boolean)) throw new Error('No bone remains after manual corrections. Undo a brush stroke or reset corrections.')
  if (!originalVoxels) throw new Error('No CT voxels meet the skull threshold inside this crop.')
  let selectedSeed: number | undefined
  if (options.componentSeed) {
    const cell = options.componentSeed.map((v, k) => Math.floor((v - lo[k]) / step))
    if (cell.some((v, k) => v < 0 || v >= dims[k])) throw new Error('The skull selection point is outside the crop.')
    selectedSeed = cell[0] + cell[1] * nx + cell[2] * nx * ny
  }
  progress?.('Selecting connected CT bone…')
  const { components } = selectMaskComponents(mask, dims, options.components ?? 'all', selectedSeed, progress)
  let retainedVoxels = 0, boundaryVoxels = 0
  // Count contacts after component selection, in R-/R+/A-/A+/S-/S+ order.
  const boundaryFaces = [0, 0, 0, 0, 0, 0]
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (mask[x + y * nx + z * nx * ny]) {
    retainedVoxels++
    if (!x || !y || !z || x === nx - 1 || y === ny - 1 || z === nz - 1) boundaryVoxels++
    if (!x) boundaryFaces[0]++
    if (x === nx - 1) boundaryFaces[1]++
    if (!y) boundaryFaces[2]++
    if (y === ny - 1) boundaryFaces[3]++
    if (!z) boundaryFaces[4]++
    if (z === nz - 1) boundaryFaces[5]++
  }
  const report: { spacingMm: number; components: number; originalVoxels: number; retainedVoxels: number; boundaryVoxels: number; boundaryFaces: number[]; removedVoxels: number; outer?: ReturnType<typeof outerSkull>['outerReport'] } = { spacingMm: step, components, originalVoxels, retainedVoxels, boundaryVoxels, boundaryFaces, removedVoxels: originalVoxels - retainedVoxels }
  if (options.representation === 'outer') {
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)if(mask[x+y*nx+z*nx*ny])for(const [k,v] of [x,y,z].entries()){min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v)}
    const center = options.center ?? lo.map((v,k)=>v+(min[k]+max[k]+1)*step/2) as Vec3
    const mesh = outerSkull(mask,dims,lo,hi,step,center,progress,options.smoothing)
    return {outerEnvelope:true,pts:mesh.pts,tris:mesh.tris,report:{...report,outer:mesh.outerReport}}
  }
  if (options.representation === 'isosurface' || options.representation === 'smooth') {
    const mesh = maskIsosurface(mask, dims, lo, hi, step, true, progress)
    if (!mesh.tris.length) throw new Error('The thresholded bone fills the crop. Increase the bone threshold or widen the crop to show the skull boundary.')
    progress?.(`Preparing CT surface · ${(mesh.tris.length / 3).toLocaleString()} triangles…`)
    return { ...(options.representation === 'smooth' ? smoothSurface(mesh, lo, hi, step, progress, options.smoothing) : mesh), report }
  }
  const at = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && mask[x + y * nx + z * nx * ny]
  const pts: number[] = [],
    tris: number[] = []
  const vertexIndices = new Map<number, number>()
  const faces = [
    [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
    [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
    [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
    [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  ]
  const neighbors = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
  ]
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++)
        if (at(x, y, z))
          for (let f = 0; f < 6; f++) {
            const n = neighbors[f]
            if (at(x + n[0], y + n[1], z + n[2])) continue
            const corners = faces[f].map(v => {
              const cx = x + v[0], cy = y + v[1], cz = z + v[2], key = cx + cy * (nx + 1) + cz * (nx + 1) * (ny + 1)
              let index = vertexIndices.get(key)
              if (index === undefined) {
                index = pts.length / 3; vertexIndices.set(key, index)
                pts.push(Math.min(hi[0], lo[0] + cx * step), Math.min(hi[1], lo[1] + cy * step), Math.min(hi[2], lo[2] + cz * step))
              }
              return index
            })
            tris.push(corners[0], corners[1], corners[2], corners[0], corners[2], corners[3])
          }
  if (!tris.length) throw new Error('No CT voxels meet the skull threshold inside this crop.')
  return { pts: new Float32Array(pts), tris: new Uint32Array(tris), report }
}
export function imageBounds(volume: VolumeSampler, voxelEdges = false): [Vec3, Vec3] {
  const m = mat4.invert(mat4.create(), volume.worldToVoxel)!,
    points: number[][] = []
  for (const x of voxelEdges ? [-0.5, volume.dims[0] - 0.5] : [0, volume.dims[0] - 1])
    for (const y of voxelEdges ? [-0.5, volume.dims[1] - 0.5] : [0, volume.dims[1] - 1])
      for (const z of voxelEdges ? [-0.5, volume.dims[2] - 0.5] : [0, volume.dims[2] - 1])
        points.push(Array.from(vec3.transformMat4(vec3.create(), [x, y, z], m)))
  return [
    [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))) as Vec3,
    [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))) as Vec3,
  ]
}
