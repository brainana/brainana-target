import {packProject} from '../src/data/archive.ts'
import {createAsset} from '../src/data/assets.ts'
import {unzipSync,strFromU8} from 'fflate'
import assert from 'node:assert/strict'
import {createProject,addAssembly} from '../../../packages/planning-core/model.ts'
import {validateProject} from '../../../packages/planning-core/validation.ts'
import {importChamberDefinition} from '../src/data/chamberImport.ts'
const make=()=>createProject({id:crypto.randomUUID(),name:'MRI',role:'anatomy',frameId:crypto.randomUUID(),sha256:'a'.repeat(64),sourcePath:null},'Task',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
const source=make();addAssembly(source,[10,20,30]);source.planningIntent='chamber';source.chambers[0].name='Saved implant'
for(const intent of ['chamber','electrode','combined'])assert.equal(validateProject({...source,planningIntent:intent}).planningIntent,intent)
assert.equal(validateProject({...source,planningIntent:undefined}).planningIntent,undefined)
assert.throws(()=>validateProject({...source,planningIntent:'unknown'}),/planning task/)
const destination=make(), imported=importChamberDefinition(destination,source)
assert.equal(imported.planningIntent,'electrode');assert.equal(imported.planning.mode,'existing');assert.deepEqual(imported.chambers[0].pose.origin,[10,20,30]);assert.equal(imported.chambers[0].frameId,destination.frame.id);assert.equal(imported.grids[0].chamberId,imported.chambers[0].id);assert.equal(imported.electrodes.length,0);assert.equal(destination.chambers.length,0);assert.notEqual(imported.chambers[0].id,source.chambers[0].id)
assert.throws(()=>importChamberDefinition(imported,source),/already defined/)
const wrong=make();wrong.assets[0].sha256='b'.repeat(64);assert.throws(()=>importChamberDefinition(wrong,source),/different reference/)
const unplaced=structuredClone(source);unplaced.chambers[0].placementState='unplaced';assert.equal(importChamberDefinition(destination,unplaced).chambers[0].placementState,'unplaced')
console.log('Planning tasks validate and preserve legacy projects; chamber import retains measured pose, remaps IDs, rejects mismatched references and never invents an electrode or placed state.')

const payload=new Uint8Array([1,2,3]),asset=await createAsset('MRI','anatomy','f',payload),portable=createProject(asset,'Portable chamber',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(portable,[1,2,3]);portable.planningIntent='chamber'
const archive=unzipSync(await packProject(portable,new Map([[asset.id,payload]]))),table=JSON.parse(strFromU8(archive['dimensions-and-coordinates.json'])),fresh=createProject({...asset,id:crypto.randomUUID(),frameId:'new-frame'},'Later electrode',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
assert.deepEqual(importChamberDefinition(fresh,table).chambers[0].pose.origin,[1,2,3]);delete table.referenceSha256;assert.throws(()=>importChamberDefinition(fresh,table),/checksum/)
console.log('Portable coordinate JSON imports a chamber using matching image checksum and remapped frame IDs; older unverified tables require the original project.')
