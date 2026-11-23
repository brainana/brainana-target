import type { Pose } from '@brainana/planning-core/model.ts'
import { axes } from '@brainana/planning-core/geometry.ts'
/** Transform a whole vertex buffer with one basis calculation and one allocation. */
export function transformVertices(points: ArrayLike<number>, pose: Pose): Float32Array {
  const output = new Float32Array(points.length), [u, v, w] = axes(pose), origin = pose.origin
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i], y = points[i + 1], z = points[i + 2]
    output[i] = origin[0] + (u[0] * x + (v[0] * y + w[0] * z))
    output[i + 1] = origin[1] + (u[1] * x + (v[1] * y + w[1] * z))
    output[i + 2] = origin[2] + (u[2] * x + (v[2] * y + w[2] * z))
  }
  return output
}
