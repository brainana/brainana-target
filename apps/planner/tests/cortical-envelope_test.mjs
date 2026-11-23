import assert from 'node:assert/strict'
import { corticalEnvelope } from '../src/render/corticalEnvelope.ts'
import { mriSurface } from '../src/render/mriSurface.ts'
import { inspectSurface } from '../src/render/surfaceInspection.ts'
import { sphere } from '../src/render/primitives.ts'
import { SurfaceRayIndex } from '@brainana/planning-core/surface-rays.ts'
import { createProject } from '@brainana/planning-core/model.ts'
import { validateProject } from '@brainana/planning-core/validation.ts'
import { corticalEnvelopeAsset } from '../src/data/mriBoundaryAssets.ts'

const hemispheres = [sphere([-6, 0, 0], 4), sphere([6, 0, 0], 4)]
const envelope = corticalEnvelope(hemispheres, 0)
assert.ok(inspectSurface(envelope).valid)
assert.equal(inspectSurface(envelope).degenerateTriangles, 0)
const edges = new Map()
for(let i=0;i<envelope.tris.length;i+=3) for(let k=0;k<3;k++) {
  const a = envelope.tris[i+k], b = envelope.tris[i+(k+1)%3]
  const id = [Math.min(a,b), Math.max(a,b)].join(',')
  edges.set(id,(edges.get(id)??0)+1)
}
assert.ok([...edges.values()].every(count=>count===2), 'The boundary closes around both hemispheres')
const ray = new SurfaceRayIndex([envelope])
const bridge = ray.distance([0,0,20],[0,0,-1],Infinity,true)
assert.ok(bridge > 15 && bridge < 16.1, 'The superior surface spans the gap between hemispheres')
const expanded = new SurfaceRayIndex([corticalEnvelope(hemispheres, 2)])
assert.ok(Math.abs(bridge - expanded.distance([0,0,20],[0,0,-1],Infinity,true) - 2) < .05)

const mask = {sample: ([x,y,z]) => Number((Math.abs(x)-5)**2 + y*y + z*z <= 16)}
const recipe = {sourceAssetId:'a', method:'brain-envelope', offsetMm:0, threshold:.5, spacingMm:1,
  largest:false, fillHoles:false, smooth:false, bounds:[[-12,-6,-6],[12,6,6]]}
const fromMask = mriSurface(mask,recipe)
assert.ok(fromMask.reconstructedFaces.every(value=>value===1))
assert.ok(new SurfaceRayIndex([fromMask]).distance([0,0,20],[0,0,-1],Infinity,true) < 17)
assert.throws(()=>mriSurface(mask,{...recipe,bounds:[[-6,-6,-6],[12,6,6]]}),/crop edge/)

const asset = {id:'a',name:'mri.nii',role:'anatomy',modality:'mri',frameId:'frame',sha256:'a'.repeat(64),sourcePath:null}
const p = createProject(asset,'Brain envelope',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
p.assets.push(...['left','right'].map(id=>({...asset,id,name:id+'.gii',role:'surface',surfaceKind:'brain'})))
const saved = await corticalEnvelopeAsset(p,new Map(),{geometry:envelope,sourceAssetIds:['left','right'],offsetMm:0})
const envelopeAsset = saved.project.assets.at(-1)
assert.deepEqual(validateProject(saved.project).planningSurfaceIds,[envelopeAsset.id])
assert.deepEqual(envelopeAsset.corticalEnvelope.sourceAssetIds,['left','right'])
assert.ok(saved.bytes.get(envelopeAsset.id).length > 80)
assert.equal(p.assets.length,3)
console.log('Cortical envelope bridges folds, is outward and watertight, applies offset, handles crop limits, and saves as a separate surface.')
