import assert from 'node:assert/strict'
import { NVImage, NVMesh } from '@niivue/niivue'
import { createAsset } from '../src/data/assets.ts'
import { createProject, addAssembly } from '@brainana/planning-core/model.ts'
import { searchTarget, applyCandidate } from '@brainana/planning-core/optimization.ts'
import { ctSurfaceKey } from '../src/render/ctSurfaceKey.ts'
import { packProject, unpackProject } from '../src/data/archive.ts'
globalThis.window = { devicePixelRatio: 1, addEventListener: () => {}, location: { protocol: 'http:' } }
const { NiiVuePlanningScene } = await import('../src/render/scene.ts')
const originalLoad = NVImage.loadFromFile, originalUpdate = NVMesh.prototype.updateMesh, originalReadFile=NVMesh.readFileAsync
NVImage.loadFromFile = async ({ file, name }) => NVImage.loadFromUrl({ url: new Uint8Array(await file.arrayBuffer()), name })
NVMesh.prototype.updateMesh = () => {}
NVMesh.readFileAsync=async file=>file.arrayBuffer()
try {
  const voxels = Float32Array.from({ length: 1000 }, (_, i) => {
    const x=i%10, y=Math.floor(i/10)%10, z=Math.floor(i/100)
    return x>=2&&x<=7&&y>=2&&y<=7&&z>=2&&z<=7 ? 1000 : 0
  })
  const data=NVImage.createNiftiArray([10,10,10],[1,1,1],[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],16,new Uint8Array(voxels.buffer))
  const asset=await createAsset('ct.nii','anatomy','frame',data);asset.modality='ct'
  const p=createProject(asset,'test',{kind:'standalone',subject:null,scan:null,sourceRoot:null}),bytes=new Map([[asset.id,data]])
  assert.equal(p.chambers.length,0);assert.equal(p.grids.length,0);assert.equal(p.electrodes.length,0)
  const scene=new NiiVuePlanningScene({},{});scene.moveCrosshair=()=>{};scene.setCutaway=()=>{}
  const gl=new Proxy({}, {get:(_,key)=>key==='createBuffer'||key==='createVertexArray'?()=>({}):()=>{}})
  for(const nv of [scene.slices,scene.render]){
    Object.defineProperty(nv,'gl',{value:gl});nv.drawScene=()=>{};nv.updateGLVolume=()=>{}
    nv.addVolume=v=>nv.volumes.push(v);nv.removeVolume=v=>nv.volumes=nv.volumes.filter(x=>x!==v)
    nv.addMesh=m=>nv.meshes.push(m);nv.removeMesh=m=>nv.meshes=nv.meshes.filter(x=>x!==m)
  }
  await scene.load({project:p,bytes})
  assert.equal(scene.defaultsForImage(asset.id).min,500,'Reference CT starts at the intensity-range midpoint');assert.equal(scene.defaultsForImage(asset.id).max,1000)
  assert.equal(scene.placementSurface,null,'A CT volume is not implicitly a planning surface')
  addAssembly(p,[4,4,12]);const c=p.chambers[0],e=p.electrodes[0]
  c.innerRadius=1;c.wallThickness=.2;c.height=1;c.placementState='unplaced'
  scene.update(p,e.id);assert.equal(scene.render.meshes.length,0,'Unplaced hardware must not be drawn')
  asset.imageDisplay={min:0,max:1000,opacity:.5,colormap:'gray',visible:true,skull:{threshold:300,bounds:[[0,0,0],[9,9,9]],show:true}}
  await scene.syncImages({project:p,bytes})
  assert.equal(scene.placementSurface,null,'Visualization alone must not enable planning')
  const savedGeometry=scene.ctSurfaceGeometry(asset.id,ctSurfaceKey(asset.imageDisplay.skull),asset.sha256)
  assert.ok(savedGeometry)
  assert.equal(savedGeometry.pts,scene.render.meshes.find(mesh=>mesh.name==='ct.nii skull preview').pts,'Editor cache and main viewer share the same vertex array')
  assert.equal(scene.ctSurfaceGeometry(asset.id,'stale-key',asset.sha256),null)
  assert.equal(scene.ctSurfaceGeometry(asset.id,ctSurfaceKey(asset.imageDisplay.skull),'different-source'),null)
  await scene.syncImages({project:p,bytes})
  assert.equal(scene.ctSurfaceGeometry(asset.id,ctSurfaceKey(asset.imageDisplay.skull),asset.sha256),savedGeometry,'Display updates retain finalized geometry')
  asset.imageDisplay.skull.useForPlanning=true
  p.planningSurfaceIds=[asset.id]
  await scene.syncImages({project:p,bytes})
  assert.ok(scene.placementSurface.length>0);assert.equal(scene.mountingSurface.source,'skull')
  asset.imageDisplay.skull.representation='isosurface';await scene.syncImages({project:p,bytes});assert.ok(scene.placementSurface.length>0);assert.equal(scene.surfaceCandidates[0].inspection.valid,true)
  assert.equal((await unpackProject(await packProject(p,bytes))).project.chambers[0].placementState,'unplaced','Reload preserves unplaced state')
  const target={id:'target',name:'target',point:[4,4,4],frameId:p.frame.id,color:'#ffffff',atlas:null}
  p.targets.push(target);e.targetId=target.id
  const options={surface:scene.placementSurface,expand:true}
  const result=searchTarget(p,e.id,target.id,options)
  assert.ok(result.candidates.length>0,'An explicitly enabled CT surface supports feasible exterior search')
  assert.equal(c.placementState,'unplaced','Search does not apply a candidate')
  applyCandidate(p,e.id,target.id,result.candidates[0],options)
  assert.equal(c.placementState,undefined)
  scene.update(p,e.id);assert.ok(scene.render.meshes.some(m=>m.name===c.name),'Applied chamber is rendered')
  assert.ok(scene.render.meshes.some(m=>m.name.includes('guide channels')||m.name.includes('Guide channels')),'Full guide-channel markers remain in 3D')
  assert.ok(!scene.slices.meshes.some(m=>m.name.includes('guide channels')||m.name.includes('Guide channels')),'Slice scrolling does not intersect every guide-channel tube')
  p.display.gridPreviewHoles=[{electrodeId:e.id,hole:[0,0]},{electrodeId:e.id,hole:[1,0]}];scene.update(p,e.id)
  assert.equal(scene.render.meshes.filter(m=>m.name.startsWith('Comparison hole')).length,2,'Multiple comparison paths remain in 3D together')
  assert.deepEqual((await unpackProject(await packProject(p,bytes))).project,JSON.parse(JSON.stringify(p)))
  p.planningSurfaceIds=[];await scene.syncImages({project:p,bytes})
  assert.equal(scene.placementSurface,null,'An explicit empty selection must not fall back to another surface')
  p.planningSurfaceIds=[asset.id];asset.imageDisplay.skull.show=false;await scene.syncImages({project:p,bytes})
  assert.ok(scene.placementSurface,'Hiding the CT preview must not change the selected planning source')
  assert.deepEqual((await unpackProject(await packProject(p,bytes))).project.planningSurfaceIds,[asset.id])
  asset.imageDisplay.skull.useForPlanning=false;await scene.syncImages({project:p,bytes})
  assert.equal(scene.placementSurface,null,'Disabling planning removes the approximate surface from search')
  const {sphere}=await import('../src/render/primitives.ts'),{binarySTL}=await import('../src/data/geometryExport.ts')
  const mri=await createAsset('MRI.nii','anatomy','frame',data),mask=await createAsset('brain-mask.nii','mask','frame',data),surfaceData=binarySTL(sphere([4.5,4.5,4.5],4)),boundary=await createAsset('MRI-dark-band-boundary.stl','surface','frame',surfaceData)
  boundary.surfaceKind='skull';boundary.mriSurface={sourceAssetId:mri.id,maskAssetId:mask.id,method:'dark-band',offsetMm:0,threshold:.5,spacingMm:1,largest:true,fillHoles:true,smooth:false,bounds:[[0,0,0],[9,9,9]],darkBand:{maximumIntensity:35,searchMm:10,minimumWidthMm:.5,maximumWidthMm:5,minimumScalpMm:1}}
  const mriProject=createProject(mri,'MRI boundary',{kind:'standalone',subject:null,scan:null,sourceRoot:null});mriProject.assets.push(mask,boundary);mriProject.planningSurfaceIds=[boundary.id]
  const mriBundle=await unpackProject(await packProject(mriProject,new Map([[mri.id,data],[mask.id,data],[boundary.id,surfaceData]])))
  await scene.load(mriBundle)
  assert.equal(scene.mountingSurface.surfaces[0].outerEnvelope,true,'MRI dark-band mesh retains front-face support checks after save/reload')
  assert.equal(scene.mountingSurface.assetIds[0],boundary.id)
  mriBundle.project.assets.find(a=>a.id===boundary.id).mriSurface.method='dark-band-head'
  await scene.load(mriBundle)
  assert.equal(scene.mountingSurface.surfaces[0].outerEnvelope,true,'Direct MRI dark-band surfaces use the same one-sided support rule')
  console.log('Saved MRI dark-band surface loads as a one-sided outer envelope, with its source-mask recipe retained (GPU I/O mocked).')
  console.log('No implicit hardware; unplaced hardware hidden; explicit CT planning surface, exterior search/apply, and project persistence passed (GPU I/O mocked).')
} finally { NVImage.loadFromFile=originalLoad;NVMesh.prototype.updateMesh=originalUpdate;NVMesh.readFileAsync=originalReadFile }
