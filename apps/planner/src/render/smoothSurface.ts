import type { MeshGeometry } from './primitives.ts'
export interface SurfaceSmoothing { iterations: number; maximumDisplacementMm: number }
/** Taubin passes retain connectivity and limit movement from the original threshold boundary. */
export function smoothSurface(
  mesh: MeshGeometry, lo: number[], hi: number[], step: number, progress?: (message: string) => void,
  settings?: SurfaceSmoothing,
): MeshGeometry {
  const iterations = settings?.iterations ?? 12, limit = settings?.maximumDisplacementMm ?? step * .5
  if (!Number.isSafeInteger(iterations) || iterations < 0 || !Number.isFinite(limit) || limit < 0)
    throw new Error('Smoothing needs a whole number of passes and a non-negative movement distance.')
  if (!iterations || !limit) return mesh
  const original = mesh.pts, n = original.length / 3, counts = new Uint32Array(n)
  for (const i of mesh.tris) counts[i] += 2
  const offsets = new Uint32Array(n + 1)
  for (let i = 0; i < n; i++) offsets[i+1] = offsets[i] + counts[i]
  const neighbors = new Uint32Array(offsets[n]), cursor = offsets.slice(), fixed = new Uint8Array(n)
  for (let t = 0; t < mesh.tris.length; t += 3) {
    const a = mesh.tris[t], b = mesh.tris[t+1], c = mesh.tris[t+2]
    neighbors[cursor[a]++] = b; neighbors[cursor[a]++] = c
    neighbors[cursor[b]++] = c; neighbors[cursor[b]++] = a
    neighbors[cursor[c]++] = a; neighbors[cursor[c]++] = b
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++)
    if (Math.abs(original[i*3+k] - lo[k]) < 1e-5 || Math.abs(original[i*3+k] - hi[k]) < 1e-5) fixed[i] = 1
  let pts = original.slice(), next = new Float32Array(pts.length)
  for (let pass = 0; pass < iterations; pass++) {
    progress?.(`Smoothing surface · pass ${pass + 1} of ${iterations}…`)
    const weight = pass % 2 === 0 ? .5 : -.53
    for (let i = 0; i < n; i++) {
      const index = i * 3
      if (fixed[i] || !counts[i]) {
        next[index] = pts[index]; next[index+1] = pts[index+1]; next[index+2] = pts[index+2]
        continue
      }
      let x = 0, y = 0, z = 0
      for (let edge = offsets[i]; edge < offsets[i+1]; edge++) {
        const other = neighbors[edge] * 3
        x += pts[other]; y += pts[other+1]; z += pts[other+2]
      }
      next[index] = pts[index] + weight * (x / counts[i] - pts[index])
      next[index+1] = pts[index+1] + weight * (y / counts[i] - pts[index+1])
      next[index+2] = pts[index+2] + weight * (z / counts[i] - pts[index+2])
      const dx = next[index] - original[index], dy = next[index+1] - original[index+1], dz = next[index+2] - original[index+2]
      const distance = Math.hypot(dx, dy, dz)
      if (distance > limit) {
        next[index] = original[index] + dx * limit / distance
        next[index+1] = original[index+1] + dy * limit / distance
        next[index+2] = original[index+2] + dz * limit / distance
      }
    }
    ;[pts,next] = [next,pts]
  }
  return { pts, tris: mesh.tris }
}
