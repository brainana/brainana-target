import assert from 'node:assert/strict'
import { chooseAnatomy } from '../src/data/brainana.ts'
import { importBookmarks } from '../src/data/bookmarks.ts'
import { coordinateRows, coordinateCsv, planReport } from '../src/data/export.ts'
import { createProject, addAssembly } from '@brainana/planning-core/model.ts'
const m = {
  scan: { stream: 'cross' },
  fullFov: { url: 'full.nii' },
  volumes: [{ key: 'mri/norm.mgz', url: 'norm.mgz' }],
}
assert.equal(chooseAnatomy(m), 'full.nii')
assert.equal(chooseAnatomy({ ...m, fullFov: null }), 'norm.mgz')
assert.throws(() => chooseAnatomy({ ...m, scan: { stream: 'base' } }), /single scan session/)
console.log('  ok - physical scan and full-FOV selection avoid longitudinal template substitution')
const asset = {
  id: 'image',
  name: 'anatomy.nii.gz',
  role: 'anatomy',
  frameId: 'frame',
  sha256: 'a'.repeat(64),
  sourcePath: 'sub-1/anat/anatomy.nii.gz',
}
const project = createProject(asset, '<script>test</script>', {
  kind: 'brainana',
  subject: 'sub-1',
  scan: 'sub-1_ses-1',
  sourceRoot: '/dataset',
})
addAssembly(project, [0, 0, 30])
const report = {
  dataset: { subjectId: 'sub-1', scan: { id: 'sub-1_ses-1' } },
  files: [{ role: 'base volume', path: asset.sourcePath }],
  bookmarks: [{ label: 'Target', readout: { mm: [1, 2, 3] } }],
}
assert.deepEqual(importBookmarks(report, project)[0].point, [1, 2, 3])
assert.throws(
  () => importBookmarks({ ...report, dataset: { subjectId: 'sub-2' } }, project),
  /does not match/,
)
assert.throws(() => importBookmarks({ ...report, files: [] }, project), /reference volume/)
console.log('  ok - viewer bookmarks require matching subject, scan and reference volume')
assert.equal(coordinateRows(project)[0].length, coordinateRows(project)[1].length)
assert.ok(coordinateCsv(project).includes('depth_from_grid_mm'))
assert.ok(!planReport(project, null).includes('<script>test</script>'))
assert.ok(planReport(project, null).includes('\\u003cscript>'))
console.log('  ok - coordinate exports include frame provenance and report content is escaped')

const constrained = structuredClone(project)
constrained.avoidRegions = [
  { id: 'avoid', name: 'Avoid', frameId: project.frame.id, center: [1, 2, 3], radius: 2.5 },
]
const regionRows = coordinateRows(constrained)
assert.ok(regionRows.every((row) => row.length === regionRows[0].length))
assert.equal(regionRows.find((row) => row[0] === 'avoidance_region').at(-1), 2.5)
assert.ok(planReport(constrained, null).includes('marked regions and electrode width'))
console.log('  ok - avoidance CSV rows retain radius, provenance and consistent columns')
