import { add, axes, cross, dot, length, normalize, poseFromAxes, scale, sub, trajectoryAxes } from '@brainana/planning-core/geometry.ts'
import type { Pose, Vec3 } from '@brainana/planning-core/model.ts'
import type { SurfaceRayIndex } from '@brainana/planning-core/surface-rays.ts'

/** Estimate the tangent and its support height over the flat baseplate's footprint. */
export function fitHeadpostPose(
  surface: SurfaceRayIndex,
  hit: { point: Vec3; normal: Vec3 },
  previous: Pose,
  radius: number,
): Pose {
  const directions = (normal: Vec3, size: number): Vec3[] => {
    const [u, v] = trajectoryAxes(normal)
    return Array.from({length: 8}, (_, i) => {
      const angle = i * Math.PI / 4
      return add(scale(u, size * Math.cos(angle)), scale(v, size * Math.sin(angle)))
    })
  }
  const sample = (normal: Vec3, offset: Vec3) => {
    const depth = Math.max(1, Math.min(radius * .6, 6))
    return surface.intersection(add(add(hit.point, offset), scale(normal, depth)), scale(normal, -1), depth * 2)
  }
  let average = hit.normal
  for (const offset of directions(hit.normal, radius * .6)) {
    const nearby = sample(hit.normal, offset)
    if (nearby && dot(nearby.normal, hit.normal) > .4) average = add(average, nearby.normal)
  }
  const normal = normalize(average)
  const previousRight = axes(previous)[0]
  const tangent = sub(previousRight, scale(normal, dot(previousRight, normal)))
  const right = length(tangent) > 1e-4 ? normalize(tangent) : trajectoryAxes(normal)[0]
  let height = 0
  for (const offset of [...directions(normal, radius * .5), ...directions(normal, radius)]) {
    const nearby = sample(normal, offset)
    if (nearby) height = Math.max(height, dot(sub(nearby.point, hit.point), normal))
  }
  return poseFromAxes(add(hit.point, scale(normal, height + .05)), [right, cross(normal, right), normal])
}
