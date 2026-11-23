import { add, scale, trajectoryAxes, localToWorld, axes } from '@brainana/planning-core/geometry.ts'
import type { Chamber, Pose, Vec3 } from '@brainana/planning-core/model.ts'
export interface MeshGeometry {
  pts: Float32Array
  tris: Uint32Array
}
export function combine(parts: MeshGeometry[]): MeshGeometry {
  let pointCount = 0, indexCount = 0
  for (const part of parts) { pointCount += part.pts.length; indexCount += part.tris.length }
  const pts = new Float32Array(pointCount), tris = new Uint32Array(indexCount)
  let pointOffset = 0, indexOffset = 0
  for (const part of parts) {
    pts.set(part.pts, pointOffset)
    const vertexOffset = pointOffset / 3
    for (let i = 0; i < part.tris.length; i++) tris[indexOffset + i] = part.tris[i] + vertexOffset
    pointOffset += part.pts.length; indexOffset += part.tris.length
  }
  return { pts, tris }
}
export function cylinder(start: Vec3, end: Vec3, radius: number, segments = 20): MeshGeometry {
  const [u, v] = trajectoryAxes([end[0] - start[0], end[1] - start[1], end[2] - start[2]])
  const pts: number[] = [],
    tris: number[] = []
  for (const p of [start, end])
    for (let i = 0; i < segments; i++) {
      const t = (i / segments) * 2 * Math.PI
      pts.push(...add(p, add(scale(u, Math.cos(t) * radius), scale(v, Math.sin(t) * radius))))
    }
  pts.push(...start, ...end)
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments
    tris.push(
      i,
      j,
      i + segments,
      j,
      j + segments,
      i + segments,
      segments * 2,
      j,
      i,
      segments * 2 + 1,
      i + segments,
      j + segments,
    )
  }
  return { pts: new Float32Array(pts), tris: new Uint32Array(tris) }
}
export function ring(
  pose: Pose,
  inner: number,
  outer: number,
  height: number,
  segments = 64,
  profile?: Chamber['baseFit'],
): MeshGeometry {
  const pts: number[] = [],
    tris: number[] = []
  for (const [r, z] of [
    [outer, 0],
    [outer, -height],
    [inner, 0],
    [inner, -height],
  ])
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * 2 * Math.PI
      const depth = profile && z !== 0 ? -(r === inner ? profile.innerDepths[i] : profile.outerDepths[i]) : z
      pts.push(...localToWorld(pose, [r * Math.cos(a), r * Math.sin(a), depth]))
    }
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments,
      n = segments
    tris.push(
      i,
      i + n,
      j,
      j,
      i + n,
      j + n,
      i + 2 * n,
      j + 2 * n,
      i + 3 * n,
      j + 2 * n,
      j + 3 * n,
      i + 3 * n,
      i,
      j,
      i + 2 * n,
      j,
      j + 2 * n,
      i + 2 * n,
      i + n,
      i + 3 * n,
      j + n,
      j + n,
      i + 3 * n,
      j + 3 * n,
    )
  }
  return { pts: new Float32Array(pts), tris: new Uint32Array(tris) }
}
export function pointMesh(p: Vec3, radius: number): MeshGeometry {
  const pts = new Float32Array([
    p[0] + radius,
    p[1],
    p[2],
    p[0] - radius,
    p[1],
    p[2],
    p[0],
    p[1] + radius,
    p[2],
    p[0],
    p[1] - radius,
    p[2],
    p[0],
    p[1],
    p[2] + radius,
    p[0],
    p[1],
    p[2] - radius,
  ])
  return {
    pts,
    tris: new Uint32Array([0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5]),
  }
}

/** Latitude/longitude sphere with the same metric radius used by the constraint solver. */
export function sphere(center: Vec3, radius: number, segments = 24, rings = 12): MeshGeometry {
  const pts: number[] = [],
    tris: number[] = []
  for (let j = 0; j <= rings; j++) {
    const latitude = (Math.PI * j) / rings
    for (let i = 0; i <= segments; i++) {
      const longitude = (2 * Math.PI * i) / segments
      pts.push(
        center[0] + radius * Math.sin(latitude) * Math.cos(longitude),
        center[1] + radius * Math.sin(latitude) * Math.sin(longitude),
        center[2] + radius * Math.cos(latitude),
      )
    }
  }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i,
        b = a + segments + 1
      tris.push(a, b, a + 1, a + 1, b, b + 1)
    }
  return { pts: new Float32Array(pts), tris: new Uint32Array(tris) }
}

/** A physical rectangular blade, using the chamber frame and device roll. */
export function blade(
  start: Vec3,
  end: Vec3,
  pose: Pose,
  width: number,
  thickness: number,
  rotation: number,
): MeshGeometry {
  const a = (rotation * Math.PI) / 180,
    frame = axes(pose)
  const u = add(scale(frame[0], Math.cos(a)), scale(frame[1], Math.sin(a)))
  const v = add(scale(frame[0], -Math.sin(a)), scale(frame[1], Math.cos(a)))
  const pts: number[] = []
  for (const p of [start, end])
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ])
      pts.push(...add(p, add(scale(u, (x * width) / 2), scale(v, (y * thickness) / 2))))
  return {
    pts: new Float32Array(pts),
    tris: new Uint32Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 4, 1, 5, 4, 1, 2, 5, 2, 6, 5, 2, 3, 6, 3, 7, 6, 3, 0, 7, 0, 4,
      7,
    ]),
  }
}
