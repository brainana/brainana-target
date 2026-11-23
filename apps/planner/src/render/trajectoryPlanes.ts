import type { Vec3 } from '@brainana/planning-core/model.ts'
import { add, scale, trajectoryAxes } from '@brainana/planning-core/geometry.ts'
import type { Plane } from '@brainana/planning-core/reslice.ts'
export function trajectoryPlanes(entry: Vec3, tip: Vec3, direction: Vec3, depth: number, angleDegrees = 0, tipOffset = 0): [Plane, Plane] {
  const [a, b, w] = trajectoryAxes(direction), angle = angleDegrees * Math.PI / 180
  const right = add(scale(a, Math.cos(angle)), scale(b, Math.sin(angle)))
  const field = Math.max(40, depth + 12)
  return [
    { center: add(entry, scale(w, depth / 2)), right, up: scale(w, -1), widthMm: field, heightMm: field },
    { center: add(tip, scale(w, tipOffset)), right: a, up: b, widthMm: 24, heightMm: 24 },
  ]
}
