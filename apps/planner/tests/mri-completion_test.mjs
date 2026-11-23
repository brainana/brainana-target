import assert from 'node:assert/strict'
import { mat4, vec3 } from 'gl-matrix'
import { NVImage } from '@niivue/niivue'
import { completeRadialBoundary } from '../src/render/radialCompletion.ts'
import { mriSurface } from '../src/render/mriSurface.ts'
import { boundaryVoxels, boundaryLabel } from '../src/render/boundaryVoxels.ts'
import { VolumeSampler } from '../src/render/volume.ts'
import { SurfaceRayIndex } from '../../../packages/planning-core/surface-rays.ts'
import { createProject } from '../../../packages/planning-core/model.ts'
import { validateProject } from '../../../packages/planning-core/validation.ts'
import { createAsset } from '../src/data/assets.ts'
import { mriBoundaryAssets } from '../src/data/mriBoundaryAssets.ts'
import { packProject, unpackProject } from '../src/data/archive.ts'

const completion = { enabled: true, maximumGapMm: 10, smoothness: .5 }
function grid(missing, protect = () => false) {
  const rings = 80, segments = 160, n = 2 + (rings - 1) * segments, directions = new Float32Array(n * 3), radii = new Float64Array(n), state = new Uint8Array(n), expected = new Float64Array(n)
  let i = 0
  const add = (x, y, z) => { directions.set([x, y, z], i * 3); expected[i] = 20 + 2 * x + 1.5 * y * y - 1.2 * x * z; radii[i] = missing(x, y, z) ? NaN : expected[i]; state[i] = protect(x, y, z) ? 2 : missing(x, y, z) ? 0 : 1; i++ }
  add(0, 0, 1)
  for (let r = 1; r < rings; r++) for (let s = 0; s < segments; s++) { const t = Math.PI * r / rings, p = 2 * Math.PI * s / segments; add(Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)) }
  add(0, 0, -1)
  return { rings, segments, radius: 23, spacingMm: .5, directions, radii, state, expected }
}
// Analytic curved radius field: fill a seam-crossing gap and a polar gap while
// leaving every trusted measurement exactly unchanged. A planar cap is insufficient.
for (const missing of [(x) => x > .989, (_x, _y, z) => z > .994]) {
  const g = grid(missing), before = g.radii.slice(), original = g.state.slice(), report = completeRadialBoundary(g, completion)
  assert.equal(report.bridgedGaps, 1); assert.ok(g.state.some(s => s === 3))
  for (let i = 0; i < g.state.length; i++) {
    if (original[i] === 1) assert.equal(g.radii[i], before[i], 'Detected points remain anchored')
    if (g.state[i] === 3) assert.ok(Math.abs(g.radii[i] - g.expected[i]) < .04, `Curved fit error ${g.radii[i] - g.expected[i]} mm at ${i}`)
  }
}
for (const [missing, protect, max] of [[x => x > .5, () => false, 10], [x => x > .989, () => false, 1], [x => x > .989, (x, y) => x > .98 && y > .14, 10]]) {
  const g = grid(missing, protect), report = completeRadialBoundary(g, { ...completion, maximumGapMm: max })
  assert.equal(report.bridgedGaps, 0); assert.ok(!g.state.some(s => s === 3), 'Large gaps and gaps beside protected cuts remain open')
}
const disabled = grid(x => x > .989), original = disabled.state.slice(); completeRadialBoundary(disabled, { ...completion, enabled: false }); assert.deepEqual(disabled.state, original)
const spike = grid(() => false), spikeIndex = 1 + 39 * 160 + 40; spike.radii[spikeIndex] += 12
const spikeReport = completeRadialBoundary(spike, completion); assert.equal(spikeReport.outliers, 1); assert.equal(spike.state[spikeIndex], 3); assert.ok(Math.abs(spike.radii[spikeIndex] - spike.expected[spikeIndex]) < .04)

const radius = p => Math.hypot(...p), brain = { sample: p => Number(radius(p) <= 10) }
const image = { sample: p => { const r = radius(p); return r <= 10 ? 100 : r < 12 ? 5 : r < 14 ? 180 : 0 } }
const dropout = { sample: p => p[0] > 0 && Math.hypot(p[1], p[2]) / radius(p) < .12 && radius(p) > 10 ? 0 : image.sample(p) }
const settings = { sourceAssetId: 'MRI', method: 'dark-band-head', offsetMm: 0, threshold: 50, spacingMm: .5, largest: true, fillHoles: true, smooth: true, bounds: [[-20, -20, -20], [20, 20, 20]], darkBand: { maximumIntensity: 30, searchMm: 10, minimumWidthMm: .5, maximumWidthMm: 5, minimumScalpMm: 1, center: [0, 0, 0], completion } }
const open = mriSurface(dropout, { ...settings, darkBand: { ...settings.darkBand, completion: { ...completion, enabled: false } } }), closed = mriSurface(dropout, settings)
assert.equal(new SurfaceRayIndex([{ ...open, outerEnvelope: true }]).distance([20, 0, 0], [-1, 0, 0], 100, true), Infinity)
assert.ok(Math.abs(new SurfaceRayIndex([{ ...closed, outerEnvelope: true }]).distance([20, 0, 0], [-1, 0, 0], 100, true) - 8) < .4, 'Reconstructed shell is usable on the near side for placement')
assert.ok(closed.report.darkBand.reconstructed > 0); assert.ok(closed.reconstructedFaces.some(Boolean)); assert.equal(closed.reconstructedFaces.length, closed.tris.length / 3)
for (let i = 0; i < closed.pts.length; i += 3) assert.ok(Math.abs(radius(closed.pts.subarray(i, i + 3)) - 12) < .4)
const masked = mriSurface(dropout, { ...settings, method: 'dark-band', threshold: .5 }, brain)
assert.ok(masked.report.darkBand.reconstructed > 0, 'Both direct MRI and brain-guided methods support reconstruction')
const erased = mriSurface(dropout, { ...settings, edits: [{ mode: 'erase', normal: 2, thicknessMm: 3, radius: 3, points: [[12, 0, 0]] }] })
assert.equal(new SurfaceRayIndex([{ ...erased, outerEnvelope: true }]).distance([20, 0, 0], [-1, 0, 0], 100, true), Infinity, 'Reconstruction respects erased patches')
const cropped = mriSurface(image, { ...settings, bounds: [[-20, -20, -20], [11, 20, 20]] })
assert.equal(new SurfaceRayIndex([{ ...cropped, outerEnvelope: true }]).distance([20, 0, 0], [-1, 0, 0], 100, true), Infinity, 'Crop edges cannot become invented mounting surfaces')

const identityGrid = { dims: [81, 81, 81], matrix: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 40, 40, 40, 1] }
const boundary = boundaryVoxels(closed, identityGrid, closed.reconstructedFaces)
assert.equal(boundaryLabel(boundary, [0, 0, 0]), 0, 'A boundary overlay must not fill the brain volume')
assert.equal(boundaryLabel(boundary, [12, 0, 0]), 2); assert.equal(boundaryLabel(boundary, [-12, 0, 0]), 1)
assert.equal(boundaryLabel(boundary, [10, 0, 0]), 0); assert.equal(boundaryLabel(boundary, [14, 0, 0]), 0)
assert.ok(boundary.labels.filter(Boolean).length < boundary.labels.length * .3)
const reopenedImage = await NVImage.loadFromUrl({ url: boundary.file, name: 'boundary.nii.gz' }), sampled = new VolumeSampler(reopenedImage)
assert.equal(sampled.sample([12, 0, 0], true), 2); assert.equal(sampled.sample([-12, 0, 0], true), 1); assert.equal(sampled.sample([0, 0, 0], true), 0)
// Oblique, anisotropic, translated source image: the sheet and NIfTI must agree in world space.
const affine = mat4.fromZRotation(mat4.create(), .63); mat4.scale(affine, affine, [2, .7, 1.3]); affine[12] = -25; affine[13] = 13; affine[14] = -9
const world = ijk => Array.from(vec3.transformMat4(vec3.create(), ijk, affine)), transform = mat4.invert(mat4.create(), affine)
const plane = { pts: Float32Array.from([[10, 7, 7], [10, 13, 7], [10, 13, 13], [10, 7, 13]].flatMap(world)), tris: new Uint32Array([0, 1, 2, 0, 2, 3]) }
const oblique = boundaryVoxels(plane, { dims: [21, 21, 21], matrix: transform }, new Uint8Array([1, 1]))
assert.equal(boundaryLabel(oblique, world([10, 10, 10])), 2); assert.equal(boundaryLabel(oblique, world([11, 10, 10])), 0)
const obliqueImage = new VolumeSampler(await NVImage.loadFromUrl({ url: oblique.file, name: 'oblique-boundary.nii.gz' }))
assert.equal(obliqueImage.sample(world([10, 10, 10]), true), 2); assert.ok(Number.isNaN(obliqueImage.sample(world([11, 10, 10]), true)), 'Outside the cropped sheet image, no boundary is present')

// Repeated finalization replaces one mesh + one label image; project reopening retains both.
const mri = await createAsset('MRI.nii', 'anatomy', 'f', new Uint8Array([1])), project = createProject(mri, 'Completed boundary', { kind: 'standalone', subject: null, scan: null, sourceRoot: null })
const save = { geometry: closed, boundary, settings: { ...settings, sourceAssetId: mri.id } }
const first = await mriBoundaryAssets(project, new Map([[mri.id, new Uint8Array([1])]]), save)
assert.equal(project.assets.length, 1, 'Preparing a finalized update does not change the live project')
validateProject(first.project)
const second = await mriBoundaryAssets(first.project, first.bytes, save)
assert.equal(second.project.assets.length, 3); assert.deepEqual(second.project.assets.map(a => a.id), first.project.assets.map(a => a.id))
assert.ok(second.project.assets.find(a => a.role === 'overlay').imageDisplay.visible)
const restored = await unpackProject(await packProject(second.project, second.bytes)); assert.deepEqual(restored.project, second.project)
const invalid = structuredClone(second.project); invalid.assets.find(a => a.mriSurface).mriSurface.darkBand.completion.maximumGapMm = 100; assert.throws(() => validateProject(invalid), /number outside supported range/)
const missingFile = structuredClone(second.project); missingFile.assets = missingFile.assets.filter(a => a.role !== 'overlay'); assert.throws(() => validateProject(missingFile), /missing MRI boundary voxel/)
console.log('MRI completion: curved/seam/polar reconstruction, anchored observations, spike removal, gap limits, protected crop/erase, placement support, native-grid thin voxel fill, oblique NIfTI alignment and atomic save/reopen passed.')
