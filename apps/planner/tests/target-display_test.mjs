import assert from 'node:assert/strict'
import {createProject} from '@brainana/planning-core/model.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
import {hashBytes} from '../src/data/assets.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
// Exercise real world-space slice painting without GPU initialization.
let painted
const context={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{painted=image},drawImage:()=>{}}
const canvas=()=>({className:'',hidden:false,style:{},width:256,height:256,offsetLeft:0,offsetTop:0,parentElement:{append:()=>{}},getBoundingClientRect:()=>({width:256,height:256}),getContext:()=>context})
globalThis.document={createElement:()=>canvas()}
const {AvoidanceOverlay}=await import('../src/render/avoidanceOverlay.ts')
let sliceZ=0
const nv={screenSlices:[{axCorSag:0,leftTopWidthHeight:[0,0,256,256]}],scene:{crosshairPos:[.5,.5,.5]},frac2canvasPosWithTile:()=>({pos:[128,128]}),screenXY2mm:(x,y)=>[x-128,y-128,sliceZ]}
const overlay=new AvoidanceOverlay(canvas(),nv)
const target={id:'t',name:'Focal point',point:[0,0,0],frameId:'frame',color:'#ff6c32',atlas:null,displayRadiusMm:4}
overlay.draw([],false,[target])
const alpha=(x,y)=>painted.data[(y*256+x)*4+3]
assert.equal(overlay.canvas.hidden,false)
assert.deepEqual(Array.from(painted.data.slice((128*256+128)*4,(128*256+128)*4+3)),[255,108,50])
assert.ok(alpha(128,128)>alpha(130,128)&&alpha(130,128)>0,'The halo must fade with world-space distance')
assert.equal(alpha(133,128),0,'No halo outside its physical radius')
sliceZ=5;painted=undefined;overlay.draw([],false,[target]);assert.equal(painted,undefined,'A target outside the slice is cleared by canvas resize without rasterizing a blank tile')
sliceZ=0;painted=undefined;overlay.draw([],false,[{...target,displayRadiusMm:0}]);assert.equal(painted,undefined,'Zero radius disables halo rasterization')
overlay.draw([],false,[]);assert.equal(overlay.canvas.hidden,true)
const p=createProject({id:'reference',name:'mri.nii',role:'anatomy',modality:'mri',frameId:'frame',sha256:await hashBytes(new Uint8Array([1,2,3])),sourcePath:null},'Named project',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
p.targets.push(target);validateProject(p)
const bundle=await unpackProject(await packProject(p,new Map([['reference',new Uint8Array([1,2,3])]])))
assert.equal(bundle.project.targets[0].displayRadiusMm,4)
assert.deepEqual(bundle.project.targets[0].point,[0,0,0])
p.targets[0].displayRadiusMm=-1;assert.throws(()=>validateProject(p),/radius/)
p.targets[0].displayRadiusMm=Infinity;assert.throws(()=>validateProject(p),/radius/)
delete p.targets[0].displayRadiusMm;validateProject(p)
console.log('Target halos fade in physical slice coordinates, respect slice distance and zero radius, persist without moving the focal point, and validate legacy/new values (canvas I/O mocked).')
