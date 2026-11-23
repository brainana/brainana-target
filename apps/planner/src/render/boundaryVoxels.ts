import { mat4 } from 'gl-matrix'
import { gzipSync } from 'fflate'
import type { Vec3 } from '@brainana/planning-core/model.ts'
import type { MeshGeometry } from './primitives.ts'

export const boundaryColors = { detected: [63, 232, 213], reconstructed: [255, 183, 73] } as const
export interface BoundaryVoxels {
  dims: Vec3
  worldToVoxel: Float64Array
  /** A thin surface layer on the native image grid. 0: empty; 1: detected; 2: reconstructed. */
  labels: Uint8Array
  /** Aligned NIfTI label image, cropped to the surface bounds, with the same classification. */
  file: Uint8Array
}
export interface VoxelGrid { dims: ArrayLike<number>; matrix: ArrayLike<number> }

/** Conservative triangle/voxel intersection. Rasterises the sheet, never its enclosed volume. */
export function boundaryVoxels(mesh: MeshGeometry, grid: VoxelGrid, reconstructed?: Uint8Array): BoundaryVoxels {
  if (mesh.tris.length < 3 || Array.from(grid.dims).some(v => !Number.isInteger(v) || v <= 0) || Array.from(grid.matrix).length !== 16 || !Array.from(grid.matrix).every(Number.isFinite)) throw Error('The boundary needs a valid surface and image grid.')
  const m = grid.matrix, count = mesh.pts.length / 3, points = new Float64Array(mesh.pts.length)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) points[i * 3 + k] = m[k] * mesh.pts[i * 3] + m[k + 4] * mesh.pts[i * 3 + 1] + m[k + 8] * mesh.pts[i * 3 + 2] + m[k + 12]
  for (const i of mesh.tris) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], points[i * 3 + k]); hi[k] = Math.max(hi[k], points[i * 3 + k]) }
  const origin = lo.map((v, k) => Math.max(0, Math.min(grid.dims[k] - 1, Math.ceil(v - .500001))))
  const end = hi.map((v, k) => Math.max(origin[k], Math.min(grid.dims[k] - 1, Math.floor(v + .500001))))
  const dims = end.map((v, k) => v - origin[k] + 1) as Vec3, size = dims[0] * dims[1] * dims[2]
  if (!Number.isSafeInteger(size) || size > 128000000) throw Error('The boundary voxel image needs more than 128 million voxels. Crop the MRI surface more tightly.')
  const labels = new Uint8Array(size), worldToVoxel = Float64Array.from(m)
  for (let k = 0; k < 3; k++) worldToVoxel[k + 12] -= origin[k]
  const axes = new Float64Array(60)
  for (let face = 0; face < mesh.tris.length; face += 3) {
    const a = mesh.tris[face] * 3, b = mesh.tris[face + 1] * 3, c = mesh.tris[face + 2] * 3
    const ax = points[a], ay = points[a + 1], az = points[a + 2], bx = points[b], by = points[b + 1], bz = points[b + 2], cx = points[c], cy = points[c + 1], cz = points[c + 2]
    let used = 0
    const axis = (x: number, y: number, z: number) => {
      if (Math.abs(x) + Math.abs(y) + Math.abs(z) < 1e-12) return
      const p = ax * x + ay * y + az * z, q = bx * x + by * y + bz * z, r = cx * x + cy * y + cz * z, offset = used++ * 6
      axes[offset] = x; axes[offset + 1] = y; axes[offset + 2] = z
      axes[offset + 3] = Math.min(p, q, r); axes[offset + 4] = Math.max(p, q, r); axes[offset + 5] = .5 * (Math.abs(x) + Math.abs(y) + Math.abs(z)) + 1e-6
    }
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az
    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-12) continue
    axis(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
    for (const [x, y, z] of [[ux, uy, uz], [cx - bx, cy - by, cz - bz], [-vx, -vy, -vz]]) { axis(0, z, -y); axis(-z, 0, x); axis(y, -x, 0) }
    const first = [Math.max(origin[0], Math.ceil(Math.min(ax, bx, cx) - .500001)), Math.max(origin[1], Math.ceil(Math.min(ay, by, cy) - .500001)), Math.max(origin[2], Math.ceil(Math.min(az, bz, cz) - .500001))]
    const last = [Math.min(end[0], Math.floor(Math.max(ax, bx, cx) + .500001)), Math.min(end[1], Math.floor(Math.max(ay, by, cy) + .500001)), Math.min(end[2], Math.floor(Math.max(az, bz, cz) + .500001))]
    const label = reconstructed?.[face / 3] ? 2 : 1
    for (let z = first[2]; z <= last[2]; z++) for (let y = first[1]; y <= last[1]; y++) for (let x = first[0]; x <= last[0]; x++) {
      const i = x - origin[0] + (y - origin[1]) * dims[0] + (z - origin[2]) * dims[0] * dims[1]
      if (labels[i] >= label) continue
      let intersects = true
      for (let k = 0; k < used * 6; k += 6) {
        const dot = x * axes[k] + y * axes[k + 1] + z * axes[k + 2]
        if (dot + axes[k + 5] < axes[k + 3] || dot - axes[k + 5] > axes[k + 4]) { intersects = false; break }
      }
      if (intersects) labels[i] = label
    }
  }
  return { dims, worldToVoxel, labels, file: boundaryNifti(labels, dims, worldToVoxel) }
}

export function boundaryLabel(voxels: Pick<BoundaryVoxels, 'worldToVoxel' | 'dims' | 'labels'>, point: ArrayLike<number>): number {
  const m = voxels.worldToVoxel, d = voxels.dims
  const x = Math.round(m[0] * point[0] + m[4] * point[1] + m[8] * point[2] + m[12]), y = Math.round(m[1] * point[0] + m[5] * point[1] + m[9] * point[2] + m[13]), z = Math.round(m[2] * point[0] + m[6] * point[1] + m[10] * point[2] + m[14])
  return x < 0 || y < 0 || z < 0 || x >= d[0] || y >= d[1] || z >= d[2] ? 0 : voxels.labels[x + y * d[0] + z * d[0] * d[1]]
}

function boundaryNifti(labels: Uint8Array, dims: Vec3, worldToVoxel: ArrayLike<number>): Uint8Array {
  const affine = mat4.invert(mat4.create(), Float64Array.from(worldToVoxel))
  if (!affine) throw Error('The MRI boundary has an invalid image transform.')
  const bytes = new Uint8Array(352 + labels.length), view = new DataView(bytes.buffer)
  view.setInt32(0, 348, true); view.setInt16(40, 3, true)
  for (let k = 0; k < 7; k++) view.setInt16(42 + k * 2, k < 3 ? dims[k] : 1, true)
  view.setInt16(68, 1002, true); view.setInt16(70, 2, true); view.setInt16(72, 8, true)
  view.setFloat32(76, 1, true)
  for (let k = 0; k < 3; k++) view.setFloat32(80 + k * 4, Math.hypot(affine[k * 4], affine[k * 4 + 1], affine[k * 4 + 2]), true)
  view.setFloat32(108, 352, true); view.setFloat32(112, 1, true); bytes[123] = 2
  view.setFloat32(124, 2, true); view.setFloat32(128, 1, true)
  bytes.set(new TextEncoder().encode('Estimated MRI boundary: 1 detected; 2 reconstructed. Surface layer only.'), 148)
  view.setInt16(254, 1, true)
  for (let row = 0; row < 3; row++) for (let column = 0; column < 4; column++) view.setFloat32(280 + row * 16 + column * 4, affine[column * 4 + row], true)
  bytes.set([110, 43, 49, 0], 344); bytes.set(labels, 352)
  return gzipSync(bytes, { level: 1, mtime: 0 })
}
