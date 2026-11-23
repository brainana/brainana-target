import assert from 'node:assert/strict'
import { NVImage } from '@niivue/niivue'
import { VolumeSampler } from '../src/render/volume.ts'
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`)
const dims = [4, 4, 4]
const data = Float32Array.from(
  { length: 64 },
  (_, i) => (i % 4) + ((2 * Math.floor(i / 4)) % 8) + 3 * Math.floor(i / 16),
)
// Use an analytical signal in native voxel indices with an anisotropic, translated affine.
for (let z = 0; z < 4; z++)
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) data[x + y * 4 + z * 16] = x + 2 * y + 3 * z
for (const affine of [
  [2, 0, 0, 10, 0, 3, 0, 20, 0, 0, 4, 30, 0, 0, 0, 1],
  [-2, 0, 0, 10, 0, 3, 0, 20, 0, 0, 4, 30, 0, 0, 0, 1],
  [0, -3, 0, 10, 2, 0, 0, 20, 0, 0, 4, 30, 0, 0, 0, 1],
]) {
  const bytes = NVImage.createNiftiArray(dims, [2, 3, 4], affine, 16, new Uint8Array(data.buffer))
  const image = await NVImage.loadFromUrl({ url: bytes, name: 'test.nii' })
  const sampler = new VolumeSampler(image),
    v = [1.25, 1.5, 1.75]
  const world = [
    affine[0] * v[0] + affine[1] * v[1] + affine[2] * v[2] + affine[3],
    affine[4] * v[0] + affine[5] * v[1] + affine[6] * v[2] + affine[7],
    affine[8] * v[0] + affine[9] * v[1] + affine[10] * v[2] + affine[11],
  ]
  near(sampler.sample(world), 1.25 + 2 * 1.5 + 3 * 1.75)
  assert.ok(Number.isNaN(sampler.sample([1000, 1000, 1000])))
}
console.log(
  '  ok - actual NiiVue image sampling preserves anisotropic, flipped and permuted NIfTI world coordinates',
)
const bytes = NVImage.createNiftiArray(dims, [1, 1, 1], undefined, 16, new Uint8Array(data.buffer))
const image = await NVImage.loadFromUrl({ url: bytes, name: 'test.nii' })
image.hdr.xyzt_units = 1
assert.throws(() => new VolumeSampler(image), /millimetres/)
console.log('  ok - unsupported spatial units are rejected before planning')

const voxelImage=await NVImage.loadFromUrl({url:NVImage.createNiftiArray([5,5,5],[1,2,3],[1,0,0,10,0,2,0,-20,0,0,3,30,0,0,0,1],16,new Uint8Array(new Float32Array(125).buffer)),name:'voxel geometry'})
const sampler=new VolumeSampler(voxelImage),m=sampler.voxelToWorld,ijk=[1.2,2.1,2.8],point=[0,1,2].map(k=>m[k]*ijk[0]+m[4+k]*ijk[1]+m[8+k]*ijk[2]+m[12+k]),cell=sampler.voxelAt(point)
assert.ok(cell);sampler.voxel(cell.center).forEach((v,k)=>near(v,Math.round(ijk[k])));assert.equal(sampler.voxelAt([1e6,1e6,1e6]),null)
console.log('Reference-cell selection snaps to native anisotropic image centres and rejects points outside the image.')
