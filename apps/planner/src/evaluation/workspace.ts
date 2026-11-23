import { isCorticalEnvelope } from '@brainana/planning-core/model.ts'
import { anatomyCenter } from '../render/stereotaxGeometry.ts'
import {Niivue,NVImage,NVMesh,SLICE_TYPE,SHOW_RENDER} from '@niivue/niivue'
import {h} from '@brainana/ui/dom.ts'
import {inTargetRegion} from '@brainana/planning-core/target-region.ts'
import {workspaceHomeLink} from '../ui/workspaceNav.ts'
import {installAnatomyCompositing} from '../render/anatomyCompositing.ts'
import {activity,withActivity} from '../ui/activity.ts'
import {objectPoseEditor} from '../ui/objectPoseEditor.ts'
import {intersectionReadout} from '../ui/intersectionReadout.ts'
import {IntersectionOverlay, hardwareIntersectionSurfaces} from '../render/intersectionOverlay.ts'
import {installObjectDrag} from '../render/objectDrag.ts'
import {stereotaxSettings} from '../ui/stereotaxSettings.ts'
import {measurementPanel,updateMeasurementPanels} from '../ui/measurements.ts'
import {MeasurementOverlay} from '../render/measurementOverlay.ts'
import {identifyArms} from '@brainana/planning-core/measurements.ts'
import {createProject} from '@brainana/planning-core/model.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
import {projectSnapshot} from '../state/projectSnapshot.ts'
import {runIO} from '../data/ioTasks.ts'
import {sceneControls} from '../ui/sceneControls.ts'
import {floatingWindow} from '../ui/floatingWindow.ts'
import {readPreferences} from '../ui/settings.ts'
import {anatomyViewerOptions,anatomySurfaceColor,ctSurfaceColor,defaultSceneDisplay} from '../render/display.ts'
import {SceneParts,stereotaxSceneParts,type ScenePart} from '../render/sceneParts.ts'
import {SceneMeshes} from '../render/sceneMeshes.ts'
import {IndexedDbPersistence} from '../data/persistence.ts'
import type {ProjectBundle} from '../data/archive.ts'
import {buildCTSurface,disposeCTSurface} from '../render/ctSurfaceBuilder.ts'
import type {TriangleSurface} from '@brainana/planning-core/surface-fit.ts'
import type {Pose,Project,Stereotax,Vec3} from '@brainana/planning-core/model.ts'
import {surfacePatch} from '@brainana/planning-core/surface-patch.ts'
import {surfacePaint} from '../render/surfacePaint.ts'
import {closestTriangle} from '@brainana/planning-core/surface-fit.ts'
import {button,chooseFile,download,note,numberField,readout,section,selectField} from '../ui/controls.ts'
import {readProject} from '../data/ioTasks.ts'
import {hashBytes} from '../data/assets.ts'
import {bytesView} from '../data/buffers.ts'
import {VolumeSampler,nativeSurfaceSpacing} from '../render/volume.ts'
import {imageBounds} from '../render/ctSkull.ts'
import {ctDefaults} from '../render/ctDefaults.ts'
import {applySliceLayout,cardinalLayouts,frameBounds,panCamera,installRenderZoom} from '../render/camera.ts'
import {bindViewerKeys} from '../ui/keyboardPan.ts'
import {cylinder,sphere,type MeshGeometry} from '../render/primitives.ts'
import {workerTask} from '../workers/task.ts'
import {compareTracks,cortexDistance,plannedTracks,clipTrackToMask,readMorphometry,type PlannedTrack,type fitMask} from './geometry.ts'
import type {EvaluationRequest} from './worker.ts'
import type {NmtFile} from './nmt.ts'

interface Reference {name:string;sha256:string;sample:VolumeSampler;window:{colormap:string;min:number;max:number};bounds:[Vec3,Vec3];space?:string;modality:'mri'|'ct'}
interface Measured {
 name:string;sha256:string;image:NVImage;fit:ReturnType<typeof fitMask>;color:string;
 visible:boolean;flip:boolean;confirmed:boolean;registered:boolean;paired:string;
}
interface Cortex {name:string;sha256:string;kind:'pial'|'white';fromPlan:boolean;side:'left'|'right'|'unspecified';mesh:NVMesh}
const palette=['#fbbf24','#a78bfa','#fb7185','#4ade80','#f472b6','#f97316']
const slices=new Niivue(anatomyViewerOptions()),render=new Niivue(anatomyViewerOptions())
installRenderZoom(render)
let fitWholeScene=false
const setScenePivot=render.setPivot3D.bind(render)
render.setPivot3D=()=>{
 setScenePivot()
 if(reference&&!fitWholeScene)frameBounds(render,reference.bounds)
}
const sliceCanvas=h('canvas',{class:'volume-canvas',ariaLabel:'Anatomy slices',tabIndex:0})
const renderCanvas=h('canvas',{class:'volume-canvas',ariaLabel:'3D anatomy and implants',tabIndex:0,ariaDescription:'Arrow keys pan the view. R focuses the anatomy. Fit shows the whole setup.'})
const sidebar=h('aside',{class:'evaluation-sidebar',ariaLabel:'Evaluation controls'})
const steps=h('nav',{class:'evaluation-steps',ariaLabel:'Evaluation sections'})
const inspector=h('div',{class:'evaluation-inspector'})
sidebar.append(steps,inspector)
const status=h('p',{class:'evaluation-status',role:'status'},['Opening evaluation…'])
const failure=h('p',{class:'evaluation-error',role:'alert',hidden:true})
const panel=(title:string,canvas:HTMLCanvasElement,actions:HTMLElement[]=[],controls?:HTMLElement)=>
 h('section',{class:'view-pane evaluation-view'},[
  h('header',{},[h('div',{class:'evaluation-view-heading'},[h('h2',{},[title]),h('div',{class:'button-row'},actions)]),...(controls?[controls]:[])]),
  h('div',{class:'canvas-wrap'},[canvas]),
 ])
const sceneDisplay=defaultSceneDisplay()
const intersections=new IntersectionOverlay([render,slices])
const intersectionStatus=intersectionReadout(intersections,point=>locate(point))
const setObjectDrag=installObjectDrag(renderCanvas,render)
const displayControls=sceneControls(sceneDisplay,patch=>{
 const {layers,...settings}=patch
 Object.assign(sceneDisplay.layers,layers)
 Object.assign(sceneDisplay,settings)
 render.opts.meshXRay=sceneDisplay.showOccludedGeometry ? .2 : 0
 if(patch.enhanceElectrodes!==undefined)rebuildPlanParts()
 updatePlanPresentation()
 redraw()
})
const ctControls=h('div',{class:'evaluation-view-controls'})
const displayButton=button('3D display…',()=>{
 if(displayWindow){displayWindow.activate();return}
 displayWindow=floatingWindow('3D display','3D display',()=>{displayWindow=null})
 displayWindow.content.append(
  h('div',{class:'button-row'},[button('Fit whole scene',()=>fitView(true)),button('Save 3D PNG',()=>void render.saveScene('electrode-evaluation.png').catch(error=>{failure.hidden=false;failure.textContent=String(error)}))]),
  displayControls.details,
 )
 displayWindow.placeBeside(renderCanvas)
})
let displayWindow:ReturnType<typeof floatingWindow>|null=null
const openStereotax=stereotaxSettings({
 current:()=>reference&&!busy?{key:JSON.stringify([reference.sha256,rigGeneration,plan?.project.species]),stereotax:activeStereotax(),species:plan?.project.species}:null,
 crosshair:()=>Array.from(slices.frac2mm(slices.scene.crosshairPos)).slice(0,3) as Vec3,
 center:()=>{
  const brain = [...cortices.filter(c=>c.kind==='pial').map(c=>c.mesh), ...planSurfaces.filter(s=>s.kind==='brain').map(s=>s.mesh)]
  return anatomyCenter(brain.length ? brain : planSurfaces.map(s=>s.mesh), reference!.bounds)
 },
 viewer:renderCanvas,
 scopeNote:'Changes apply to this evaluation session.',
 fit:()=>fitView(true),
 overlaps:{
  current:()=>sceneDisplay.showIntersections,
  set:showIntersections=>{sceneDisplay.showIntersections=showIntersections;updatePlanPresentation();redraw()},
 },
 locate:point=>locate(point),
 preview:rig=>{
  if(!rig&&!rigEditPreview)return
  rigEditPreview=rig
  rebuildPlanParts()
  updatePlanPresentation()
  redraw()
 },
 save:rig=>{
  setObjectDrag(null)
  updateRig(rig)
  if(sectionId==='setup')drawControls()
  return true
 },
})
const stereotaxButton=button('Stereotaxic setup…',()=>{
 displayWindow?.close()
 openStereotax()
})
const displayHeader=h('div',{class:'panel-quick-controls evaluation-view-controls'},[displayControls.element,intersectionStatus])
const split=h('div',{class:'evaluation-divider',role:'separator',ariaLabel:'Resize slice and 3D views',ariaOrientation:'vertical',tabIndex:0})
const sliceLayout=h('select',{ariaLabel:'Anatomy view mode'},cardinalLayouts.map(({value,label})=>h('option',{value},[label])))
sliceLayout.value='column'
sliceLayout.addEventListener('change',()=>applySliceLayout(slices,sliceLayout.value))
const views=h('div',{class:'evaluation-views'},[
 panel('Anatomy',sliceCanvas,[sliceLayout],ctControls),split,
 panel('3D anatomy & implants',renderCanvas,[displayButton,stereotaxButton,button('Fit',()=>fitView(true))],displayHeader),
])
const root=document.querySelector<HTMLElement>('#app')!
const projectTitle=h('span',{class:'project-title'},['No evaluation data loaded'])
root.classList.add('evaluation-root')
root.append(h('header',{class:'topbar'},[workspaceHomeLink(),h('div',{class:'workspace-identity'},[h('h1',{class:'workspace-heading'},['Evaluate placement']),projectTitle])]),h('main',{class:'evaluation-body'},[sidebar,views]),failure,status,activity)
let fraction=24
function resize(value:number){fraction=Math.max(23,Math.min(77,value));views.style.setProperty('--slice-width',fraction+'%');split.setAttribute('aria-valuenow',String(Math.round(fraction)))}
resize(fraction)
split.addEventListener('pointerdown',event=>split.setPointerCapture(event.pointerId))
split.addEventListener('pointermove',event=>{if(split.hasPointerCapture(event.pointerId)){const rect=views.getBoundingClientRect(),wide=getComputedStyle(views).flexDirection==='row';resize(100*(wide?(event.clientX-rect.left)/rect.width:(event.clientY-rect.top)/rect.height))}})
split.addEventListener('dblclick',()=>resize(24))
split.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();resize(fraction+(['ArrowLeft','ArrowUp'].includes(event.key)?-3:3))}})
let reference:Reference|null=null
let plan:{project:Project;sha256:string|null;referenceSha256:string;tracks:PlannedTrack[];surfaces:TriangleSurface[]}|null=null
let measurementBundle:ProjectBundle|null=null
let sessionProject:Project|null=null
let measurementOverlays:MeasurementOverlay[]=[]
// Undefined inherits the plan's frame. Null explicitly removes it from this evaluation.
let rigOverride:Stereotax|null|undefined
let rigGeneration=0
let rigPreview:Pose|null=null
let rigEditPreview:Stereotax|undefined
const activeStereotax=()=>rigOverride===undefined?sessionProject?.stereotax??plan?.project.stereotax:rigOverride??undefined
let planParts:ScenePart[]=[]
let planSurfaces:{mesh:NVMesh;kind:'brain'|'skull'}[]=[]
const parts=new SceneParts(),planMeshes=new SceneMeshes()
const sceneColors=readPreferences().colors
let sliceState=''
let sectionId:'data'|'setup'|'stereotax'|'tracks'|'compare'='data'
const stepButtons=new Map<string,HTMLButtonElement>()
for(const [id,label] of [['data','Data'],['setup','Setup'],['stereotax','Stereotax'],['tracks','Tracks'],['compare','Compare']] as const){
 const control=button(label,()=>{
  if(sectionId==='setup'&&id!=='setup'){
   setObjectDrag(null)
   if(rigPreview)previewRig(null)
  }
  sectionId=id
  inspector.scrollTop=0
  drawControls()
  control.focus()
 })
 stepButtons.set(id,control);steps.append(control)
}
let ct:{image:NVImage;name:string;sha256:string;fromPlan:boolean}|null=null
let renderReference:NVImage|null=null
let renderVolumeState=''
let visibleTracksExpanded=false
let brainMask:VolumeSampler|null=null
let shading:'uniform'|'curv'|'sulc'='uniform'
const morphometry=new Map<string,Float32Array>()
let tracks:Measured[]=[],cortices:Cortex[]=[]
let selected:Measured|null=null,busy=false,ready=false
let shell:'pial'|'white'|'none'='pial',measurementShell:'pial'|'white'='pial'
let hemisphere='both',ctOpacity=.35,roiOpacity=.45
let representation='both',shaftDiameter=.45,showPlan=true,showMarkers=true,patchDiameter=3
let cortexCache:{tip:string;hits:Map<Cortex,ReturnType<typeof cortexDistance>>}|null=null
const displayClips=new Map<Measured,ReturnType<typeof clipTrackToMask>>()
const painted=new WeakMap<Cortex,string>()
const overlayMeshes=new Map<string,{mesh:NVMesh;sliceMesh?:NVMesh;signature:string}>()
const mm=(value:number)=>value.toFixed(2)+' mm'
const ras=(v:Vec3)=>v.map(n=>n.toFixed(2)).join(' / ')
const actual=(t:Measured)=>t.flip?{start:t.fit.tip,tip:t.fit.start}:{start:t.fit.start,tip:t.fit.tip}
const matchesFrame=()=>!!plan&&!!reference&&reference.sha256===plan.referenceSha256
const activeCortex=()=>cortices.filter(c=>c.kind===shell&&(hemisphere==='both'||c.side===hemisphere||c.side==='unspecified'))
const color=(hex:string)=>new Uint8Array([1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).concat(255))
const canMeasure=()=>!!(selected?.confirmed&&selected.registered&&matchesFrame()&&plan?.tracks.some(p=>p.id===selected!.paired))
const task=<T>(request:EvaluationRequest)=>workerTask<EvaluationRequest,T>(()=>new Worker(new URL('./worker.ts',import.meta.url),{type:'module'}),request)
function fitView(wholeScene=false){
 fitWholeScene=wholeScene
 render.position=[0,0,0];render.setScale(1);render.drawScene()
}
function locate(point:Vec3){if(!reference)return;slices.scene.crosshairPos=slices.mm2frac(point);slices.drawScene()}
function inside(sample:VolumeSampler,p:Vec3){return sample.voxel(p).every((v,i)=>Number.isFinite(v)&&v>=-.5&&v<=sample.dims[i]-.5)}
function requireOverlap(sample:VolumeSampler,points:Vec3[]){
 if(!points.every(p=>inside(sample,p)))throw new Error('A fitted track endpoint lies outside the reference image. Check the mask registration and coordinate space.')
}
function corticalHit(track:Measured){
 const tip=actual(track).tip,key=tip.join(',')
 if(cortexCache?.tip!==key)cortexCache={tip:key,hits:new Map()}
 let best:{surface:Cortex;point:Vec3;distanceMm:number}|null=null
 for(const c of cortices.filter(c=>c.kind===measurementShell)){
  if(!cortexCache.hits.has(c))cortexCache.hits.set(c,cortexDistance(tip,c.mesh.pts,c.mesh.tris!,closestTriangle))
  const hit=cortexCache.hits.get(c)
  if(hit&&(!best||hit.distanceMm<best.distanceMm))best={surface:c,...hit}
 }
 return best
}
function removeOverlay(value:{mesh:NVMesh;sliceMesh?:NVMesh}){render.removeMesh(value.mesh);if(value.sliceMesh)slices.removeMesh(value.sliceMesh)}
function previewRig(pose: Pose|null): void {
 if(rigPreview===pose)return
 rigPreview=pose
 rebuildPlanParts()
 updatePlanPresentation()
 redraw()
}
function updateRig(rig: Stereotax|undefined): void {
 rigPreview=null
 rigEditPreview=undefined
 rigOverride=rig??null
 if(rig)sceneDisplay.layers.stereotax=true
 rebuildPlanParts()
 updatePlanPresentation()
 redraw()
}
function measurementProject(preview=true):Project|null {
 const base=sessionProject??plan?.project;if(!base)return null
 const active=activeStereotax(),rig=preview?(rigEditPreview??(active&&rigPreview?{...active,pose:rigPreview}:active)):active
 return {...base,stereotax:rig}
}
function editMeasurements(change:(p:Project)=>void):boolean {
 const current=measurementProject(false);if(!current||busy)return false
 try{
  const next=projectSnapshot(current);change(next);next.updatedAt=new Date().toISOString()
  sessionProject=validateProject(next,false);rigOverride=sessionProject.stereotax??null
  if(plan)plan.project={...plan.project,landmarks:next.landmarks,measurements:next.measurements,frameCalibration:next.frameCalibration,stereotax:next.stereotax}
  redraw();updateMeasurementPanels(inspector,measurementProject());return true
 }catch(error){failure.hidden=false;failure.textContent=error instanceof Error?error.message:String(error);return false}
}
function saveMeasurements():void {
 run(async()=>{
  const project=measurementProject(false);if(!project||!measurementBundle)return
  await withActivity('Saving project and measurements…',async progress=>{
   const bytes=await runIO({kind:'project',bundle:{project,bytes:measurementBundle!.bytes}},{progress})
   download(project.name.replace(/[^a-zA-Z0-9_-]/g,'_')+'.brainana-plan',bytes)
  })
  status.textContent='Project and measurements downloaded'
 })
}
function rebuildPlanParts(){
 const active=activeStereotax()
 const rig=rigEditPreview??(active&&rigPreview?{...active,pose:rigPreview}:active)
 if(!plan||!reference){
  planParts=rig?stereotaxSceneParts(rig):[]
  return
 }
 const [lo,hi]=imageBounds(reference.sample)
 planParts=parts.build({...plan.project,stereotax:rig},null,{
  colors:sceneColors,enhanceElectrodes:sceneDisplay.enhanceElectrodes,
  center:lo.map((value,i)=>(value+hi[i])/2) as Vec3,surfaces:plan.surfaces,
  placementPoint:null,placementParts:[],
 })
}
function updateDisplayControls(){
 displayControls.update(plan?.project??null,{
  brain:reference?.modality==='mri'||cortices.length>0||planSurfaces.some(s=>s.kind==='brain'),
  skull:reference?.modality==='ct'||planSurfaces.some(s=>s.kind==='skull'),
  stereotax:!!(rigEditPreview??activeStereotax()),
  reference:!!reference,
 })
}
function updatePlanPresentation(){
 if(!ready)return
 planMeshes.update(render,planParts,true,sceneDisplay)
 planMeshes.update(slices,planParts.filter(part=>sceneDisplay.layers[part.layer]),false,sceneDisplay)
 for(const {mesh,kind} of planSurfaces)mesh.opacity=kind==='skull'?sceneDisplay.skullOpacity:sceneDisplay.anatomyOpacity
 updateDisplayControls()
}
function syncRenderReference(){
 if(!reference)return
 const skull=reference.modality==='ct'
 const covered=skull?planSurfaces.some(s=>s.kind==='skull'):cortices.length>0||planSurfaces.some(s=>s.kind==='brain')
 const volumeOpacity=covered?0:skull?sceneDisplay.skullOpacity:sceneDisplay.anatomyOpacity
 if(!renderReference&&volumeOpacity>0)renderReference=reference.sample.image.clone()
 const desired=renderReference&&volumeOpacity>0?renderReference:null
 const state=desired?[desired.id,volumeOpacity].join(':'):''
 if(state===renderVolumeState)return
 renderVolumeState=state
 if(desired)desired.opacity=volumeOpacity
 render.volumes=desired?[desired]:[]
 render.back=desired
 render.overlays=[]
 render.updateGLVolume()
}
function syncSliceImages(){
 if(!ready||!reference)return
 const ordered=[reference.sample.image,...(ct?[ct.image]:[]),...tracks.map(t=>t.image)]
 if(ct)ct.image.opacity=ctOpacity
 for(const t of tracks)t.image.opacity=t.visible?roiOpacity:0
 const nextSliceState=ordered.map(v=>[v.id,v.opacity].join(':')).join()
 if(nextSliceState!==sliceState){
  // Change the whole layer stack once. View-only controls in 3D leave the slice texture alone.
  slices.volumes=ordered
  slices.back=ordered[0]
  slices.overlays=ordered.slice(1)
  slices.updateGLVolume()
  sliceState=nextSliceState
 }
}
function redraw(){
 if(!ready||!reference)return
 syncSliceImages()
 syncRenderReference()
 const shown=new Set(activeCortex())
 for(const c of cortices){
  c.mesh.opacity=shown.has(c)?sceneDisplay.anatomyOpacity:0
  if(!shown.has(c)||painted.get(c)===shading)continue
  const values=morphometry.get(c.side+':'+shading)
  if(!values||values.length!==c.mesh.pts.length/3)c.mesh.rgba255=anatomySurfaceColor()
  else{
   const rgba=new Uint8Array(4*values.length)
   const finite=Array.from(values).filter(Number.isFinite).sort((a,b)=>a-b)
   const lo=finite[Math.floor(.025*finite.length)]??0,hi=finite[Math.floor(.975*finite.length)]??1
   for(let i=0;i<values.length;i++){
    const t=Math.max(0,Math.min(1,(values[i]-lo)/(hi-lo||1)))
    const rgb=shading==='curv'?(values[i]<0?[115,115,124]:[207,207,215]):[60+150*t,95+45*(1-Math.abs(2*t-1)),210-145*t]
    rgba.set([...rgb,255],4*i)
   }
   c.mesh.rgba255=rgba
  }
  c.mesh.updateMesh(render.gl);painted.set(c,shading)
 }
 const used=new Set<string>()
 const add=(key:string,signature:string,geometry:()=>MeshGeometry,hex:string,alpha=1,inSlices=false)=>{
  used.add(key);const old=overlayMeshes.get(key)
  if(old?.signature===signature)return
  if(old)removeOverlay(old)
  const g=geometry(),mesh=new NVMesh(g.pts,g.tris,key,color(hex),alpha,true,render.gl)
  const sliceMesh=inSlices?new NVMesh(g.pts,g.tris,key,color(hex),alpha,true,slices.gl):undefined
  render.addMesh(mesh);if(sliceMesh)slices.addMesh(sliceMesh);overlayMeshes.set(key,{mesh,sliceMesh,signature})
 }
 for(const [i,t] of tracks.entries()){
  if(!t.visible)continue
  const clipped=representation==='clipped'||representation==='clipped-roi'
  if(clipped&&!displayClips.has(t)&&brainMask)displayClips.set(t,clipTrackToMask(t.fit,p=>brainMask!.sample(p,true),nativeSurfaceSpacing(brainMask.image)/4))
  const shaft=clipped?displayClips.get(t):t.fit
  if(representation!=='roi'&&shaft)add('Observed shaft '+i,representation+shaftDiameter,()=>cylinder(shaft.start,shaft.tip,shaftDiameter/2),t.color)
  if(['roi','both','clipped-roi'].includes(representation))add('Observed ROI '+i,representation,()=>t.fit.mesh,t.color,representation==='roi'?.8:.35)
  if(showMarkers&&selected===t){const {start,tip}=actual(t);add('Selected start',start.join(','),()=>sphere(start,.42),'#ffffff');add('Selected tip',tip.join(','),()=>sphere(tip,.56),t.color)}
 }
 const p=matchesFrame()?plan!.tracks.find(p=>p.id===selected?.paired):undefined
 if(showPlan&&p){
  add('Planned shaft',p.id,()=>cylinder(p.start,p.tip,.18),'#38bdf8',1,true)
  add('Planned tip',p.id,()=>sphere(p.tip,.48),'#38bdf8',1,true)
 }
 const hit=showMarkers&&selected?.visible?corticalHit(selected):null
 if(hit&&shown.has(hit.surface)){
  const {surface,point}=hit
  const bounds=imageBounds(reference.sample),center=bounds[0].map((v,i)=>(v+bounds[1][i])/2) as Vec3
  add('Selected endpoint cortex patch',[surface.sha256,...point,patchDiameter,selected!.color].join(','),()=>{
   try{return surfacePaint(surfacePatch([{pts:surface.mesh.pts,tris:surface.mesh.tris!}],[point],patchDiameter/2),center)}
   catch{return sphere(point,.35)}
  },selected!.color)
 }
 for(const [key,value] of overlayMeshes)if(!used.has(key)){removeOverlay(value);overlayMeshes.delete(key)}
 if(sceneDisplay.showIntersections){
  const sources=hardwareIntersectionSurfaces(planParts)
  for(const {mesh,kind} of planSurfaces)if(mesh.tris?.length){
   const name=kind==='brain'?'Brain':'Skull'
   sources.push({pts:mesh.pts,tris:mesh.tris,group:name,name,anatomy:true})
  }
  for(const c of shown)if(c.mesh.tris?.length)
   sources.push({pts:c.mesh.pts,tris:c.mesh.tris,group:'Brain',name:'Brain',anatomy:true})
  for(const [i,track] of tracks.entries()){
   const mesh=overlayMeshes.get('Observed shaft '+i)?.mesh
   if(mesh?.tris?.length)sources.push({pts:mesh.pts,tris:mesh.tris,group:'observed:'+i,name:track.name,penetration:true})
  }
  intersections.update(true,sources)
 }else intersections.update(false,[])
 measurementOverlays.forEach(overlay=>overlay.update(measurementProject()))
 updateMeasurementPanels(inspector,measurementProject())
 slices.drawScene();render.drawScene()
}
function wipe(){
 intersections.update(false,[])
 setObjectDrag(null)
 rigPreview=null
 rigEditPreview=undefined
 for(const value of overlayMeshes.values())removeOverlay(value)
 for(const c of cortices)render.removeMesh(c.mesh)
 for(const {mesh} of planSurfaces)render.removeMesh(mesh)
 planSurfaces=[];planParts=[];parts.clear();plan=null;sessionProject=null;measurementBundle=null;measurementOverlays.forEach(overlay=>overlay.update(null));rigOverride=undefined;rigGeneration++;updatePlanPresentation()
 render.volumes=[];render.back=null;render.overlays=[];renderVolumeState=''
 overlayMeshes.clear();tracks=[];cortices=[];ct=null;brainMask=null;displayClips.clear();morphometry.clear();shading='uniform';representation='both';shell='pial';measurementShell='pial';selected=null;cortexCache=null;sliceState='';renderReference=null
}
function applyReferenceWindow(ref:Reference,settings:Reference['window']=ref.modality==='ct'?{...ctDefaults(ref.sample.image),colormap:'gray'}:ref.window){
 const image=ref.sample.image
 if(image.colormap===settings.colormap&&image.cal_min===settings.min&&image.cal_max===settings.max)return
 if(image.colormap!==settings.colormap)image.colormap=settings.colormap
 image.cal_min=settings.min
 image.cal_max=settings.max
 renderReference=null
 sliceState=''
}
async function loadReference(file:File,space?:string,modality:'mri'|'ct'='mri',settings?:Project['assets'][number]['imageDisplay']){
 const bytes=new Uint8Array(await file.arrayBuffer()),sha256=await hashBytes(bytes)
 if(reference?.sha256===sha256){
  reference.modality=modality
  if(space)reference.space=space
  applyReferenceWindow(reference,settings)
  return
 }
 const image=await NVImage.loadFromFile({file,name:file.name}),sample=new VolumeSampler(image)
 const window={colormap:image.colormap,min:image.cal_min??0,max:image.cal_max??1}
 wipe();reference={name:file.name,sha256,sample,window,bounds:imageBounds(sample),space,modality}
 const frameId=crypto.randomUUID(),asset={id:crypto.randomUUID(),name:file.name,role:'anatomy' as const,frameId,sha256,sourcePath:null,modality}
 sessionProject=createProject(asset,file.name,{kind:'standalone',subject:null,scan:null,sourceRoot:null})
 measurementBundle={project:sessionProject,bytes:new Map([[asset.id,bytes]])}
 applyReferenceWindow(reference,settings)
 syncSliceImages();locate(Array.from(slices.frac2mm([.5,.5,.5])).slice(0,3) as Vec3);fitView()
}
async function loadTrack(file:File){
 if(!reference)throw new Error('Load a reference image or a saved plan first.')
 const sha256=await hashBytes(new Uint8Array(await file.arrayBuffer()))
 if(tracks.some(t=>t.sha256===sha256))throw new Error('This track mask is already loaded.')
 const image=await NVImage.loadFromFile({file,name:file.name}),sampler=new VolumeSampler(image)
 const fit=await task<ReturnType<typeof fitMask>>({kind:'mask',source:{dims:sampler.dims,values:sampler.values,matrix:sampler.voxelToWorld,slope:sampler.slope,intercept:sampler.intercept}})
 requireOverlap(reference.sample,[fit.start,fit.tip])
 const hex=palette[tracks.length%palette.length],rgb=color(hex)
 image.setColormapLabel({R:[0,rgb[0]],G:[0,rgb[1]],B:[0,rgb[2]],A:[0,255],I:[0,1]})
 // Render the same positive-voxel definition used by the fit, in the original NIfTI lattice.
 const slope=image.hdr!.scl_slope||1,intercept=image.hdr!.scl_slope?image.hdr!.scl_inter:0
 image.img=Uint8Array.from(image.img!,v=>Number.isFinite(v*slope+intercept)&&v*slope+intercept>0?1:0)
 image.hdr!.scl_slope=1;image.hdr!.scl_inter=0;image.hdr!.datatypeCode=2;image.hdr!.numBitsPerVoxel=8
 image.cal_min=0;image.cal_max=1
 const track:Measured={name:file.name,sha256,image,fit,color:hex,visible:true,flip:false,confirmed:false,registered:false,paired:''}
 tracks.push(track);selected=track;locate(fit.center)
}
async function loadCortex(file:File,kind:'pial'|'white',fromPlan=false){
 if(!reference)throw new Error('Load the reference image first.')
 const sha256=await hashBytes(new Uint8Array(await file.arrayBuffer()))
 const existing=cortices.find(c=>c.sha256===sha256)
 if(existing){if(!fromPlan)existing.fromPlan=false;return}
 const mesh=await NVMesh.loadFromFile({file,name:file.name,gl:render.gl,rgba255:anatomySurfaceColor(),opacity:sceneDisplay.anatomyOpacity})
 if(!mesh.tris?.length){mesh.unloadMesh(render.gl);throw new Error('The cortical surface contains no triangles.')}
 // This catches gross misalignment, not matching anatomy or identity.
 let count=0
 for(let i=0;i<mesh.pts.length;i+=3*Math.max(1,Math.floor(mesh.pts.length/3000))){
  if(inside(reference.sample,[mesh.pts[i],mesh.pts[i+1],mesh.pts[i+2]]))count++
 }
 if(!count){mesh.unloadMesh(render.gl);throw new Error('The surface does not overlap the reference image. Import a surface in the reference RAS space.')}
 const side=/^(lh|left)[._-]/i.test(file.name)?'left':/^(rh|right)[._-]/i.test(file.name)?'right':'unspecified'
 if(!cortices.length&&shell!=='none'){shell=kind;measurementShell=kind}
 cortices.push({name:file.name,sha256,kind,side,mesh,fromPlan});render.addMesh(mesh)
}
async function loadCT(file:File,fromPlan=false){
 if(!reference)throw new Error('Load the reference image first.')
 const image=await NVImage.loadFromFile({file,name:file.name})
 const [a,b]=imageBounds(new VolumeSampler(image)),[c,d]=imageBounds(reference.sample)
 if(a.some((n,i)=>n>d[i]||b[i]<c[i]))throw new Error('CT and reference image bounds do not overlap. Register them before importing.')
 ct={image,name:file.name,sha256:await hashBytes(new Uint8Array(await file.arrayBuffer())),fromPlan}
}
async function loadPlan(file:File){
 const data=new Uint8Array(await file.arrayBuffer())
 await openPlan(await readProject(data),await hashBytes(data))
}
async function openAutosave(){
 const bundle=await new IndexedDbPersistence().load()
 if(!bundle)throw new Error('No planning autosave is available. Open a saved project instead.')
 await openPlan(bundle,null)
}
async function openPlan(bundle:ProjectBundle,sha256:string|null){
 const p=bundle.project,asset=p.assets.find(a=>a.id===p.frame.referenceAssetId)!
 const file=(a:Project['assets'][number])=>new File([bytesView(bundle.bytes.get(a.id)!)],a.name)
 identifyArms(p)
 const changed=!!reference&&reference.sha256!==asset.sha256
 await loadReference(file(asset),undefined,asset.modality==='ct'?'ct':'mri',asset.imageDisplay)
 sessionProject=p;measurementBundle=bundle
 for(const c of cortices.filter(c=>c.fromPlan))render.removeMesh(c.mesh)
 cortices=cortices.filter(c=>!c.fromPlan)
 cortexCache=null
 if(ct?.fromPlan)ct=null
 for(const {mesh} of planSurfaces)render.removeMesh(mesh)
 planSurfaces=[]
 // Grid comparisons are transient inspection paths rather than saved electrode placements.
 setObjectDrag(null)
 rigPreview=null
 rigEditPreview=undefined
 rigOverride=undefined;rigGeneration++
 if(p.stereotax)sceneDisplay.showIntersections=true
 const project={...p,display:{...p.display,gridPreviewHoles:[]}}
 plan={project,sha256,referenceSha256:asset.sha256,tracks:plannedTracks(p),surfaces:[]}
 for(const t of tracks){t.paired='';t.registered=false}
 const warnings:string[]=[]
 const addSurface=(mesh:NVMesh,a:Project['assets'][number],kind:'skull'|'brain')=>{
  planSurfaces.push({mesh,kind});render.addMesh(mesh)
  if(mesh.tris&&(p.planningSurfaceIds?.includes(a.id)??false))plan!.surfaces.push({pts:mesh.pts,tris:mesh.tris})
 }
 for(const surface of p.assets.filter(a=>a.role==='surface'&&!isCorticalEnvelope(a))){
  try{
   if(surface.surfaceKind!=='skull'&&/(?:pial|white)/i.test(surface.name)){
    await loadCortex(file(surface),/white/i.test(surface.name)?'white':'pial',true)
    const mesh=cortices.find(c=>c.sha256===surface.sha256)?.mesh
    if(mesh?.tris&&p.planningSurfaceIds?.includes(surface.id))plan.surfaces.push({pts:mesh.pts,tris:mesh.tris})
   }else{
    const kind=surface.surfaceKind==='skull'?'skull':'brain'
    const mesh=await NVMesh.loadFromFile({file:file(surface),name:surface.name,gl:render.gl,rgba255:anatomySurfaceColor()})
    addSurface(mesh,surface,kind)
   }
  }catch(error){warnings.push(surface.name+': '+String(error))}
 }
 if(shell!=='none'&&cortices.length&&!cortices.some(c=>c.kind===shell)){
  shell=cortices.some(c=>c.kind==='pial')?'pial':'white'
  measurementShell=shell
 }
 const savedCT=p.assets.find(a=>a.id!==asset.id&&(a.role==='ct'||a.modality==='ct'))
 if(savedCT&&!ct)try{await loadCT(file(savedCT),true)}catch(error){warnings.push(savedCT.name+': '+String(error))}
 for(const a of p.assets.filter(a=>p.planningSurfaceIds?.includes(a.id)&&a.imageDisplay?.skull)){
  const settings=a.imageDisplay!.skull!
  try{
   const image=a.id===asset.id?reference!.sample.image:ct?.sha256===a.sha256?ct.image:await NVImage.loadFromFile({file:file(a),name:a.name})
   const volume=new VolumeSampler(image)
   try{
    const result=await buildCTSurface(volume,settings.threshold,settings.bounds??imageBounds(volume,true),settings)
    if(result.tris.length)addSurface(new NVMesh(result.pts,result.tris,a.name,ctSurfaceColor(),sceneDisplay.skullOpacity,true,render.gl),a,'skull')
   }finally{disposeCTSurface(volume)}
  }catch(error){warnings.push(a.name+': '+String(error))}
 }
 rebuildPlanParts();updatePlanPresentation()
 if(warnings.length){failure.hidden=false;failure.textContent='Some saved images or surfaces could not be shown: '+warnings.join(' • ')}
 status.textContent=(changed?'Replaced the reference; measurements in the previous space were cleared. ':'')+
  `Loaded ${p.name}: ${plan.tracks.length} applied shaft path(s).`
}
async function loadNmt(file:File){
 if(file.size>256*1024*1024)throw new Error('The NMT ZIP exceeds the 256 MB import limit.')
 const files=await task<NmtFile[]>({kind:'nmt',bytes:new Uint8Array(await file.arrayBuffer())}),anat=files.find(f=>f.kind==='anatomy')!
 const from=(f:NmtFile)=>new File([bytesView(f.bytes)],f.name)
 await loadReference(from(anat),'NMT2Sym')
 if(reference)reference.space='NMT2Sym'
 const skipped:string[]=[]
 for(const f of files){
  try{
   if(f.kind==='brainmask'){brainMask=new VolumeSampler(await NVImage.loadFromFile({file:from(f),name:f.name}));displayClips.clear()}
   if(f.kind==='curv'||f.kind==='sulc'){const key=(f.name.startsWith('lh')?'left':'right')+':'+f.kind;morphometry.set(key,readMorphometry(f.bytes));for(const c of cortices)painted.delete(c)}
   if(f.kind==='pial'||f.kind==='white')await loadCortex(from(f),f.kind)
   if(f.kind==='mask'&&!tracks.some(t=>t.name===f.name))await loadTrack(from(f))
  }catch(error){skipped.push(f.name+': '+String(error))}
 }
 if(cortices.some(c=>c.kind==='pial')){shell='pial';measurementShell='pial'}
 shading='uniform'
 status.textContent=`NMT2Sym · ${tracks.length} track(s) · ${cortices.length} surface(s).`
 if(skipped.length){failure.hidden=false;failure.textContent='Skipped: '+skipped.join(' • ')}
}
function run(action:()=>Promise<void>){
 if(busy||!ready)return
 busy=true;failure.hidden=true;status.textContent='Loading and checking data…';drawControls()
 void action().then(()=>{if(status.textContent==='Loading and checking data…')status.textContent='Ready'}).catch(error=>{
  failure.hidden=false;failure.textContent=error instanceof Error?error.message:String(error);status.textContent='Import did not finish'
 }).finally(()=>{busy=false;redraw();drawControls()})
}
const input=(label:string,accept:string,action:(f:File)=>Promise<void>,needsReference=false)=>{
 const b=button(label,()=>chooseFile(accept,f=>{run(()=>action(f));return Promise.resolve()},error=>{failure.hidden=false;failure.textContent=String(error)}))
 b.disabled=busy||!ready||(needsReference&&!reference)
 return b
}
function toggle(label:string,value:boolean,change:(v:boolean)=>void){
 const cb=h('input',{type:'checkbox',checked:value,disabled:busy})
 cb.addEventListener('change',()=>{change(cb.checked);redraw();drawControls()})
 return h('label',{class:'evaluation-check'},[cb,label])
}
const range=(label:string,value:number,change:(v:number)=>void)=>{
 const field=h('input',{type:'range',min:'0',max:'1',step:'.05',value:String(value),ariaLabel:label})
 field.addEventListener('input',()=>{change(field.valueAsNumber);redraw()})
 return h('label',{class:'field'},[h('span',{},[label]),field])
}
function report(){
 if(!canMeasure()||!selected||!plan||!reference)return null
 const p=plan.tracks.find(p=>p.id===selected!.paired)!,a=actual(selected),hit=corticalHit(selected)
 const target=plan.project.targets.find(target=>target.id===p.targetId)
 return {schemaVersion:1,reference:{name:reference.name,sha256:reference.sha256,space:reference.space??null,units:'mm',convention:'RAS+',sharedFrameConfirmed:true},
  plan:{name:plan.project.name,sha256:plan.sha256,source:plan.sha256?'project file':'local autosave',path:p},
  target:target?{id:target.id,name:target.name,point:target.point,region:target.region?.kind??'point',tipInside:target.region?inTargetRegion(target,a.tip):null}:null,
  measured:{name:selected.name,sha256:selected.sha256,path:a,tipEndpoint:selected.flip?'A':'B',positiveVoxels:selected.fit.count,fitRmsMm:selected.fit.rmsMm,method:'PCA of positive mask voxel centres'},
  cortex:hit?{name:hit.surface.name,sha256:hit.surface.sha256,kind:hit.surface.kind,point:hit.point,distanceMm:hit.distanceMm}:null,
  metrics:compareTracks(p,a)}
}
function drawControls(){
 for(const [id,b] of stepButtons){b.setAttribute('aria-pressed',String(sectionId===id));b.disabled=busy}
 projectTitle.textContent=plan?.project.name??reference?.name??'No evaluation data loaded'
 projectTitle.title=plan?.project.name??reference?.name??''
 ctControls.replaceChildren(...(ct?[range('CT overlay opacity',ctOpacity,v=>{ctOpacity=v})]:[]))
 ctControls.hidden=!ct
 displayButton.disabled=!reference
 stereotaxButton.disabled=!reference||busy
 updateDisplayControls()
 if(sectionId==='data'){
  inspector.replaceChildren(
   section('Reference',[
    input('Open saved plan…','.brainana-plan,.zip',loadPlan),
    Object.assign(button('Use last planning autosave',()=>run(openAutosave)),{disabled:busy||!ready}),
    h('div',{class:'button-row'},[input('Load MRI…','.nii,.nii.gz',loadReference),input('Load CT…','.nii,.nii.gz',file=>loadReference(file,undefined,'ct'))]),
    input('Open NMT-share ZIP…','.zip',loadNmt),
    note(reference?reference.name+(reference.space?' · '+reference.space:''):'Open a plan to use its images and geometry, or start with an MRI or CT.'),
    ...(plan?[note(`${plan.tracks.length} planned shaft(s) · ${plan.project.targets.length} target(s)`)]:[]),
   ]),
   section('Measured data',[
    input('Add aligned track mask…','.nii,.nii.gz',loadTrack,true),
    ...(tracks.length?[note(`${tracks.length} measured track(s) loaded`)]:[]),
    input('Add aligned postoperative CT…','.nii,.nii.gz',loadCT,true),
    ...(ct?[note(ct.name)]:[]),
    note('CT is optional. Load one segmented electrode per mask. Align files to the reference before importing.'),
   ]),
   section('Cortical surfaces',[
    input('Add aligned pial surface…','.gii,.stl,.obj,.ply',f=>loadCortex(f,'pial'),true),
    input('Add aligned white surface…','.gii,.stl,.obj,.ply',f=>loadCortex(f,'white'),true),
   ]),
  )
  return
 }
 if(sectionId==='stereotax'){
  const project=measurementProject()
  if(!project){inspector.replaceChildren(note('Load a reference image or plan to define references and measurements.'));return}
  if(inspector.querySelector<HTMLElement>('.measurement-panel')?.dataset.projectId===project.id){updateMeasurementPanels(inspector,project);return}
  inspector.replaceChildren(measurementPanel({current:()=>measurementProject(false),edit:editMeasurements,crosshair:()=>Array.from(slices.frac2mm(slices.scene.crosshairPos)).slice(0,3) as Vec3,locate,configure:()=>{displayWindow?.close();openStereotax()},save:saveMeasurements,saveNote:'Saves the reference, planned objects and measurements as a portable project. Imported measured track files remain separate.'}))
  return
 }
 if(sectionId==='setup'){
  const rig=activeStereotax()
  const setup=button(rig?'Configure stereotax…':'Add stereotax…',()=>{displayWindow?.close();openStereotax()})
  setup.disabled=!reference||busy
  const hardware=[
   ...(plan?.project.headposts??[]).map(post=>({name:post.name,pose:post.pose})),
   ...(plan?.project.chambers??[]).filter(chamber=>chamber.placementState!=='unplaced').map(chamber=>({name:chamber.name,pose:chamber.pose})),
   ...(plan?.project.electrodes??[]).flatMap(electrode=>[
    ...(electrode.direct&&!electrode.direct.unplaced?[{name:electrode.name,pose:electrode.direct.pose}]:[]),
    ...(electrode.connector&&!electrode.connector.unplaced?[{name:electrode.name+' connector',pose:electrode.connector.pose}]:[]),
   ]),
  ]
  inspector.replaceChildren(
   section('Stereotaxic frame',[
    setup,
    ...(rig&&!busy?[objectPoseEditor({
     initial:rig.pose,preview:previewRig,
     apply:pose=>{updateRig({...activeStereotax()!,pose});return true},
     setDrag:drag=>setObjectDrag(drag?{...drag,meshes:()=>planMeshes.pickable(render,'stereotax:')}:null),
     locate:pose=>locate(pose.origin),
    })]:[]),
   ]),
   ...(hardware.length?[section('Hardware from the plan',[
    note('To adjust planned implants, open the project in Planning. Evaluation uses the saved positions for comparison.'),
    ...hardware.map(item=>button('Locate '+item.name,()=>locate(item.pose.origin))),
   ])]:[]),
  )
  return
 }
 const t=selected,hit=t?corticalHit(t):null
 if(sectionId==='tracks'){
  inspector.replaceChildren(
   section('Measured tracks',t?[
    selectField('Selected measured track',t.sha256,tracks.map(v=>({value:v.sha256,label:v.name})),v=>{selected=tracks.find(x=>x.sha256===v)!;locate(selected.fit.center);redraw();drawControls()}),
    selectField('Tip endpoint',t.flip?'A':'B',[{value:'A',label:'A'},{value:'B',label:'B'}],v=>{t.flip=v==='A';t.confirmed=false;locate(actual(t).tip);redraw();drawControls()}),
    readout('Selected tip R / A / S (mm)',ras(actual(t).tip)),
    readout('Fit support',`${t.fit.count} voxels · RMS ${mm(t.fit.rmsMm)}`),
    h('div',{class:'button-row'},[button('Locate track',()=>locate(t.fit.center)),button('Locate selected tip',()=>locate(actual(t).tip)),...(hit?[button('Locate nearest cortex',()=>locate(hit.point))]:[])]),
    ...(hit?[readout('Tip to '+hit.surface.kind+' surface',mm(hit.distanceMm))]:[]),
    toggle('I verified the tip endpoint in the images',t.confirmed,v=>{t.confirmed=v}),
    h('details',{open:visibleTracksExpanded,ontoggle:(event: Event)=>{visibleTracksExpanded=(event.currentTarget as HTMLDetailsElement).open}},[h('summary',{},['Visible tracks']),...tracks.map(track=>toggle(track.name,track.visible,v=>{track.visible=v}))]),
   ]:[note('Add a segmented electrode mask in Data to inspect its fitted track.')]),
   ...(cortices.length?[section('Cortex',[
    selectField('Cortex surface',shell,[{value:'pial',label:'Pial'},{value:'white',label:'White matter'},{value:'none',label:'Hidden'}],v=>{shell=v as typeof shell;if(shell!=='none')measurementShell=shell;redraw();drawControls()}),
    selectField('Hemisphere',hemisphere,[{value:'both',label:'Both'},{value:'left',label:'Left'},{value:'right',label:'Right'}],v=>{hemisphere=v;redraw();drawControls()}),
    ...(morphometry.size?[selectField('Cortex shading',shading,[{value:'uniform',label:'Uniform'},{value:'curv',label:'Curvature'},{value:'sulc',label:'Sulcal depth'}],v=>{shading=v as typeof shading;redraw()})]:[]),
   ])]:[]),
   ...(tracks.length?[section('Track display',[
    selectField('3D track representation',representation,[{value:'both',label:'Measured ROI + fitted shaft'},{value:'roi',label:'Measured ROI'},{value:'shaft',label:'Fitted shaft'},...(brainMask?[{value:'clipped',label:'Brain-clipped shaft'},{value:'clipped-roi',label:'Brain-clipped shaft + ROI'}]:[])],v=>{representation=v;redraw()}),
    range('Slice track opacity',roiOpacity,v=>{roiOpacity=v}),
    numberField('Displayed shaft diameter (mm)',shaftDiameter,v=>{shaftDiameter=v;redraw()},{min:.1,max:3,step:.05}),
    toggle('Show endpoints and cortex patch',showMarkers,v=>{showMarkers=v}),
    ...(cortices.length?[numberField('Cortex patch diameter (mm)',patchDiameter,v=>{patchDiameter=v;redraw()},{min:.5,max:12,step:.5})]:[]),
   ])]:[]),
  )
  return
 }
 const m=report(),path=plan?.tracks.find(p=>p.id===t?.paired)
 inspector.replaceChildren(
  section('Match measured and planned',[
   ...(!plan?[note('Open a plan in Data to compare against its saved coordinates.')]:!plan.tracks.length?[note('This plan has no applied shaft paths to compare.')]:!matchesFrame()?[note('Reopen the plan and import tracks in its reference space.')]:!t?[note('Add a measured track mask in Data.')]:[
    selectField('Measured track',t.sha256,tracks.map(v=>({value:v.sha256,label:v.name})),v=>{selected=tracks.find(track=>track.sha256===v)!;locate(actual(selected).tip);redraw();drawControls()}),
    selectField('Match measured track to planned shaft',t.paired,[{value:'',label:'Choose a shaft…'},...plan.tracks.map(p=>({value:p.id,label:p.name}))],v=>{t.paired=v;redraw();drawControls()}),
    ...(path?[
     h('div',{class:'button-row'},[button('Locate planned entry',()=>locate(path.start)),button('Locate planned tip',()=>locate(path.tip)),button('Locate measured tip',()=>locate(actual(t).tip))]),
     toggle('Highlight matched plan shaft in blue',showPlan,v=>{showPlan=v}),
     toggle('I verified the tip endpoint in the images',t.confirmed,v=>{t.confirmed=v}),
     toggle('I verified this subject and the registration to the plan reference',t.registered,v=>{t.registered=v}),
    ]:[]),
   ]),
  ]),
  ...(plan?.project.targets.length?[section('Saved targets',plan.project.targets.map(target=>
   button('Locate '+target.name,()=>locate(target.point))))]:[]),
  ...(m?[section('Trajectory comparison',[
   readout('Tip displacement',mm(m.metrics.tipErrorMm)),
   readout('Tip offset R / A / S (mm)',ras(m.metrics.tipOffsetRASmm)),
   readout('Along planned direction (+ deeper)',mm(m.metrics.axialTipErrorMm)),
   readout('Across planned direction',mm(m.metrics.lateralTipErrorMm)),
   readout('Trajectory angle difference',m.metrics.directionErrorDegrees.toFixed(2)+'°'),
   readout('Planned / measured span',mm(m.metrics.plannedSpanMm)+' / '+mm(m.metrics.observedSpanMm)),
   ...(m.metrics.tipToTargetPointMm!==undefined?[readout('Tip to planned target point',mm(m.metrics.tipToTargetPointMm))]:[]),
   ...(m.target?.tipInside!=null?[readout('Measured tip in valid target region',m.target.tipInside?'Inside':'Outside')]:[]),
   button('Export comparison JSON',()=>download('electrode-comparison.json',JSON.stringify(m,null,2),'application/json'),'primary'),
  ])]:[]),
 )
}
drawControls()
measurementOverlays=[new MeasurementOverlay(sliceCanvas,slices,'slices'),new MeasurementOverlay(renderCanvas,render,'3d')]
try{
 await slices.attachToCanvas(sliceCanvas);await render.attachToCanvas(renderCanvas,false)
 installAnatomyCompositing(render, () => [
  ...cortices.map(cortex => cortex.mesh), ...planSurfaces.map(surface => surface.mesh),
 ])
 slices.opts.multiplanarShowRender=SHOW_RENDER.NEVER
 applySliceLayout(slices,sliceLayout.value)
 bindViewerKeys([{element:renderCanvas,pan:(right,up)=>{render.position=panCamera(render,right,up);render.drawScene()},fit:()=>fitView()}],()=>!busy&&!!reference)
 render.setSliceType(SLICE_TYPE.RENDER);render.setRenderAzimuthElevation(120,20)
 const observer=new ResizeObserver(()=>{slices.resizeListener();render.resizeListener()});observer.observe(views);observer.observe(sliceCanvas.parentElement!);observer.observe(renderCanvas.parentElement!)
 ready=true;status.textContent='Ready · open a plan, reference image, or NMT ZIP'
 if(new URLSearchParams(window.location.search).get('source')==='autosave')run(openAutosave)
}catch(error){failure.hidden=false;failure.textContent='Could not initialize the image views: '+String(error);status.textContent='Evaluation unavailable'}
drawControls()
