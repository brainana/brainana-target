import assert from 'node:assert/strict'
import {Worker as NodeWorker} from 'node:worker_threads'
import {paintSurface,resetSurfacePainter} from '../src/render/paintSurface.ts'
import {surfacePatch} from '../../../packages/planning-core/surface-patch.ts'
import {snapAvoidance} from '../src/render/snapAvoidance.ts'
import {avoidanceKey} from '../src/render/avoidanceKey.ts'
const messages=[],old=globalThis.Worker
class BrowserWorker{
 constructor(url){this.worker=new NodeWorker(`const {parentPort,workerData}=require('node:worker_threads');globalThis.self={postMessage:data=>parentPort.postMessage(data)};import(workerData.url).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true,workerData:{url:url.href}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({message:error.message}))}
 postMessage(data){messages.push(data);this.worker.postMessage(data)}
 terminate(){void this.worker.terminate()}
}
globalThis.Worker=BrowserWorker
try{
 const surface={pts:[-10,-10,0,10,-10,0,10,10,0,-10,10,0],tris:[0,1,2,0,2,3]},points=[[0,0,1]],normal=[0,0,1],centers=snapAvoidance(points,[],2,[surface],normal)
 let ticks=0;const timer=setInterval(()=>ticks++,1)
 const first=await paintSurface([surface],points,[],2,normal);clearInterval(timer)
 assert.deepEqual(first.centers,centers);assert.deepEqual(first.patch,surfacePatch([surface],centers,2));assert.ok(ticks>0,'UI event loop remains responsive during real worker execution')
 await paintSurface([surface],[[2,0,1]],[],2,normal);assert.ok(messages[0].surfaces);assert.equal(messages[1].surfaces,undefined,'Subsequent strokes reuse worker skull geometry')
 const resized=await paintSurface([surface],first.centers,[],3,normal,true);assert.deepEqual(resized.patch,surfacePatch([surface],centers,3))
 await assert.rejects(paintSurface([surface],[[0,0,100]],[],2,normal),/No planning surface/)
 const pending=paintSurface([surface],points,[],2,normal);resetSurfacePainter();await assert.rejects(pending,{name:'AbortError'})
 const region={id:'r',name:'R',center:[0,0,0],radius:2,surfacePatch:first.patch,points:[[0,0,0]]}
 const initial=avoidanceKey([region]),stringify=JSON.stringify
 first.patch.toJSON=()=>{throw new Error('Mesh must never be serialized during frame-cache lookup')}
 assert.equal(avoidanceKey([region]),initial);assert.ok(initial.length<150)
 assert.notEqual(avoidanceKey([{...region,radius:3}]),initial)
 assert.equal(JSON.stringify,stringify)
 resetSurfacePainter()
 globalThis.Worker=class{postMessage(){throw new DOMException('Cannot clone input','DataCloneError')}terminate(){}}
 await assert.rejects(paintSurface([surface],points,[],2,normal),{name:'DataCloneError'})
 resetSurfacePainter()
 globalThis.Worker=BrowserWorker
 const recovered=await paintSurface([surface],points,[],2,normal)
 assert.deepEqual(recovered.patch,surfacePatch([surface],centers,2),'A failed worker send must reset transport and permit the next stroke')
 console.log('Real surface worker: first-stroke result, responsive event loop, skull reuse, radius updates, error recovery, cancellation and mesh-free frame cache passed.')
}finally{resetSurfacePainter();globalThis.Worker=old}
