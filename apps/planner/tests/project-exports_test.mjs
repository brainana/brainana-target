import assert from 'node:assert/strict'
import {createProject} from '@brainana/planning-core/model.ts'
import {ProjectStore} from '../src/state/store.ts'
class Element extends EventTarget{constructor(){super();this.children=[];this.style={}}append(...items){this.children.push(...items)}setAttribute(name,value){this[name]=value}}
globalThis.document={createElement:()=>new Element(),createTextNode:text=>({textContent:text})}
const {projectExports}=await import('../src/features/projectExports.ts')
const {activity}=await import('../src/ui/activity.ts')
const workers=[],previous=globalThis.Worker
class Worker{constructor(){workers.push(this)}postMessage(request){this.request=request}terminate(){this.terminated=true}result(value){this.onmessage({data:{kind:'result',value}})}}
globalThis.Worker=Worker
const wait=async predicate=>{for(let i=0;i<1000;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,1))}throw Error('Worker did not start')}
const project=createProject({id:'image',name:'MRI',role:'anatomy',frameId:'frame',sha256:'a'.repeat(64),sourcePath:null},'Original',{kind:'standalone',subject:null,scan:null,sourceRoot:null}),store=new ProjectStore();store.replace(project)
const data=new Uint8Array([1,2,3]),downloads=[],messages=[]
let preview=false,screenshots=0
const exports=projectExports({project:()=>store.project,bytes:()=>new Map([['image',data],['unused',new Uint8Array(100)]]),surfaces:()=>[],preview:()=>preview,screenshot:()=>{screenshots++;return 'picture'},download:(...args)=>downloads.push(args),status:text=>messages.push(text)})
try{
 const first=exports.coordinates();store.edit(p=>{p.name='Renamed'})
 await wait(()=>workers[0]?.request)
 assert.equal(workers[0].request.project.name,'Original','Export captures its plan before yielding to user interactions')
 workers[0].onmessage({data:{kind:'progress',label:'Writing coordinates…'}});assert.equal(activity.textContent,'Writing coordinates…')
 workers[0].result('csv');await first;assert.equal(downloads[0][0],'Original-coordinates.csv');assert.equal(activity.hidden,true)
 const a=exports.geometry(),b=exports.geometry();await wait(()=>workers[1]?.request);assert.equal(workers.length,2,'Repeated clicks reuse the in-flight export')
 workers[1].result(new Uint8Array([1]));await Promise.all([a,b]);assert.equal(downloads.length,2)
 const saving=exports.save();await wait(()=>workers[2]?.request);assert.deepEqual([...workers[2].request.bundle.bytes.keys()],['image'],'Packing skips orphaned image payloads');workers[2].result(new Uint8Array([2]));await saving
 assert.equal(data.byteLength,3)
 const stopped=exports.report();await wait(()=>workers[3]?.request);const rejected=assert.rejects(stopped,{name:'AbortError'});exports.cancel();await rejected
 workers[3].result('late report');assert.equal(downloads.length,3,'A cancelled export cannot download a late result');assert.equal(activity.hidden,true)
 preview=true;const count=workers.length;await assert.rejects(exports.report(),/Apply or cancel/);assert.equal(workers.length,count);assert.equal(screenshots,1)
 assert.ok(messages.some(m=>m==='Portable project downloaded'))
 console.log('Export actions: coherent snapshots/names, staged progress, duplicate suppression, orphan-payload exclusion, cancellation and preview/report guard passed.')
}finally{exports.cancel();globalThis.Worker=previous}
