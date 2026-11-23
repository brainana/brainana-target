import assert from 'node:assert/strict'
import { NVImage } from '@niivue/niivue'
import { VolumeSampler } from '../src/render/volume.ts'
import { indexAtlasRegions } from '../src/render/atlasRegions.ts'
const data = new Uint8Array(64)
// Disconnected voxels have a centroid outside their own region.
data[0] = data[63] = 7
data[21] = 8
for (const affine of [
  [2, 0, 0, 10, 0, 3, 0, 20, 0, 0, 4, 30, 0, 0, 0, 1],
  [-2, 0, 0, 10, 0, 3, 0, 20, 0, 0, 4, 30, 0, 0, 0, 1],
]) {
  const image = await NVImage.loadFromUrl({
    url: NVImage.createNiftiArray([4, 4, 4], [2, 3, 4], affine, 2, data),
    name: 'atlas.nii',
  })
  const volume = new VolumeSampler(image)
  const regions = indexAtlasRegions(volume, new Map([[7, { id: 7, name: 'Seven', region: '', hemi: '' }]]))
  assert.equal(regions.length, 2)
  for (const region of regions) assert.equal(volume.sample(region.point, true), region.label.id)
  assert.equal(regions.find((r) => r.label.id === 7).count, 2)
  assert.equal(regions.find((r) => r.label.id === 8).label.name, 'Label 8')
}
console.log(
  '  ok - atlas navigation preserves physical coordinates and chooses a member voxel when a centroid is outside the region',
)
