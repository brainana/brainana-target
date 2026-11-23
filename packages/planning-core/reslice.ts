import { add, scale } from './geometry.ts'
import type { Vec3 } from './model.ts'
export interface Plane {
  center: Vec3
  right: Vec3
  up: Vec3
  widthMm: number
  heightMm: number
}
export function planePoint(plane: Plane, x: number, y: number, width: number, height: number): Vec3 {
  return add(
    plane.center,
    add(
      scale(plane.right, ((x + 0.5) / width - 0.5) * plane.widthMm),
      scale(plane.up, (0.5 - (y + 0.5) / height) * plane.heightMm),
    ),
  )
}
/** No renderer dependency: a volume adapter supplies world-space interpolation. */
export function reslice(
  plane: Plane,
  width: number,
  height: number,
  sample: (world: Vec3) => number,
): Float32Array {
  const values = new Float32Array(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) values[y * width + x] = sample(planePoint(plane, x, y, width, height))
  return values
}
export function trilinear(
  voxel: Vec3,
  dims: Vec3,
  value: (x: number, y: number, z: number) => number,
): number {
  if (voxel.some((v, i) => v < 0 || v > dims[i] - 1)) return NaN
  const [x, y, z] = voxel.map(Math.floor),
    [a, b, c] = voxel.map((v, i) => v - Math.floor(voxel[i]))
  let out = 0
  for (let dz = 0; dz < 2; dz++)
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const w = (dx ? a : 1 - a) * (dy ? b : 1 - b) * (dz ? c : 1 - c)
        if (w)
          out +=
            w *
            value(Math.min(x + dx, dims[0] - 1), Math.min(y + dy, dims[1] - 1), Math.min(z + dz, dims[2] - 1))
      }
  return out
}
