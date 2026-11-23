import assert from 'node:assert/strict'
import {Worker as NodeWorker} from 'node:worker_threads'
import {unzipSync,strFromU8} from 'fflate'
import {createProject,addAssembly} from '@brainana/planning-core/model.ts'
import {createAsset} from '../src/data/assets.ts'
import {runIO} from '../src/data/ioTasks.ts'
import {geometryBundle} from '../src/data/geometryExport.ts'
import {coordinateCsv,planReport} from '../src/data/export.ts'
import {packProject} from '../src/data/archive.ts'
const workers=[],old=globalThis.Worker
class BrowserWorker{
 constructor(url){this.worker=new NodeWorker(`const {parentPort,workerData}=require('node:worker_threads');globalThis.self={postMessage:(data,options)=>parentPort.postMessage(data,options?.transfer)};import(workerData.url).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true,workerData:{url:url.href}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({message:error.message}));workers.push(this)}
 postMessage(data){this.worker.postMessage(data)}
 terminate(){this.terminated=true;void this.worker.terminate()}
}
globalThis.Worker=BrowserWorker
const bytes=new Uint8Array([1,2,3,4]),asset=await createAsset('MRI.nii','anatomy','frame',bytes)
const project=createProject(asset,'Background',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(project,[0,0,10])
Object.assign(project.chambers[0],{innerRadius:2,height:4});Object.assign(project.grids[0],{minimumThickness:1,holeDiameter:.8,spacing:1.3,count:3,tiltAngle:0})
const surfaces=[{pts:new Float32Array([-4,-4,0,4,-4,0,0,4,0]),tris:new Uint32Array([0,1,2])}]
const equalArchive=(a,b)=>{const aa=unzipSync(a),bb=unzipSync(b);assert.deepEqual(Object.keys(aa),Object.keys(bb));for(const name of Object.keys(aa))assert.deepEqual(aa[name],bb[name],name)}
try{
 let ticks=0;const progress=[],timer=setInterval(()=>ticks++,1)
 const meshes=await runIO({kind:'geometry',project,surfaces},{progress:label=>progress.push(label)});clearInterval(timer)
 assert.ok(ticks>0,'The UI event loop stays responsive while actual background export executes')
 equalArchive(meshes,geometryBundle(project,surfaces));assert.ok(progress.some(label=>/guide grid/.test(label)));assert.ok(progress.some(label=>/Packaging/.test(label)))
 const payloads=new Map([[asset.id,bytes]]),archive=await runIO({kind:'project',bundle:{project,bytes:payloads}})
 equalArchive(archive,await packProject(project,payloads));assert.equal(bytes.byteLength,4,'Saving must not detach source image buffers')
 const reopened=await runIO({kind:'open',archive});assert.deepEqual(reopened,{project,bytes:payloads});assert.ok(archive.byteLength>0,'Opening must not detach caller-owned archive bytes')
 assert.equal(await runIO({kind:'coordinates',project}),coordinateCsv(project))
 assert.equal(await runIO({kind:'report',project,screenshot:null}),planReport(project,null))
 const bad=new Map([[asset.id,new Uint8Array([0])]])
 await assert.rejects(runIO({kind:'project',bundle:{project,bytes:bad}}),/checksum/)
 assert.ok(workers.every(worker=>worker.terminated),'Success and failure must release their workers')
 const aborted=new AbortController();aborted.abort();const count=workers.length
 await assert.rejects(runIO({kind:'coordinates',project},{signal:aborted.signal}),{name:'AbortError'});assert.equal(workers.length,count)
 const controller=new AbortController(),pending=runIO({kind:'geometry',project,surfaces},{signal:controller.signal})
 const cancelled=assert.rejects(pending,{name:'AbortError'});controller.abort();await cancelled;assert.equal(workers.at(-1).terminated,true)
 assert.equal(JSON.parse(strFromU8(unzipSync(archive)['project.json'])).name,project.name)
 console.log(`Background I/O: geometry/archive byte parity, coordinate/report parity, ${ticks} responsive event-loop ticks, staged progress, source buffers retained, portable reopen, errors and cancellation passed.`)
}finally{for(const worker of workers)worker.terminate();globalThis.Worker=old}
