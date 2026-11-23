import type { Vec3 } from '@brainana/planning-core/model.ts'

const corners = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]]
const tetrahedra = [[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6],[0,5,1,6]]
/** Precompute the same oriented tetrahedra once, rather than allocating objects per voxel. */
const cases = Array.from({ length: 256 }, (_, code) => {
  const triangles: number[] = []
  for (const tet of tetrahedra) {
    const inside = tet.filter(index => code & (1 << index))
    const outside = tet.filter(index => !(code & (1 << index)))
    if (!inside.length || !outside.length) continue
    const outward = [0,1,2].map(k => outside.reduce((sum, i) => sum + corners[i][k], 0) / outside.length
      - inside.reduce((sum, i) => sum + corners[i][k], 0) / inside.length)
    const edge = (a: number, b: number) => a * 8 + b
    const midpoint = (pair: number) => corners[Math.floor(pair / 8)].map((v, k) => (v + corners[pair % 8][k]) / 2)
    const triangle = (a: number, b: number, c: number) => {
      const p = midpoint(a), q = midpoint(b), r = midpoint(c)
      const u = q.map((v, k) => v - p[k]), v = r.map((n, k) => n - p[k])
      const direction = (u[1]*v[2]-u[2]*v[1])*outward[0] + (u[2]*v[0]-u[0]*v[2])*outward[1] + (u[0]*v[1]-u[1]*v[0])*outward[2]
      triangles.push(...(direction >= 0 ? [a,b,c] : [a,c,b]))
    }
    if (inside.length === 1 || outside.length === 1) {
      const single = inside.length === 1 ? inside[0] : outside[0]
      const others = inside.length === 1 ? outside : inside
      triangle(edge(single, others[0]), edge(single, others[1]), edge(single, others[2]))
    } else {
      const a = edge(inside[0], outside[0]), b = edge(inside[0], outside[1])
      const c = edge(inside[1], outside[1]), d = edge(inside[1], outside[0])
      triangle(a,b,c)
      triangle(a,c,d)
    }
  }
  return triangles
})

/** Fixed-size output chunks avoid large boxed arrays and repeated whole-mesh reallocations. */
class MeshBuffer {
  readonly chunks: Array<Float32Array | Uint32Array> = []
  length = 0
  readonly kind: typeof Float32Array | typeof Uint32Array
  constructor(kind: typeof Float32Array | typeof Uint32Array) { this.kind = kind }
  push(value: number): void {
    const chunk = Math.floor(this.length / 65536), offset = this.length % 65536
    if (!this.chunks[chunk]) this.chunks.push(new this.kind(65536))
    this.chunks[chunk][offset] = value
    this.length++
  }
  finish(): Float32Array | Uint32Array {
    const result = new this.kind(this.length)
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i]
      result.set(chunk.subarray(0, Math.min(chunk.length, this.length - i * 65536)), i * 65536)
    }
    this.chunks.length = 0
    return result
  }
}

/** Marching tetrahedra at the binary-mask boundary; edge ownership is limited to two z planes. */
export function maskIsosurface(
  mask: Uint8Array, dims: number[], lo: Vec3, hi: Vec3, step: number, openCrop = false,
  progress?: (message: string) => void,
) {
  const [nx, ny, nz] = dims, px = nx + 2, plane = px * (ny + 2), maskPlane = nx * ny
  const points = new MeshBuffer(Float32Array), triangles = new MeshBuffer(Uint32Array)
  const min = [nx,ny,nz], max = [-1,-1,-1]
  let index = 0
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++, index++) {
    if (!mask[index]) continue
    if (x < min[0]) min[0] = x
    if (x > max[0]) max[0] = x
    if (y < min[1]) min[1] = y
    if (y > max[1]) max[1] = y
    if (z < min[2]) min[2] = z
    if (z > max[2]) max[2] = z
  }
  const coordinate = (v: number, axis: number): number => {
    if (v < 0) return lo[axis] - Math.min(step, hi[axis] - lo[axis]) / 2
    if (v >= dims[axis]) return hi[axis] + (hi[axis] - lo[axis] - (dims[axis] - 1) * step) / 2
    return lo[axis] + v * step + Math.min(step, hi[axis] - lo[axis] - v * step) / 2
  }
  const positions = dims.map((n, k) => Float64Array.from({ length: n + 2 }, (_, i) => coordinate(i - 1, k)))
  const ids = new Float64Array(8), xyz = new Float64Array(24), midpoint = new Float64Array(9)
  const directions = new Map([1, px, px+1, plane, plane+1, plane+px, plane+px+1].map((difference, i) => [difference, i]))
  let lower = new Map<number, number>(), upper = new Map<number, number>()
  for (let z = min[2] - 1; z <= max[2]; z++) {
    const spanning = new Map<number, number>()
    const vertex = (edge: number, slot: number): number => {
      const a = Math.floor(edge / 8), b = edge % 8
      const first = Math.min(ids[a], ids[b]), difference = Math.abs(ids[a] - ids[b])
      const cache = corners[a][2] !== corners[b][2] ? spanning : corners[a][2] === 0 ? lower : upper
      // The seven possible positive lattice offsets avoid multiplying two large voxel IDs.
      const key = first * 7 + directions.get(difference)!
      let value = cache.get(key)
      if (value === undefined) {
        value = points.length / 3
        points.push(midpoint[slot]); points.push(midpoint[slot+1]); points.push(midpoint[slot+2])
        cache.set(key, value)
      }
      return value
    }
    for (let y = min[1] - 1; y <= max[1]; y++) for (let x = min[0] - 1; x <= max[0]; x++) {
      let code = 0
      if (x >= 0 && x + 1 < nx && y >= 0 && y + 1 < ny && z >= 0 && z + 1 < nz) {
        const i = x + y * nx + z * maskPlane
        code = mask[i] | (mask[i+1] << 1) | (mask[i+nx+1] << 2) | (mask[i+nx] << 3)
          | (mask[i+maskPlane] << 4) | (mask[i+maskPlane+1] << 5)
          | (mask[i+maskPlane+nx+1] << 6) | (mask[i+maskPlane+nx] << 7)
      } else {
        for (let k = 0; k < 8; k++) {
          const a = x + corners[k][0], b = y + corners[k][1], c = z + corners[k][2]
          if (a >= 0 && b >= 0 && c >= 0 && a < nx && b < ny && c < nz && mask[a + b * nx + c * maskPlane]) code |= 1 << k
        }
      }
      if (code === 0 || code === 255) continue
      for (let k = 0; k < 8; k++) {
        const a = x + corners[k][0], b = y + corners[k][1], c = z + corners[k][2]
        ids[k] = a + 1 + (b + 1) * px + (c + 1) * plane
        xyz[3*k] = positions[0][a+1]; xyz[3*k+1] = positions[1][b+1]; xyz[3*k+2] = positions[2][c+1]
      }
      const faces = cases[code]
      for (let t = 0; t < faces.length; t += 3) {
        for (let j = 0; j < 3; j++) {
          const edge = faces[t+j], a = Math.floor(edge / 8), b = edge % 8
          for (let k = 0; k < 3; k++) midpoint[3*j+k] = (xyz[3*a+k] + xyz[3*b+k]) / 2
        }
        let cap = false
        if (openCrop) for (let k = 0; k < 3; k++)
          if ((Math.abs(midpoint[k] - lo[k]) < 1e-5 && Math.abs(midpoint[3+k] - lo[k]) < 1e-5 && Math.abs(midpoint[6+k] - lo[k]) < 1e-5)
            || (Math.abs(midpoint[k] - hi[k]) < 1e-5 && Math.abs(midpoint[3+k] - hi[k]) < 1e-5 && Math.abs(midpoint[6+k] - hi[k]) < 1e-5)) cap = true
        if (cap) continue
        triangles.push(vertex(faces[t],0)); triangles.push(vertex(faces[t+1],3)); triangles.push(vertex(faces[t+2],6))
      }
    }
    lower = upper
    upper = new Map<number, number>()
    if ((z - min[2] + 1) % 8 === 0)
      progress?.(`Building CT mesh · ${Math.round(100 * (z - min[2] + 2) / (max[2] - min[2] + 2))}% · ${(triangles.length/3).toLocaleString()} triangles…`)
  }
  return { pts: points.finish() as Float32Array, tris: triangles.finish() as Uint32Array }
}
