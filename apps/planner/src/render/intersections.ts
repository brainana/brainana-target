import { add, dot, gridAxes, gridCenterHeight, gridHoles, gridSeatHeight, length, normalize, scale, sub, worldToLocal } from '@brainana/planning-core/geometry.ts'
import type { Chamber, Grid, Vec3 } from '@brainana/planning-core/model.ts'
import { SurfaceRayIndex } from '@brainana/planning-core/surface-rays.ts'
import type { MeshGeometry } from './primitives.ts'
import type { TriangleSurface } from '@brainana/planning-core/surface-fit.ts'

export interface IntersectionSurface extends TriangleSurface {
  group: string
  name: string
  anatomy?: boolean
  penetration?: boolean
  gridSolid?: { chamber: Chamber; grid: Grid }
}

type Bounds = [Vec3, Vec3]
export interface IntersectionResult {
  points: Vec3[]
  pairs: string[]
  overlap: MeshGeometry
  limited: boolean
}

function bounds(mesh: TriangleSurface): Bounds {
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < mesh.pts.length; i += 3)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], mesh.pts[i + k])
      hi[k] = Math.max(hi[k], mesh.pts[i + k])
    }
  return [lo, hi]
}

function closed(mesh: TriangleSurface): boolean {
  const edges = new Map<number, number>(), n = mesh.pts.length / 3
  for (let i = 0; i < mesh.tris.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = mesh.tris[i + k], b = mesh.tris[i + (k + 1) % 3]
      const key = Math.min(a, b) * n + Math.max(a, b)
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
  for (const count of edges.values()) if (count !== 2) return false
  return true
}

const rayDirections: Vec3[] = [[1, .317, .137], [.281, 1, .173], [.193, .367, 1]].map(value => normalize(value as Vec3))

function interior(point: Vec3, mesh: SurfaceRayIndex): boolean {
  let votes = 0
  for (const direction of rayDirections) {
    let crossings = 0, origin = point
    while (crossings < 64) {
      const t = mesh.distance(origin, direction)
      if (!Number.isFinite(t)) break
      crossings++
      origin = add(origin, scale(direction, t + .0001))
    }
    if (crossings % 2) votes++
  }
  return votes >= 2
}

function edgeHits(
  source: TriangleSurface, target: SurfaceRayIndex, [lo, hi]: Bounds,
  onHit: (point: Vec3) => boolean,
): boolean {
  const n = source.pts.length / 3, seen = new Set<number>()
  for (let i = 0; i < source.tris.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = source.tris[i + k], b = source.tris[i + (k + 1) % 3]
      let overlaps = true
      for (let d = 0; d < 3; d++) {
        const u = source.pts[a * 3 + d], v = source.pts[b * 3 + d]
        if (Math.max(u, v) < lo[d] - 1e-6 || Math.min(u, v) > hi[d] + 1e-6) { overlaps = false; break }
      }
      if (!overlaps) continue
      const key = Math.min(a, b) * n + Math.max(a, b)
      if (seen.has(key)) continue
      seen.add(key)
      const start = vertex(source, a), delta = sub(vertex(source, b), start), size = length(delta)
      if (size < 1e-8) continue
      const direction = scale(delta, 1 / size)
      const t = target.distance(start, direction, size + 1e-6)
      if (Number.isFinite(t) && !onHit(add(start, scale(direction, t)))) return true
    }
  return false
}

function vertex(mesh: TriangleSurface, i: number): Vec3 {
  return [mesh.pts[3 * i], mesh.pts[3 * i + 1], mesh.pts[3 * i + 2]]
}

/** Sample occupied hardware faces locally, preserving crossing markers for open surfaces. */
function appendInside(
  source: TriangleSurface, inside: (p: Vec3) => boolean, [lo, hi]: Bounds, vertices: number[], budget: { samples: number }, resolution = 2,
): void {
  const insideBounds = (point: Vec3) => point.every((v, i) => v >= lo[i] && v <= hi[i])
  const visit = (a: Vec3, b: Vec3, c: Vec3, depth: number) => {
    if (budget.samples <= 0 || vertices.length >= 108000) return
    if (lo.some((v, i) => Math.max(a[i], b[i], c[i]) < v || Math.min(a[i], b[i], c[i]) > hi[i])) return
    const ab = length(sub(a, b)), bc = length(sub(b, c)), ca = length(sub(c, a))
    if (Math.max(ab, bc, ca) > resolution && depth < 15) {
      if (ab >= bc && ab >= ca) {
        const mid = scale(add(a, b), .5)
        visit(a, mid, c, depth + 1)
        visit(mid, b, c, depth + 1)
      } else if (bc >= ca) {
        const mid = scale(add(b, c), .5)
        visit(b, mid, a, depth + 1)
        visit(mid, c, a, depth + 1)
      } else {
        const mid = scale(add(c, a), .5)
        visit(c, mid, b, depth + 1)
        visit(mid, a, b, depth + 1)
      }
      return
    }
    const center = scale(add(add(a, b), c), 1 / 3)
    if (!insideBounds(center)) return
    budget.samples--
    if (inside(center)) vertices.push(...a, ...b, ...c)
  }
  for (let i = 0; i < source.tris.length && budget.samples > 0; i += 3)
    visit(vertex(source, source.tris[i]), vertex(source, source.tris[i + 1]), vertex(source, source.tris[i + 2]), 0)
}

function guideGridMaterial(chamber: Chamber, grid: Grid): (point: Vec3) => boolean {
  const center = gridCenterHeight(chamber, grid), bottom = gridSeatHeight(chamber, grid)
  const [xAxis, yAxis, normal] = gridAxes(grid)
  const rotation = grid.rotation * Math.PI / 180, cos = Math.cos(rotation), sin = Math.sin(rotation)
  const holes = new Set(gridHoles(chamber, grid).map(hole => hole.join(',')))
  const bore = (grid.holeDiameter ?? .7) / 2
  return point => {
    const [x, y, z] = worldToLocal(chamber.pose, point)
    const relative: Vec3 = [x, y, z - center]
    if (z < bottom || dot(relative, normal) > 0 || x*x + y*y > chamber.innerRadius**2) return false
    const faceX = dot(relative, xAxis), faceY = dot(relative, yAxis)
    const u = faceX * cos + faceY * sin, v = -faceX * sin + faceY * cos
    const i = Math.round(u / grid.spacing), j = Math.round(v / grid.spacing)
    return !holes.has([i, j].join(',')) || Math.hypot(u - i * grid.spacing, v - j * grid.spacing) > bore + 1e-6
  }
}

export function shouldCheckOverlap(a: IntersectionSurface, b: IntersectionSurface): boolean {
  if (a.group === b.group || a.anatomy && b.anatomy || a.anatomy && b.penetration || b.anatomy && a.penetration) return false
  if (a.gridSolid || b.gridSolid) return !!(a.penetration || b.penetration)
  return true
}

export function findIntersections(surfaces: IntersectionSurface[]): IntersectionResult {
  const items = surfaces.filter(mesh => mesh.tris.length > 0).map(mesh => ({
    mesh, bounds: bounds(mesh), index: undefined as SurfaceRayIndex | undefined, closed: undefined as boolean | undefined,
  }))
  type Item = typeof items[number]
  const index = (item: Item) => item.index ??= new SurfaceRayIndex([item.mesh])
  const overlap: number[] = []
  const budget = { samples: 30000 }
  const points: Vec3[] = [], cells = new Set<string>(), pairs = new Set<string>()
  let limited = false
  const pairLimit = 36
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]
    if (!shouldCheckOverlap(a.mesh, b.mesh)) continue
    if (a.bounds[0].some((lo, k) => lo > b.bounds[1][k] || b.bounds[0][k] > a.bounds[1][k])) continue
    let found = false, markers = 0
    const record = (point: Vec3) => {
      found = true
      const cell = point.map(v => Math.floor(v / 1.5)).join(',')
      if (cells.has(cell)) return true
      if (markers >= pairLimit || points.length >= 240) { limited = true; return false }
      points.push(point)
      cells.add(cell)
      markers++
      return true
    }
    const grid = a.mesh.gridSolid ? a : b.mesh.gridSolid ? b : undefined
    if (grid) {
      const before = overlap.length
      const { chamber, grid: definition } = grid.mesh.gridSolid!
      appendInside(grid === a ? b.mesh : a.mesh, guideGridMaterial(chamber, definition), grid.bounds, overlap, budget, .25)
      if (overlap.length > before) {
        record([overlap[before], overlap[before + 1], overlap[before + 2]])
        pairs.add([a.mesh.name, b.mesh.name].sort().join(' × '))
      }
      continue
    }
    if (!edgeHits(a.mesh, index(b), b.bounds, record)) edgeHits(b.mesh, index(a), a.bounds, record)
    if (!found) for (const [inner, outer] of [[a, b], [b, a]]) {
      // Fully enclosed hardware has no crossing edges. Only infer an inside for a closed mesh.
      if (!inner.bounds[0].every((lo, k) => lo >= outer.bounds[0][k] && inner.bounds[1][k] <= outer.bounds[1][k])) continue
      if (!(outer.closed ??= closed(outer.mesh))) continue
      const stride = Math.max(1, Math.floor(inner.mesh.pts.length / 36))
      for (let k = 0; k < inner.mesh.pts.length / 3; k += stride) {
        const p = vertex(inner.mesh, k)
        if (interior(p, index(outer)) && !record(p)) break
      }
    }
    if (found) {
      pairs.add([a.mesh.name, b.mesh.name].sort().join(' × '))
      for (const [inner, outer] of [[a, b], [b, a]]) {
        if (inner.mesh.anatomy || !(outer.closed ??= closed(outer.mesh))) continue
        appendInside(inner.mesh, point => interior(point, index(outer)), outer.bounds, overlap, budget)
      }
    }
  }
  limited ||= budget.samples <= 0 || overlap.length >= 108000
  return { points, pairs: [...pairs], limited, overlap: {
    pts: new Float32Array(overlap), tris: Uint32Array.from({ length: overlap.length / 3 }, (_, i) => i),
  } }
}
