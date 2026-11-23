import assert from 'node:assert/strict'
import {trajectoryPlanes} from '../src/render/trajectoryPlanes.ts'
import {maskIsosurface} from '../src/render/maskIsosurface.ts'
import {dot,cross,length,sub} from '@brainana/planning-core/geometry.ts'
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`)
for(const direction of [[0,0,-1],[1,0,0],[1/3,2/3,2/3]])for(const angle of [0,30,90,170])for(const offset of [-12,0,5]){
 const entry=[10,20,30],depth=12,tip=entry.map((v,i)=>v+direction[i]*depth)
 const [along,across]=trajectoryPlanes(entry,tip,direction,depth,angle,offset)
 near(length(along.right),1);near(length(along.up),1);near(dot(along.right,along.up),0)
 near(dot(cross(along.right,along.up),direction),0)
 near(Math.abs(dot(cross(across.right,across.up),direction)),1)
 for(let i=0;i<3;i++){near(along.center[i],entry[i]+direction[i]*depth/2);near(across.center[i],tip[i]+direction[i]*offset)}
}
const planes0=trajectoryPlanes([0,0,0],[0,0,-12],[0,0,-1],12),planes90=trajectoryPlanes([0,0,0],[0,0,-12],[0,0,-1],12,90)
near(dot(planes0[0].right,planes90[0].right),0)
for(const [dims,lo,hi,step] of [[[1,1,1],[0,0,0],[1,1,1],1],[[3,4,5],[10,20,30],[12.1,23.4,34.8],1]]){
 const mask=new Uint8Array(dims[0]*dims[1]*dims[2]).fill(1),mesh=maskIsosurface(mask,dims,lo,hi,step),edges=new Map()
 assert.ok(mesh.tris.length>0)
 assert.ok(mesh.pts.every((v,i)=>Number.isFinite(v)&&v>=lo[i%3]-1e-5&&v<=hi[i%3]+1e-5))
 let signedVolume=0,obliqueFaces=0
 for(let i=0;i<mesh.tris.length;i+=3){
  const ids=Array.from(mesh.tris.slice(i,i+3)),points=ids.map(id=>Array.from(mesh.pts.slice(id*3,id*3+3)))
  const normal=cross(sub(points[1],points[0]),sub(points[2],points[0]));assert.ok(length(normal)>0)
  if(normal.filter(v=>Math.abs(v)>1e-6).length>1)obliqueFaces++
  signedVolume+=dot(points[0],cross(points[1],points[2]))/6
  for(const [a,b] of [[ids[0],ids[1]],[ids[1],ids[2]],[ids[2],ids[0]]]){const key=[a,b].sort((x,y)=>x-y).join(':');edges.set(key,(edges.get(key)??0)+1)}
 }
 assert.ok(Array.from(edges.values()).every(count=>count===2),'Final isosurface must be welded and closed on these analytic masks')
 assert.ok(signedVolume>0,'Triangle winding must point outward')
 assert.ok(obliqueFaces>0,'Finalization must extract an isosurface instead of returning only voxel faces')
}
console.log('Rotatable shaft planes and movable cross-sections preserve physical coordinates; finalized isosurfaces have finite crop-bounded vertices, outward normals and closed welded topology on analytic masks.')
// Actual reslice renderer uses the moved plane and samples only the requested viewport.
const {TrajectoryReslices}=await import('../src/render/reslices.ts')
const {createProject,addAssembly}=await import('@brainana/planning-core/model.ts')
globalThis.window={devicePixelRatio:1}
const makeCanvas=()=>{
 const state={images:0,last:null}
 const ctx=new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{state.images++;state.last=image},createRadialGradient:()=>({addColorStop:()=>{}})},{get:(target,key)=>target[key]??(()=>{})})
 return {width:256,height:256,state,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:300,height:300}),addEventListener:()=>{}}
}
const a=makeCanvas(),b=makeCanvas(),views=new TrajectoryReslices(a,b)
const project=createProject({id:'image',name:'mri',role:'anatomy',frameId:'frame',sha256:'a'.repeat(64),sourcePath:null},'Reslice',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
addAssembly(project,[0,0,20]);project.electrodes[0].depth=10
const id=project.electrodes[0].id,volume={sample:p=>p[2],image:{cal_min:0,cal_max:40}}
views.visible='across';views.draw(project,id,volume)
assert.equal(a.state.images,0);assert.equal(b.state.images,1);assert.equal(b.state.last.data[0],64)
views.tipOffset=-5;views.draw(project,id,volume);assert.equal(b.state.last.data[0],96)
assert.deepEqual(views.screenPoint(b,150,150),[0,0,15])
views.visible='none';views.draw(project,id,volume);assert.equal(b.state.images,2,'Cardinal mode must not keep sampling hidden trajectory views')
console.log('Actual reslice sampling, moved-plane coordinate picking, viewport resolution and hidden-view suppression passed (canvas I/O mocked).')

const {stereotaxGeometry}=await import('../src/render/stereotaxGeometry.ts')
const {validateProject}=await import('@brainana/planning-core/validation.ts')
project.stereotax={preset:'kopf-1430m',pose:{origin:[10,20,30],angles:[0,0,0]},railDropMm:5,earTipSpacingMm:40,arms:[{side:'left',apMm:15,heightMm:65,reachMm:55}]}
assert.deepEqual(validateProject(project).stereotax,project.stereotax)
const rig=stereotaxGeometry(project.stereotax)
const range=(vertices,axis)=>{const values=Array.from(vertices).filter((_,i)=>i%3===axis);return Math.max(...values)-Math.min(...values)}
assert.ok(Math.abs(range(rig.pts.slice(0,24),1)-305)<1e-4,'Rail length stays at 305 mm')
assert.ok(Math.abs(range(rig.pts.slice(0,24),0)-18.7)<1e-4,'Rail cross-section stays at 18.7 mm')
assert.ok(Math.abs(range(rig.pts.slice(0,48),0)-196.5)<1e-4,'Center spacing plus rail width is 196.5 mm')
assert.ok(rig.pts.every(Number.isFinite))
assert.throws(()=>validateProject({...project,stereotax:{...project.stereotax,preset:'__proto__'}}),/stereotaxic frame/)
assert.throws(()=>validateProject({...project,stereotax:{...project.stereotax,arms:[{...project.stereotax.arms[0],apMm:500}]}}),/supported range/)
console.log('Stereotaxic geometry preserves the published rails and validates its saved settings.')
