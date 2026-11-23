import { mat4 } from 'gl-matrix'
import { NVImage } from '@niivue/niivue'
import type { Vec3 } from '@brainana/planning-core/model.ts'
import { trilinear } from '@brainana/planning-core/reslice.ts'
/** Converts the renderer's RAS voxel lattice into a pure world-space sampler, once per load. */
export class VolumeSampler {
  readonly dims: Vec3
  readonly voxelToWorld:mat4
  readonly worldToVoxel: mat4
  readonly values: ArrayLike<number>
  readonly slope: number
  readonly intercept: number
  readonly image: NVImage
  constructor(image: NVImage, spatialOnly = false) {
    this.image = image
    if (!image.hdr || !image.matRAS || !image.dimsRAS || !image.img)
      throw new Error('Anatomy has no valid spatial transform')
    if (!spatialOnly && image.hdr.dims.slice(4).some((n) => n > 1))
      throw new Error('Load a 3D anatomical volume, not a time series')
    if (![2, 4, 8, 16, 64, 256, 512, 768].includes(image.hdr.datatypeCode))
      throw new Error('Unsupported scalar anatomical datatype')
    const units = image.hdr.xyzt_units & 7
    if (units !== 2 && units !== 0)
      throw new Error('Anatomical image must use millimetres. Convert its spatial units before import.')
    const m = spatialTransform(image)
    this.voxelToWorld=m
    const inverse = mat4.invert(mat4.create(), m)
    if (!inverse) throw new Error('Anatomy has a singular spatial transform')
    this.worldToVoxel = inverse
    this.dims = image.dimsRAS.slice(1, 4) as Vec3
    this.values = spatialOnly ? [] : image.img2RAS()
    this.slope = image.hdr.scl_slope || 1
    this.intercept = image.hdr.scl_slope ? image.hdr.scl_inter : 0
  }
  voxel(p: Vec3): Vec3 {
    const m = this.worldToVoxel
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ]
  }
  voxelAt(p:Vec3):{center:Vec3;axes:[Vec3,Vec3,Vec3]}|null{
    const ijk=this.voxel(p).map(Math.round)
    if(ijk.some((v,k)=>v<0||v>=this.dims[k]))return null
    const m=this.voxelToWorld,axes:[Vec3,Vec3,Vec3]=[[m[0],m[1],m[2]],[m[4],m[5],m[6]],[m[8],m[9],m[10]]]
    return {center:[0,1,2].map(k=>m[12+k]+axes.reduce((s,a,i)=>s+a[k]*ijk[i],0)) as Vec3,axes}
  }
  sample(p: Vec3, nearest = false): number {
    const v = this.voxel(p),
      [nx, ny, nz] = this.dims
    const value = (x: number, y: number, z: number): number =>
      Number(this.values[x + y * nx + z * nx * ny]) * this.slope + this.intercept
    if (nearest) {
      const [x, y, z] = v.map(Math.round)
      return x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? NaN : value(x, y, z)
    }
    return trilinear(v, this.dims, value)
  }
}

/** Read the affine without reorienting/copying the image's voxel buffer. */
function spatialTransform(image: NVImage): mat4 {
  if (!image.matRAS) throw new Error('Anatomy has no valid spatial transform')
  const matrix = mat4.clone(image.matRAS)
  mat4.transpose(matrix, matrix)
  if (!Array.from(matrix).every(Number.isFinite) || Math.abs(mat4.determinant(matrix)) < 1e-12)
    throw new Error('Anatomy has a singular spatial transform')
  return matrix
}
/** Finest physical voxel spacing, independent of RAS reorientation. */
export function nativeSurfaceSpacing(image: NVImage): number {
  const matrix = spatialTransform(image)
  return Math.min(...[0, 4, 8].map(i => Math.hypot(matrix[i], matrix[i+1], matrix[i+2])))
}
