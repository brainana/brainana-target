import assert from 'node:assert/strict'
import {NVMesh} from '@niivue/niivue'
import {createProject} from '@brainana/planning-core/model.ts'
import {ProjectStore} from '../src/state/store.ts'
import {SceneParts} from '../src/render/sceneParts.ts'
import {SceneMeshes} from '../src/render/sceneMeshes.ts'
import {defaultSceneColors} from '../src/render/colors.ts'
import {defaultSceneDisplay} from '../src/render/display.ts'
const p=createProject({id:'a',name:'MRI',role:'anatomy',frameId:'f',sha256:'a'.repeat(64),sourcePath:null},'Retained meshes',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
const patch={pts:[0,0,0,1,0,0,0,1,0],tris:[0,1,2]}
p.avoidRegions=[{id:'avoid',name:'Avoidance',frameId:'f',center:[0,0,0],radius:2,drawingMode:'surface',surfacePatch:patch}]
p.headposts=[{id:'post',name:'Post',frameId:'f',pose:{origin:[0,0,0],angles:[0,0,0]},avoid:true,existing:false,reference:'custom',mesh:patch}]
p.targets=[{id:'target',name:'Target',frameId:'f',point:[1,1,1],color:'#ff7711',atlas:null}]
const store=new ProjectStore();store.replace(p)
const builder=new SceneParts(),context={colors:defaultSceneColors,enhanceElectrodes:true,center:[0,0,0],surfaces:[],placementPoint:null,placementParts:[]}
let parts=builder.build(store.project,null,context)
const avoid=parts.find(p=>p.name==='Avoidance').geometry,post=parts.find(p=>p.name==='Post').geometry
let allocations=0,removals=0
const original=NVMesh.prototype.updateMesh;NVMesh.prototype.updateMesh=()=>{allocations++}
const gl=new Proxy({}, {get:(_,name)=>name==='createBuffer'||name==='createVertexArray'?()=>({}):()=>{}})
const viewer={meshes:[],gl,addMesh(mesh){this.meshes.push(mesh)},removeMesh(mesh){removals++;this.meshes=this.meshes.filter(m=>m!==mesh)}}
const gpu=new SceneMeshes(),display=defaultSceneDisplay()
try{
 gpu.update(viewer,parts,true,display)
 const avoidMesh=viewer.meshes.find(m=>m.name==='Avoidance'),postMesh=viewer.meshes.find(m=>m.name==='Post')
 for(let i=0;i<10;i++){
  store.edit(p=>{p.targets[0].point[0]+=1})
  parts=builder.build(store.project,null,context);assert.equal(parts.find(p=>p.name==='Avoidance').geometry,avoid);assert.equal(parts.find(p=>p.name==='Post').geometry,post)
  gpu.update(viewer,parts,true,display)
  assert.equal(viewer.meshes.find(m=>m.name==='Avoidance'),avoidMesh);assert.equal(viewer.meshes.find(m=>m.name==='Post'),postMesh)
 }
 const before=allocations;gpu.update(viewer,parts,true,display);assert.equal(allocations,before,'An unchanged scene must allocate no GPU meshes')
 assert.deepEqual(viewer.meshes.map(m=>m.name),parts.map(p=>p.name),'Retained meshes keep stable transparency/drawing order')
 store.edit(p=>{p.avoidRegions[0].surfacePatch={pts:[0,0,0,2,0,0,0,2,0],tris:[0,1,2]}})
 parts=builder.build(store.project,null,context);gpu.update(viewer,parts,true,display)
 assert.notEqual(viewer.meshes.find(m=>m.name==='Avoidance'),avoidMesh);assert.equal(viewer.meshes.find(m=>m.name==='Post'),postMesh)
 display.layers.avoidance=false;gpu.update(viewer,parts,true,display);assert.equal(viewer.meshes.find(m=>m.name==='Avoidance').opacity,0)
 store.edit(p=>{p.headposts=[]});parts=builder.build(store.project,null,context);gpu.update(viewer,parts,true,display)
 assert.ok(!viewer.meshes.includes(postMesh));assert.ok(removals>0)
 builder.clear();gpu.clear()
 console.log('Scene retention: unchanged annotation/headpost CPU geometry and GPU meshes survive target edits; changed buffers replace only their mesh; visibility, order and removal remain correct.')
}finally{NVMesh.prototype.updateMesh=original}
