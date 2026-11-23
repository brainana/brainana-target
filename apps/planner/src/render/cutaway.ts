import { mat4 } from 'gl-matrix'
import type { Vec3 } from '@brainana/planning-core/model.ts'
import type { MeshGeometry } from './primitives.ts'
import type { VolumeSampler } from './volume.ts'
export interface Cutaway {
  axis: 0 | 1 | 2 | null
  position: number
  keepHigher: boolean
  clipHardware: boolean
  showSection: boolean
  sectionOpacity: number
}
export const defaultCutaway = (): Cutaway => ({
  axis: null,
  position: 0,
  keepHigher: false,
  clipHardware: false,
  showSection: true,
  sectionOpacity: 0.9,
})

/** World RAS millimetres: retained side has nonnegative signed distance. */
export function worldClipPlane(cut: Cutaway): [number, number, number, number] {
  if (cut.axis === null) return [0, 0, 0, 1]
  const plane: [number, number, number, number] = [0, 0, 0, 0]
  const sign = cut.keepHigher ? 1 : -1
  plane[cut.axis] = sign
  plane[3] = -sign * cut.position
  return plane
}
function voxelMatrix(volume: VolumeSampler): mat4 {
  return mat4.transpose(mat4.create(), volume.image.matRAS!)
}
/** Bounding box includes oblique, flipped and anisotropic images; no assumed voxel orientation. */
export function anatomyBounds(volume: VolumeSampler): { min: Vec3; max: Vec3 } {
  const m = voxelMatrix(volume),
    min: Vec3 = [Infinity, Infinity, Infinity],
    max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const x of [-0.5, volume.dims[0] - 0.5])
    for (const y of [-0.5, volume.dims[1] - 0.5])
      for (const z of [-0.5, volume.dims[2] - 0.5])
        for (let a = 0; a < 3; a++) {
          const value = m[a] * x + m[4 + a] * y + m[8 + a] * z + m[12 + a]
          min[a] = Math.min(min[a], value)
          max[a] = Math.max(max[a], value)
        }
  return { min, max }
}
/** Convert a world plane to NiiVue's texture-space depth / azimuth / elevation convention. */
export function volumeClipPlane(volume: VolumeSampler, cut: Cutaway): number[] {
  if (cut.axis === null) return [2, 0, 0]
  const a = cut.axis,
    m = voxelMatrix(volume),
    sign = cut.keepHigher ? 1 : -1
  const normal = [m[a] * volume.dims[0], m[4 + a] * volume.dims[1], m[8 + a] * volume.dims[2]].map(
    (v) => v * sign,
  )
  const magnitude = Math.hypot(...normal)
  const center =
    m[a] * (volume.dims[0] / 2 - 0.5) +
    m[4 + a] * (volume.dims[1] / 2 - 0.5) +
    m[8 + a] * (volume.dims[2] / 2 - 0.5) +
    m[12 + a]
  const n = normal.map((v) => v / magnitude)
  return [
    (sign * (center - cut.position)) / magnitude,
    (Math.atan2(-n[0], n[1]) * 180) / Math.PI,
    (-Math.asin(Math.max(-1, Math.min(1, n[2]))) * 180) / Math.PI,
  ]
}
/** A sampled MRI plane in world space; vertex colours avoid extra GPU texture state. */
export function anatomicalSection(
  volume: VolumeSampler,
  cut: Cutaway,
  size = 128,
): MeshGeometry & { rgba: Uint8Array } {
  if (cut.axis === null) throw new Error('Choose a cut plane before creating an anatomical section.')
  const bounds = anatomyBounds(volume),
    axes = [0, 1, 2].filter((a) => a !== cut.axis)
  const pts = new Float32Array(size * size * 3),
    rgba = new Uint8Array(size * size * 4),
    tris: number[] = []
  const lo = volume.image.cal_min ?? 0,
    hi = volume.image.cal_max ?? 1
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const point: Vec3 = [0, 0, 0]
      point[cut.axis] = cut.position
      point[axes[0]] = bounds.min[axes[0]] + ((bounds.max[axes[0]] - bounds.min[axes[0]]) * x) / (size - 1)
      point[axes[1]] = bounds.min[axes[1]] + ((bounds.max[axes[1]] - bounds.min[axes[1]]) * y) / (size - 1)
      const i = x + y * size,
        value = volume.sample(point)
      const gray = Number.isFinite(value)
        ? Math.max(0, Math.min(255, (255 * (value - lo)) / Math.max(1e-8, hi - lo)))
        : 0
      pts.set(point, i * 3)
      rgba.set([gray, gray, gray, Number.isFinite(value) && gray > 1 ? 255 : 0], i * 4)
      if (x < size - 1 && y < size - 1)
        tris.push(
          i,
          i + 1,
          i + size,
          i + 1,
          i + size + 1,
          i + size,
          i + size,
          i + 1,
          i,
          i + size,
          i + size + 1,
          i + 1,
        )
    }
  return { pts, tris: new Uint32Array(tris), rgba }
}
// vP is the mesh vertex in world RAS coordinates supplied by NiiVue's mesh vertex shader.
export const clippedMeshShader = `#version 300 es
precision highp float;
uniform float opacity;
uniform vec4 cutPlane;
in vec4 vClr;
in vec3 vN;
in vec4 vP;
out vec4 color;
void main() {
  if (dot(cutPlane, vP) < 0.0) discard;
  vec3 n = normalize(vN), l = normalize(vec3(0.0, 10.0, -5.0));
  float specular = 0.2 * pow(max(dot(reflect(l, n), vec3(0.0, 0.0, 1.0)), 0.0), 10.0);
  color = vec4(vClr.rgb * (0.35 + 0.5 * max(dot(n, l), 0.0)) + specular, opacity);
}`
export const sectionMeshShader = `#version 300 es
precision highp float;
uniform float opacity;
in vec4 vClr;
out vec4 color;
void main() {
  if (vClr.a < 0.5) discard;
  color = vec4(vClr.rgb, opacity);
}`
