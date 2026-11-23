import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {unzipSync} from 'fflate'
import {NVImage} from '@niivue/niivue'
import {fitMask,compareTracks,plannedTracks,clipTrackToMask,readMorphometry,cortexDistance} from '../src/evaluation/geometry.ts'
import {nmtEntryKind,readNmtEntries} from '../src/evaluation/nmt.ts'
import {VolumeSampler} from '../src/render/volume.ts'
import {closestTriangle} from '@brainana/planning-core/surface-fit.ts'
import {addAssembly,createProject} from '@brainana/planning-core/model.ts'
import {createAsset} from '../src/data/assets.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
const values=new Int16Array(5*5*9);for(let z=1;z<8;z++)values[(z*5+2)*5+2]=10
const affine=[0,2,0,0,-3,0,0,0,0,0,.5,0,10,20,30,1]
const fit=fitMask({dims:[5,5,9],values,matrix:affine,slope:1,intercept:0})
assert.equal(fit.count,7)
assert.deepEqual(fit.start,[4,24,30.5]);assert.deepEqual(fit.tip,[4,24,33.5]);assert.equal(fit.rmsMm,0)
const xyz=[...fit.mesh.pts].filter((_,i)=>i%3===2);assert.equal(Math.min(...xyz),30.25);assert.equal(Math.max(...xyz),33.75)
assert.throws(()=>fitMask({dims:[5,5,9],values:new Uint8Array(values.length),matrix:affine,slope:1,intercept:0}),/two positive/)
const p={id:'p',name:'A',start:[0,0,0],tip:[0,0,-10],target:[0,0,-10]}
const a={start:[3,0,-2],tip:[3,0,-12]}
const result=compareTracks(p,a);assert.equal(result.axialTipErrorMm,2);assert.equal(result.lateralTipErrorMm,3);assert.ok(Math.abs(result.tipErrorMm-Math.sqrt(13))<1e-12);assert.equal(result.directionErrorDegrees,0)
assert.equal(compareTracks(p,{tip:a.start,start:a.tip}).directionErrorDegrees,180)
assert.equal(compareTracks(p,{start:[0,0,0],tip:[10,0,0]}).directionErrorDegrees,90)
assert.deepEqual(clipTrackToMask({start:[0,0,0],tip:[10,0,0]},([x])=>x>=3&&x<=7?1:0,.5),{start:[3,0,0],tip:[7,0,0]})
assert.deepEqual(cortexDistance([.25,.25,1],[0,0,0,1,0,0,0,1,0],[0,1,2],closestTriangle),{point:[.25,.25,0],distanceMm:1})
const bytes=new Uint8Array([1,2,3]),asset=await createAsset('ref.nii','anatomy','frame',bytes)
const project=createProject(asset,'Evaluation fixture',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(project,[0,0,10])
assert.deepEqual(plannedTracks(project)[0].tip,[0,0,-20])
const archive=await packProject(project,new Map([[asset.id,bytes]]))
assert.deepEqual(plannedTracks((await unpackProject(archive)).project),plannedTracks(project))
project.chambers[0].placementState='unplaced';assert.equal(plannedTracks(project).length,0)
assert.equal(nmtEntryKind('NMT/sub-X_space-T1w_desc-Probe_mask.nii.gz'),null)
assert.equal(nmtEntryKind('NMT/nmt_electrode_viewer_v16/launch.py'),null)
assert.throws(()=>readNmtEntries({}),/exactly one/)
console.log('Evaluation: affine-aware mask fit and mesh, ordered endpoints, signed tip error, angle, cortical distance, clipping and saved-plan extraction passed.')
if(process.env.NMT_TEST_ZIP){
 const files=readNmtEntries(unzipSync(new Uint8Array(await readFile(process.env.NMT_TEST_ZIP)),{filter:f=>!!nmtEntryKind(f.name)}))
 const load=async f=>new VolumeSampler(await NVImage.loadFromFile({file:new File([f.bytes],f.name),name:f.name}))
 const reference=await load(files.find(f=>f.kind==='anatomy'))
 const brain=await load(files.find(f=>f.kind==='brainmask'))
 const tracks=files.filter(f=>f.kind==='mask')
 assert.ok(tracks.length>=6)
 for(const f of tracks){
  const s=await load(f),fit=fitMask({dims:s.dims,values:s.values,matrix:s.voxelToWorld,slope:s.slope,intercept:s.intercept})
  for(const p of [fit.start,fit.tip])assert.ok(reference.voxel(p).every((v,i)=>v>=-.5&&v<=reference.dims[i]-.5),f.name)
  assert.ok(clipTrackToMask(fit,p=>brain.sample(p,true),.125),f.name)
 }
 assert.equal(files.filter(f=>f.kind==='white'||f.kind==='pial').length,4)
 for(const f of files.filter(f=>f.kind==='curv'||f.kind==='sulc'))assert.ok(readMorphometry(f.bytes).length>1000)
 console.log(`Actual NMT-share ZIP: ${tracks.length} tracks fit and clip inside template space, four surfaces and four morphometry files identified; non-template masks and viewer code skipped.`)
}
