import type { TriangleSurface } from '@brainana/planning-core/surface-fit.ts'
import type { Vec3 } from '@brainana/planning-core/model.ts'
/** Structural checks, not a registration, watertightness or anatomical correctness guarantee. */
export function inspectSurface(mesh: TriangleSurface) {
  const { pts, tris } = mesh
  const bounds: [Vec3, Vec3] = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]]
  let invalidVertices = 0, invalidTriangles = 0, degenerateTriangles = 0
  for (let i = 0; i < pts.length; i += 3) {
    if (!Number.isFinite(pts[i]) || !Number.isFinite(pts[i+1]) || !Number.isFinite(pts[i+2])) { invalidVertices++; continue }
    for (let axis = 0; axis < 3; axis++) { bounds[0][axis] = Math.min(bounds[0][axis], pts[i+axis]); bounds[1][axis] = Math.max(bounds[1][axis], pts[i+axis]) }
  }
  for (let i = 0; i < tris.length; i += 3) {
    const ia = tris[i], ib = tris[i+1], ic = tris[i+2]
    if (!Number.isInteger(ia) || !Number.isInteger(ib) || !Number.isInteger(ic)
      || ia < 0 || ib < 0 || ic < 0 || ia >= pts.length/3 || ib >= pts.length/3 || ic >= pts.length/3) { invalidTriangles++; continue }
    const a = ia*3, b = ib*3, c = ic*3
    const ux = pts[b]-pts[a], uy = pts[b+1]-pts[a+1], uz = pts[b+2]-pts[a+2]
    const vx = pts[c]-pts[a], vy = pts[c+1]-pts[a+1], vz = pts[c+2]-pts[a+2]
    if (Math.hypot(uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx) < 1e-10) degenerateTriangles++
  }
  const valid = pts.length >= 9 && pts.length % 3 === 0 && tris.length >= 3 && tris.length % 3 === 0 && !invalidVertices && !invalidTriangles && degenerateTriangles < tris.length / 3
  return { valid, vertices: pts.length / 3, triangles: tris.length / 3, invalidVertices, invalidTriangles, degenerateTriangles, bounds }
}
