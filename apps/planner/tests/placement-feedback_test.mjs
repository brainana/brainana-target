import assert from 'node:assert/strict'
import {createProject,addAssembly} from '@brainana/planning-core/model.ts'
import {ProjectStore} from '../src/state/store.ts'
class Element extends EventTarget {
 constructor(tag='div'){super();this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attributes=new Map();this.value='';this.textContent='';this.classList={toggle:()=>{},add:()=>{},remove:()=>{}}}
 get isConnected(){return this===globalThis.document.body||!!this.parent?.isConnected}
 get options(){return this.children.filter(c=>c.tagName==='option')}
 get valueAsNumber(){return Number(this.value)}
 set valueAsNumber(v){this.value=String(v)}
 append(...nodes){for(const n of nodes){this.children.push(n);if(typeof n==='object')n.parent=this}}
 replaceChildren(...nodes){for(const n of this.children)if(typeof n==='object')n.parent=null;this.children=[];this.append(...nodes)}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null}
 closest(){return null}
 contains(node){return this===node||this.children.some(n=>typeof n==='object'&&n.contains(node))}
 querySelectorAll(tag){return this.children.flatMap(n=>typeof n==='object'?[...(n.tagName===tag?[n]:[]),...n.querySelectorAll(tag)]:[])}
 querySelector(tag){return this.querySelectorAll(tag)[0]??null}
 setAttribute(k,v){this.attributes.set(k,v)}
 removeAttribute(k){this.attributes.delete(k)}
 click(){this.dispatchEvent(new Event('click'))}
 scrollIntoView(){}
 reportValidity(){return true}
}
const doc=new EventTarget();doc.createElement=tag=>new Element(tag);doc.body=new Element('body');doc.documentElement=new Element('html');doc.activeElement=null
globalThis.document=doc;globalThis.window={devicePixelRatio:1,addEventListener:()=>{},location:{protocol:'http:'}}
doc.createElementNS=(_ns,tag)=>new Element(tag)
Element.prototype.checkValidity=function(){if(this.type==='text')return !!this.value.trim();return this.value!==''&&Number.isFinite(Number(this.value))&&Number(this.value)>=Number(this.min??-Infinity)&&Number(this.value)<=Number(this.max??Infinity)}


const {targetingPanel}=await import('../src/features/targeting.ts')
const {directPlacementPanel}=await import('../src/features/directPlacement.ts')
const {addDirectElectrode}=await import('@brainana/planning-core/electrode-frame.ts')
const {applyHardwarePreset,hardwareCatalog}=await import('../src/hardware/catalog.ts')
const {activity}=await import('../src/ui/activity.ts')
const {electrodesFeature}=await import('../src/features/electrodes.ts')
const {reviewFeature}=await import('../src/features/review.ts')
doc.querySelector=()=>null
doc.querySelectorAll=selector=>{
 const key=selector.match(/^\[data-([a-z-]+)\]$/)?.[1]?.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())
 const visit=node=>node.children.flatMap(child=>typeof child==='object'?[...(key&&child.dataset[key]!==undefined?[child]:[]),...visit(child)]:[])
 return key?visit(doc.body):[]
}
const queue=[]
globalThis.Worker=class{postMessage(request){this.request=request;queue.push(this)}terminate(){this.terminated=true}}
const wait=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setTimeout(r,2))}
const text=node=>typeof node==='string'?node:node.textContent||node.children.map(text).join(' ')
const make=()=>createProject({id:'a',name:'MRI',role:'anatomy',modality:'mri',frameId:'f',sha256:'a'.repeat(64),sourcePath:null},'Feedback',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
const p=make();addAssembly(p,[0,0,10]);p.targets=[{id:'t',name:'Target',point:[0,0,-10],frameId:'f',color:'#ffffff',atlas:null}];p.electrodes[0].targetId='t'
const store=new ProjectStore();store.replace(p);const host=new Element();doc.body.append(host)
let handler=null
const scene={placementSurface:new Float32Array([0,0,0,10,0,0,0,10,0]),mountingSurface:{surfaces:[],source:'skull',assetIds:['a']},setSurfaceFitHandler:fn=>handler=fn,setPlacementMap:()=>{},setPlacementSelection:()=>{},moveCrosshair:()=>{}}
const ctx={store,get project(){return store.project},scene,selectedElectrode:p.electrodes[0].id,edit:fn=>store.edit(fn),crosshair:()=>[0,0,0],previewPlacement:()=>{},refresh:()=>host.replaceChildren(targetingPanel(ctx)),selectElectrode:()=>{},actions:{}}
const click=label=>{const b=host.querySelectorAll('button').find(b=>text(b).trim()===label);assert.ok(b,`Missing button ${label}`);b.click()}
ctx.refresh();assert.match(text(host),/Choose skull location to fit/);click('B · Automatic');click('Compute placement candidates');await wait();assert.equal(activity.hidden,false)
ctx.refresh();assert.match(text(host),/Computing placement/)
const first=queue.shift();first.onmessage({data:{kind:'result',value:{candidates:[],tested:42,rejectedDepth:0,rejectedMiss:0,rejectedSupport:42,rejectedFootprint:0,rejectedWall:0,rejectedAvoidance:0,rejectedOtherElectrodes:0,radiusUsed:10,minimumRequiredDepth:10,maximumRequiredDepth:10,usableLength:150,minimumAllowedDepth:0}}});await wait()
assert.match(text(host),/42 candidates tested/);assert.equal(activity.hidden,true);assert.equal(first.terminated,true)
click('Compute placement candidates');await wait();ctx.refresh();queue.shift().onmessage({data:{kind:'error',message:'Test surface fit failure'}});await wait();assert.match(text(host),/Test surface fit failure/)
click('A · Manual');click('Choose skull location to fit');ctx.refresh();await wait();assert.equal(typeof handler,'function');assert.match(text(host),/Click the intended center/);handler([1,2,3]);await wait();ctx.refresh();const manual=queue.shift();assert.deepEqual(manual.request.options.accessPoint,[1,2,3]);manual.onmessage({data:{kind:'error',message:'Manual fit has no supported rim'}});await wait();assert.match(text(host),/Manual fit has no supported rim/)
click('B · Automatic');click('Compute placement candidates');await wait();click('A · Manual');await wait();click('B · Automatic');assert.doesNotMatch(text(host),/Computing placement/,'A cancelled task cannot leave a permanently pending panel')
console.log('Automatic and manual worker results/errors reach a rebuilt sidebar, processing clears and cancelled tab changes remain usable (DOM / delayed-worker simulation).')
const direct=make();direct.planningIntent='direct';const e=addDirectElectrode(direct);applyHardwarePreset(e,hardwareCatalog.find(x=>x.id==='micro-fma'));direct.targets=p.targets;e.targetId='t';store.replace(direct);ctx.selectedElectrode=e.id
ctx.refresh=()=>host.replaceChildren(directPlacementPanel(ctx));ctx.refresh();assert.match(text(host),/Choose entry on 3D skull/);click('Automatic');click('Compute electrode entries');await wait();ctx.refresh();queue.shift();const w=queue.shift();assert.ok(w);w.onmessage({data:{kind:'error',message:'Direct search feedback'}});await wait();assert.match(text(host),/Direct search feedback/)
assert.doesNotThrow(()=>electrodesFeature.render(ctx));assert.doesNotThrow(()=>reviewFeature.render(ctx))
console.log('Direct-entry controls and Review render without chambers/grids; delayed failures remain visible after rebuilding.')
