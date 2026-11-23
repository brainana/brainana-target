import assert from 'node:assert/strict'
import { NVImage } from '@niivue/niivue'
import { VolumeSampler } from '../src/render/volume.ts'
import {
  anatomyBounds,
  worldClipPlane,
  volumeClipPlane,
  anatomicalSection,
  defaultCutaway,
} from '../src/render/cutaway.ts'
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`)
const data = Float32Array.from(
  { length: 64 },
  (_, i) => (i % 4) + 2 * (Math.floor(i / 4) % 4) + 3 * Math.floor(i / 16),
)
for (const affine of [
  [2, 0, 0, 10, 0, 3, 0, 20, 0, 0, 4, 30, 0, 0, 0, 1],
  [-2, 0, 0, 10, 0, 3, 0, 20, 0, 0, 4, 30, 0, 0, 0, 1],
  [0, -3, 0, 10, 2, 0, 0, 20, 0, 0, 4, 30, 0, 0, 0, 1],
  [1.6, -1.8, 0, 10, 1.2, 2.4, 0, 20, 0, 0, 4, 30, 0, 0, 0, 1],
]) {
  const bytes = NVImage.createNiftiArray([4, 4, 4], [2, 3, 4], affine, 16, new Uint8Array(data.buffer))
  const image = await NVImage.loadFromUrl({ url: bytes, name: 'cutaway.nii' }),
    volume = new VolumeSampler(image)
  const bounds = anatomyBounds(volume)
  for (let axis = 0; axis < 3; axis++)
    for (const keepHigher of [true, false]) {
      const cut = {
        ...defaultCutaway(),
        axis,
        position: (bounds.min[axis] + bounds.max[axis]) / 2,
        keepHigher,
      }
      const plane = worldClipPlane(cut),
        [depth, azimuth, elevation] = volumeClipPlane(volume, cut)
      const theta = ((azimuth + 90) * Math.PI) / 180,
        phi = (-elevation * Math.PI) / 180
      const normal = [Math.cos(phi) * Math.cos(theta), Math.cos(phi) * Math.sin(theta), Math.sin(phi)]
      for (const f of [
        [0.2, 0.3, 0.4],
        [0.8, 0.7, 0.6],
      ]) {
        const m = image.matRAS,
          v = f.map((x, i) => x * volume.dims[i] - 0.5)
        const world = [0, 1, 2].map(
          (a) => m[a * 4] * v[0] + m[a * 4 + 1] * v[1] + m[a * 4 + 2] * v[2] + m[a * 4 + 3],
        )
        const worldDistance = plane[axis] * world[axis] + plane[3]
        const textureDistance = normal.reduce((n, x, i) => n + x * (f[i] - 0.5), depth)
        assert.equal(textureDistance >= 0, worldDistance >= 0, 'mesh and volume keep the same physical side')
      }
      const section = anatomicalSection(volume, cut, 9)
      assert.equal(section.pts.length, 9 * 9 * 3)
      for (let i = 0; i < 81; i++) near(section.pts[i * 3 + axis], cut.position)
      assert.ok(section.rgba.some((v, i) => i % 4 === 3 && v === 255))
      // The centre passes through native voxel [1.5,1.5,1.5]: analytical intensity is 9.
      near(section.rgba[40 * 4], Math.floor((255 * (9 - image.cal_min)) / (image.cal_max - image.cal_min)))
      // Every section triangle has a reverse winding for viewing from either side.
      for (let i = 0; i < section.tris.length; i += 12)
        assert.deepEqual(
          Array.from(section.tris.slice(i, i + 3)).reverse(),
          Array.from(section.tris.slice(i + 6, i + 9)),
        )
    }
}
assert.deepEqual(worldClipPlane(defaultCutaway()), [0, 0, 0, 1])
console.log(
  '  ok - all cardinal cutaways keep matching world / texture sides across translated, anisotropic, flipped, permuted and oblique anatomy',
)
console.log(
  '  ok - MRI section samples the correct physical plane and intensity, with transparent background and two-sided triangles',
)
