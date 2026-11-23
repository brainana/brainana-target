import type { MeshGeometry } from './primitives.ts'
/** Flat RAS endpoint pairs for a cardinal section through the exact triangle mesh. */
export function surfaceContours(mesh: MeshGeometry, normal: number, position: number): number[] {
  return classifiedSurfaceContours(mesh, normal, position).detected
}
/** Classify sections in one triangle pass so inferred patches retain their provenance in slices. */
export function classifiedSurfaceContours(mesh: MeshGeometry, normal: number, position: number, reconstructed?: Uint8Array) {
  const detected: number[] = [], inferred: number[] = [], p = mesh.pts, t = mesh.tris
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    const da = p[a + normal] - position, db = p[b + normal] - position, dc = p[c + normal] - position
    if (Math.min(da, db, dc) >= 0 || Math.max(da, db, dc) < 0) continue
    const hits: number[] = []
    for (const [v, w, d, e] of [[a, b, da, db], [b, c, db, dc], [c, a, dc, da]]) {
      if ((d < 0) === (e < 0)) continue
      const fraction = d / (d - e)
      for (let k = 0; k < 3; k++) hits.push(p[v + k] + fraction * (p[w + k] - p[v + k]))
    }
    if (hits.length === 6) (reconstructed?.[i / 3] ? inferred : detected).push(...hits)
  }
  return { detected, reconstructed: inferred }
}
