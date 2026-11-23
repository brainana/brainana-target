import assert from 'node:assert/strict'
import {Worker} from 'node:worker_threads'
import {createProject,addAssembly} from '@brainana/planning-core/model.ts'
import {addDirectElectrode} from '@brainana/planning-core/electrode-frame.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
import {searchDirect} from '@brainana/planning-core/direct-placement.ts'
import {hardwareCatalog,applyHardwarePreset} from '../src/hardware/catalog.ts'
const request=async(data)=>{
 const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');globalThis.self={postMessage:data=>parentPort.postMessage(data)};import(workerData.url).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true,workerData:{url:new URL('../src/features/targetingWorker.ts',import.meta.url).href}})
 try{return await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(data)})}finally{await worker.terminate()}
}
const p=createProject({id:'a',name:'MRI',role:'anatomy',modality:'mri',frameId:'f',sha256:'a'.repeat(64),sourcePath:null},'Worker',{kind:'standalone',subject:null,scan:null,sourceRoot:null});p.planningIntent='direct';const e=addDirectElectrode(p);applyHardwarePreset(e,hardwareCatalog.find(x=>x.id==='utah'));e.length=1.5;e.hardware.shankLengths=[];e.depth=0;p.targets=[{id:'t',name:'Target',point:[0,0,-8],frameId:'f',color:'#ffffff',atlas:null}];p.planning={mode:'new',seed:null,searchRadius:10,searchStep:2,maxMiss:.5,margin:0}
const data={project:p,electrode:e.id,target:'t',options:{surface:new Float32Array([0,0,0,10,0,0]),accessPoint:[0,0,0]}},found=await request(data)
assert.equal(found.kind,'result');assert.deepEqual(found.value,searchDirect(p,e.id,'t',data.options));assert.equal(found.value.candidates.length,1)
const placed=await request({...data,candidate:found.value.candidates[0]});assert.equal(placed.kind,'result');validateProject(placed.value);assert.equal(placed.value.chambers.length,0);assert.equal(placed.value.electrodes[0].direct.unplaced,false);assert.equal(p.electrodes[0].direct.unplaced,true)
const failure=await request({...data,target:'missing'});assert.equal(failure.kind,'error');assert.match(failure.message,/target/)
const chamber=structuredClone(p);chamber.electrodes=[];addAssembly(chamber,[0,0,10]);const c=chamber.chambers[0],g=chamber.grids[0],device=chamber.electrodes[0];Object.assign(c,{innerRadius:5,wallThickness:2,height:8,placementState:'unplaced'});Object.assign(g,{minimumThickness:2,tiltAngle:30,seating:'flush',enabled:true});device.targetId='t';chamber.planning.searchStep=15
const plane={pts:new Float32Array([-40,-40,0,40,-40,0,-40,40,0,40,40,0]),tris:new Uint32Array([0,1,2,1,3,2])}
const result=await request({project:chamber,electrode:device.id,target:'t',options:{surface:plane.pts,supportSurfaces:[plane],supportSource:'skull',supportAssetIds:['a'],expand:true}});assert.equal(result.kind,'result');assert.ok(result.value.candidates.length,JSON.stringify(result.value)+'Actual worker can fit the example chamber with a seated 30° grid')
console.log('Actual background worker: direct Utah search/apply, independent immutable project, error protocol and a supported 10/2/8 chamber with 30° grid passed.')
