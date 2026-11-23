import assert from 'node:assert/strict'
import {NVImage} from '@niivue/niivue'
import {createProject} from '@brainana/planning-core/model.ts'
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
const resizeListeners=new Set()
globalThis.document=doc;globalThis.window={devicePixelRatio:1,addEventListener:(name,listener)=>{if(name==='resize')resizeListeners.add(listener)},removeEventListener:(name,listener)=>{if(name==='resize')resizeListeners.delete(listener)},location:{protocol:'http:'}}
const {imageFiles}=await import('../src/ui/imageFiles.ts')
const bytes=NVImage.createNiftiArray([10,10,10],[1,1,1],[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],16,new Uint8Array(Float32Array.from({length:1000},(_,i)=>i%100).buffer))
const image=await NVImage.loadFromUrl({url:bytes,name:'ct.nii'})
const asset={id:'ct',name:'ct.nii',role:'anatomy',modality:'ct',frameId:'frame',sha256:'a'.repeat(64),sourcePath:null,imageDisplay:{min:0,max:99,opacity:.5,colormap:'gray',visible:true,skull:{threshold:50,bounds:[[0,0,0],[9,9,9]],show:true,useForPlanning:true}}}
const p=createProject(asset,'test',{kind:'standalone',subject:null,scan:null,sourceRoot:null}),store=new ProjectStore();store.replace(p)
let ui, surfaceNavigations=0
ui=imageFiles({project:()=>store.project,bytes:new Map([['ct',bytes]]),edit:fn=>store.edit(fn),image:()=>image,defaults:()=>({min:0,max:99,opacity:.5,colormap:'gray',visible:true}),atlas:()=>{},loadAtlas:()=>{},loadSurface:()=>{},surfaceDisplay:()=>{},openPlanningSurface:()=>{surfaceNavigations++}})
store.subscribe(()=>ui.update())
ui.adjustCurrent()
const find=(label)=>doc.body.querySelectorAll('input').find(n=>n.ariaLabel===label)
assert.equal(find('Use CT surface for approximate placement'),undefined,'Image display settings must not own segmentation controls')
store.edit(d=>{d.assets[0].imageDisplay.min=20})
assert.equal(find('Display minimum value').value,'20')
store.undo();assert.equal(find('Display minimum value').value,'0')
store.redo();assert.equal(find('Display minimum value').value,'20')
assert.equal(store.project.assets[0].imageDisplay.skull.threshold,50,'Display edits must preserve the surface configuration')
const before=store.project
const close=doc.body.querySelectorAll('button').find(n=>n.children.includes('Close'));close.click();assert.deepEqual(store.project,before,'Closing the editor must not undo history')
ui.adjustCurrent();assert.equal(find('Display minimum value').value,'20')
ui.layers();store.clear();ui.update();assert.equal(doc.body.querySelectorAll('section').length,0,'New project closes old image/layer windows')
assert.equal(resizeListeners.size,0,'Switching project must dispose window listeners, not just remove their DOM nodes')
// An image import that finishes after the project changes must be discarded.
store.replace(p);const originalLoad=NVImage.loadFromFile;let release
NVImage.loadFromFile=()=>new Promise(resolve=>{release=()=>resolve(image)})
ui.load('mri');const fileInput=doc.body.querySelectorAll('input').find(n=>n.type==='file')
fileInput.files=[new File([bytes],'additional.nii')];fileInput.dispatchEvent(new Event('change'))
await new Promise(resolve=>setTimeout(resolve,0));assert.ok(release)
const next=createProject({...asset,id:'new-reference'},'next',{kind:'standalone',subject:null,scan:null,sourceRoot:null});store.replace(next)
release();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(store.project.assets.length,1);assert.equal(store.project.id,next.id)
// A completed aligned CT import immediately blends with a cool colormap.
NVImage.loadFromFile=async()=>image
image.cal_max=70
ui.load('ct');const incoming=doc.body.querySelectorAll('input').find(n=>n.type==='file')
incoming.files=[new File([bytes],'aligned.nii')];incoming.dispatchEvent(new Event('change'))
await new Promise(resolve=>setTimeout(resolve,30))
const added=store.project.assets.find(a=>a.role==='ct')
assert.ok(added);assert.equal(added.imageDisplay.min,(image.global_min+image.global_max)/2,'New CT display minimum starts at the full-range slider midpoint');assert.equal(added.imageDisplay.max,image.global_max,'CT window uses the full data maximum, not the robust/calibrated maximum');assert.equal(added.imageDisplay.colormap,'cool');assert.equal(added.imageDisplay.opacity,.85);assert.ok(store.project.display.anatomyOverlayIds.includes(added.id))
NVImage.loadFromFile=originalLoad
console.log('Actual image-editor controls synchronize after undo/redo; Close preserves history; new project closes tools; late image import is discarded; imported CT blends in cool (DOM/GPU mocked).')

// Old surface links route to the dedicated tab, never embed another copy in image tools.
ui.setupPlanningSurface();assert.equal(surfaceNavigations,1)
store.clear();ui.setupPlanningSurface();assert.equal(surfaceNavigations,1)
console.log('Image display tools preserve surface settings and route preparation to its dedicated tab.')

// Repeated clicks while image decoding is pending must open only one adjustment window.
store.replace(p)
let resolveImage
const pendingImage=new Promise(resolve=>{resolveImage=resolve})
NVImage.loadFromFile=()=>pendingImage
ui=imageFiles({project:()=>store.project,bytes:new Map([['ct',bytes]]),edit:fn=>store.edit(fn),image:()=>undefined,defaults:()=>undefined,atlas:()=>{},loadAtlas:()=>{}})
ui.adjustCurrent();ui.adjustCurrent();resolveImage(image)
await new Promise(resolve=>setTimeout(resolve,10))
assert.equal(doc.body.querySelectorAll('section').length,1,'Two pending adjustment requests must share one window')
assert.equal(resizeListeners.size,1)
store.clear();ui.update();assert.equal(resizeListeners.size,0)
NVImage.loadFromFile=originalLoad
console.log('Image-window teardown releases resize listeners and duplicate clicks during image decoding open only one window.')
