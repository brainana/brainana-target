import { add, dot, scale, sub, trajectoryAxes } from '@brainana/planning-core/geometry.ts'
import type { Vec3 } from '@brainana/planning-core/model.ts'
import { SurfaceRayIndex } from '@brainana/planning-core/surface-rays.ts'
import type { TriangleSurface } from '@brainana/planning-core/surface-fit.ts'
import type { MeshGeometry } from './primitives.ts'

const epsilon = 1e-7
const pointKey = (point: Vec3) => point.map(value => Math.round(value * 1e6)).join(',')
const unique = (points: Vec3[]): Vec3[] => [...new Map(points.map(p => [pointKey(p), p])).values()]

function orderFace(points: Vec3[], normal: Vec3): Vec3[] {
  const [u, v] = trajectoryAxes(normal)
  const center = scale(points.reduce(add, [0, 0, 0]), 1 / points.length)
  const angle = (point: Vec3) => Math.atan2(dot(sub(point, center), v), dot(sub(point, center), u))
  return points.sort((a, b) => angle(a) - angle(b))
}

/** Intersection of exterior support planes. Every plane encloses all of the cortical input vertices. */
export function corticalEnvelope(surfaces: TriangleSurface[], offsetMm: number): MeshGeometry {
  if (!surfaces.length || !Number.isFinite(offsetMm) || offsetMm < 0 || offsetMm > 20)
    throw new Error('Choose a brain surface and an outward offset from 0 to 20 mm.')
  const index = new SurfaceRayIndex(surfaces)
  const origin: Vec3 = [0, 0, 0]
  const hi = [0, 1, 2].map(axis => index.maximumProjection(origin, [0, 1, 2].map(k => Number(axis === k)) as Vec3) + offsetMm) as Vec3
  const lo = [0, 1, 2].map(axis => -index.maximumProjection(origin, [0, 1, 2].map(k => -Number(axis === k)) as Vec3) - offsetMm) as Vec3
  if (lo.some((v, axis) => !Number.isFinite(v) || !Number.isFinite(hi[axis]) || hi[axis] - v < epsilon))
    throw new Error('The brain mesh has no usable 3D extent.')
  const corners: Vec3[] = []
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) corners.push([x, y, z])
  let faces: Vec3[][] = []
  for (const axis of [0, 1, 2]) for (const sign of [-1, 1]) {
    const normal: Vec3 = [0, 0, 0]
    normal[axis] = sign
    faces.push(orderFace(corners.filter(point => point[axis] === (sign < 0 ? lo[axis] : hi[axis])), normal))
  }

  // Nearly uniform directions retain the gross asymmetry of the brain without following individual folds.
  const planeCount = 642, goldenAngle = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < planeCount; i++) {
    const z = 1 - 2 * (i + .5) / planeCount, radius = Math.sqrt(1 - z * z), angle = i * goldenAngle
    const normal: Vec3 = [radius * Math.cos(angle), radius * Math.sin(angle), z]
    const support = index.maximumProjection(origin, normal) + offsetMm
    const cap: Vec3[] = [], clipped: Vec3[][] = []
    for (const face of faces) {
      const next: Vec3[] = []
      for (let j = 0; j < face.length; j++) {
        const a = face[j], b = face[(j + 1) % face.length]
        const da = dot(a, normal) - support, db = dot(b, normal) - support
        if (da <= epsilon) next.push(a)
        if ((da > epsilon) === (db > epsilon)) continue
        const cut = Math.abs(da) <= epsilon ? a : Math.abs(db) <= epsilon ? b : add(a, scale(sub(b, a), da / (da - db)))
        next.push(cut)
        cap.push(cut)
      }
      const polygon = unique(next)
      if (polygon.length >= 3) clipped.push(polygon)
    }
    const capFace = unique(cap)
    if (capFace.length >= 3) clipped.push(orderFace(capFace, normal))
    faces = clipped
  }

  const pts: number[] = [], tris: number[] = [], vertices = new Map<string, number>()
  const vertex = (point: Vec3) => {
    const key = pointKey(point)
    const cached = vertices.get(key)
    if (cached !== undefined) return cached
    const id = pts.length / 3
    pts.push(...point)
    vertices.set(key, id)
    return id
  }
  for (const face of faces) {
    const center = vertex(scale(face.reduce(add, [0, 0, 0]), 1 / face.length))
    for (let i = 0; i < face.length; i++) {
      const a = vertex(face[i]), b = vertex(face[(i + 1) % face.length])
      if (a !== b && a !== center && b !== center) tris.push(center, a, b)
    }
  }
  if (!tris.length)
    throw new Error('Could not build a 3D cortical envelope.')
  return { pts: new Float32Array(pts), tris: new Uint32Array(tris) }
}
