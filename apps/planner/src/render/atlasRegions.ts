import { mat4, vec3 } from 'gl-matrix'
import type { Vec3 } from '@brainana/planning-core/model.ts'
import type { AtlasLabel } from '@brainana/brainana-data/atlas.ts'
import type { VolumeSampler } from './volume.ts'
export interface AtlasRegion {
  label: AtlasLabel
  count: number
  point: Vec3
}
/** Navigation uses a voxel actually belonging to the region, nearest its voxel centroid. */
export function indexAtlasRegions(volume: VolumeSampler, labels: Map<number, AtlasLabel>): AtlasRegion[] {
  const regions = new Map<number, { count: number; sum: number[]; nearest: number; distance: number }>()
  const [nx, ny] = volume.dims
  for (let i = 0; i < volume.values.length; i++) {
    const value = Number(volume.values[i]) * volume.slope + volume.intercept,
      id = Math.round(value)
    if (!Number.isFinite(value) || Math.abs(value - id) > 1e-5 || id < -32768 || id > 65535)
      throw new Error(
        "Choose an atlas image with a whole-number region ID at each voxel, rather than a continuously shaded image. Supported IDs range from -32768 to 65535.",
      )
    if (id === 0) continue
    let r = regions.get(id)
    if (!r) {
      r = { count: 0, sum: [0, 0, 0], nearest: i, distance: Infinity }
      regions.set(id, r)
    }
    r.count++
    r.sum[0] += i % nx
    r.sum[1] += Math.floor(i / nx) % ny
    r.sum[2] += Math.floor(i / (nx * ny))
  }
  for (const r of regions.values()) r.sum = r.sum.map((v) => v / r.count)
  for (let i = 0; i < volume.values.length; i++) {
    const r = regions.get(Math.round(Number(volume.values[i]) * volume.slope + volume.intercept))
    if (!r) continue
    const d =
      ((i % nx) - r.sum[0]) ** 2 +
      ((Math.floor(i / nx) % ny) - r.sum[1]) ** 2 +
      (Math.floor(i / (nx * ny)) - r.sum[2]) ** 2
    if (d < r.distance) {
      r.distance = d
      r.nearest = i
    }
  }
  const m = mat4.invert(mat4.create(), volume.worldToVoxel)!
  return [...regions]
    .map(([id, r]) => ({
      label: labels.get(id) ?? { id, name: `Label ${id}`, region: '', hemi: '' },
      count: r.count,
      point: Array.from(
        vec3.transformMat4(
          vec3.create(),
          [r.nearest % nx, Math.floor(r.nearest / nx) % ny, Math.floor(r.nearest / (nx * ny))],
          m,
        ),
      ) as Vec3,
    }))
    .sort((a, b) => a.label.name.localeCompare(b.label.name))
}
