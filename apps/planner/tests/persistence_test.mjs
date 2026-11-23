import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { createAsset } from '../src/data/assets.ts'
import { createProject, addAssembly } from '@brainana/planning-core/model.ts'
import { packProject, unpackProject } from '../src/data/archive.ts'
import { IndexedDbPersistence, SaveQueue } from '../src/data/persistence.ts'
import { ProjectStore } from '../src/state/store.ts'
const payload = new Uint8Array([1, 2, 3, 4, 5]),
  asset = await createAsset('test.nii', 'anatomy', 'frame', payload)
const project = createProject(asset, 'Test', {
  kind: 'standalone',
  subject: null,
  scan: null,
  sourceRoot: null,
})
addAssembly(project, [11, 22, 33])
project.chambers[0].pose.angles = [12.345, 23.456, 34.567]
project.electrodes[0].depth = 45.6789
const bundle = { project, bytes: new Map([[asset.id, payload]]) }
const reopened = await unpackProject(await packProject(project, bundle.bytes))
assert.deepEqual(reopened, bundle)
console.log('  ok - portable project round-trips image bytes and full-precision geometry')
const changed = structuredClone(bundle)
changed.bytes.set(asset.id, new Uint8Array([0]))
await assert.rejects(packProject(project, changed.bytes), /checksum/)
await assert.rejects(unpackProject(new Uint8Array([1, 2, 3])), /zip/i)
console.log('  ok - corrupted payloads and invalid archives fail explicitly')
const db = new IndexedDbPersistence()
await db.save(bundle)
assert.deepEqual(await db.load(), bundle)
console.log('  ok - IndexedDB restores project and images atomically')
const records = [],
  queue = new SaveQueue({
    save: async (b) => {
      await new Promise((r) => setTimeout(r, b.project.name === 'first' ? 20 : 1))
      records.push(b.project.name)
    },
    load: async () => null,
    clear: async () => {
      records.push('clear')
    },
  })
const a = structuredClone(bundle),
  b = structuredClone(bundle)
a.project.name = 'first'
b.project.name = 'second'
await Promise.all([queue.save(a), queue.save(b)])
assert.deepEqual(records, ['first', 'second'])
console.log('  ok - save queue prevents an older slow write overwriting a newer project')
const store = new ProjectStore()
store.replace(project)
store.edit((p) => {
  p.electrodes[0].depth = 70
})
assert.equal(store.project.electrodes[0].depth, 70)
store.undo()
assert.deepEqual(store.project, project)
store.redo()
assert.equal(store.project.electrodes[0].depth, 70)
const before = store.project
assert.throws(() =>
  store.edit((p) => {
    p.electrodes[0].hole = [90, 90]
  }),
)
assert.deepEqual(store.project, before)
console.log('  ok - undo/redo preserves geometry and rejected edits leave state untouched')

const constrained = structuredClone(bundle)
constrained.project.avoidRegions = [
  { id: 'avoid', name: 'Avoid', frameId: project.frame.id, center: [1.25, 2.5, 3.75], radius: 2.3 },
]
constrained.project.planning = {
  mode: 'existing',
  seed: [11, 22, 33],
  searchRadius: 10,
  searchStep: 2,
  maxMiss: 0.3,
  margin: 1.5,
}
assert.deepEqual(await unpackProject(await packProject(constrained.project, constrained.bytes)), constrained)
await db.save(constrained)
assert.deepEqual(await db.load(), constrained)
console.log('  ok - planning modes and avoidance geometry survive portable archive and autosave round-trips')

constrained.project.avoidRegions[0].points = [
  [1.25, 2.5, 3.75],
  [4, 5, 6],
  [7, 5, 6],
]
assert.deepEqual(await unpackProject(await packProject(constrained.project, constrained.bytes)), constrained)
console.log('  ok - continuous avoidance brush geometry round-trips with full physical coordinates')

const clearing = new SaveQueue(db)
await clearing.save(bundle)
await clearing.clear()
assert.equal(await db.load(), null)
store.clear()
assert.equal(store.project, null)
assert.equal(store.canUndo, false)
assert.equal(store.canRedo, false)
console.log('  ok - new project clears persisted assets and editing history')

const outerProject=structuredClone(project)
outerProject.assets[0].modality='ct'
outerProject.assets[0].imageDisplay={min:0,max:1000,opacity:.85,colormap:'cool',visible:true,skull:{threshold:300,bounds:[[-15,-15,-15],[15,15,15]],spacingMm:.4,components:'largest',representation:'outer',center:[0,0,0],componentSeed:[9,0,0],show:true,useForPlanning:true}}
outerProject.planningSurfaceIds=[outerProject.assets[0].id]
const outerReload=await unpackProject(await packProject(outerProject,bundle.bytes))
assert.deepEqual(outerReload.project.assets[0].imageDisplay.skull,outerProject.assets[0].imageDisplay.skull)
console.log('  ok - outer skull center, selected component and native sampling round-trip in portable projects')

const {openingSurfaceKey}=await import('../../../packages/planning-core/skull-surface.ts')
const edited=structuredClone(outerProject),skull=edited.assets[0].imageDisplay.skull
skull.edits=[{mode:'erase',normal:2,thicknessMm:.4,radius:1.5,points:[[0,0,10],[1,0,10]]},{mode:'restore',normal:2,thicknessMm:.4,radius:.5,points:[[0,0,10]]}]
edited.surfaceOpenings=[{constraint:'soft',normal:[0,0,1],patch:{pts:[0,0,10,1,0,10,0,1,10],tris:[0,1,2]},measurement:{diameter:2.4,minimumWidth:2.3,maximumWidth:2.6,resolutionMm:.25,source:'ct'},id:'opening-review',name:'Reviewed opening',frameId:edited.frame.id,assetId:edited.assets[0].id,assetSha256:edited.assets[0].sha256,surfaceKey:openingSurfaceKey(skull),center:[0,0,10],radius:2,origin:'manual',reviewed:true,avoid:true}]
const editedReload=await unpackProject(await packProject(edited,bundle.bytes))
assert.deepEqual(editedReload.project.surfaceOpenings,edited.surfaceOpenings);assert.deepEqual(editedReload.project.assets[0].imageDisplay.skull.edits,skull.edits)
console.log('  ok - physical brush corrections and reviewed opening entities round-trip in portable projects')
const filled=structuredClone(project)
filled.avoidRegions=[{id:'filled',name:'Surface stamps',frameId:filled.frame.id,center:[1,2,3],radius:1,points:[[1,2,3]],stamps:[[1,2,3],[1.5,2,3],[2,2,3]],drawingMode:'surface',constraint:'soft'}]
const filledReload=await unpackProject(await packProject(filled,bundle.bytes))
assert.deepEqual(filledReload.project.avoidRegions,filled.avoidRegions)
console.log('  ok - filled / surface-snapped avoidance stamps and priorities survive portable project round-trip')
const angled=structuredClone(project)
Object.assign(angled.grids[0],{tiltAngle:12,tiltAzimuth:135,seatHeight:1,minimumThickness:2,holeDiameter:.8,angleSearch:{maximum:15,step:5,azimuthStep:30}})
const angledReload=await unpackProject(await packProject(angled,bundle.bytes))
assert.deepEqual(angledReload.project.grids,angled.grids)
const angledStore=new ProjectStore();angledStore.replace(angled);angledStore.edit(d=>{d.grids[0].tiltAngle=15});angledStore.undo();assert.equal(angledStore.project.grids[0].tiltAngle,12);angledStore.redo();assert.equal(angledStore.project.grids[0].tiltAngle,15)
console.log('  ok - independent grid angle, seat, wedge, bore and design-search bounds round-trip and support Undo/Redo')
