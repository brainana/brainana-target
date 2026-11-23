import type { TriangleSurface } from '@brainana/planning-core/surface-fit.ts'
/** Binary STL writes fixed-size records without allocating vectors for every triangle. */
export function binarySTL(mesh: TriangleSurface): Uint8Array {
  const count = mesh.tris.length / 3, bytes = new Uint8Array(84 + count * 50), view = new DataView(bytes.buffer), points = mesh.pts
  view.setUint32(80, count, true)
  for (let i = 0; i < count; i++) {
    const a = mesh.tris[i * 3] * 3, b = mesh.tris[i * 3 + 1] * 3, c = mesh.tris[i * 3 + 2] * 3
    const ux = points[b] - points[a], uy = points[b + 1] - points[a + 1], uz = points[b + 2] - points[a + 2]
    const vx = points[c] - points[a], vy = points[c + 1] - points[a + 1], vz = points[c + 2] - points[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz) || 1
    const offset = 84 + i * 50
    view.setFloat32(offset, nx / length, true); view.setFloat32(offset + 4, ny / length, true); view.setFloat32(offset + 8, nz / length, true)
    for (let k = 0; k < 3; k++) {
      view.setFloat32(offset + 12 + k * 4, points[a + k], true)
      view.setFloat32(offset + 24 + k * 4, points[b + k], true)
      view.setFloat32(offset + 36 + k * 4, points[c + k], true)
    }
  }
  return bytes
}
