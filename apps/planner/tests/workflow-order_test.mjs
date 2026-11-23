import assert from 'node:assert/strict'
import {createProject,addAssembly} from '@brainana/planning-core/model.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
import {searchTarget,applyCandidate} from '@brainana/planning-core/optimization.ts'
import {hardwareCatalog,applyHardwarePreset} from '../src/hardware/catalog.ts'
import {confirmSetup,setupValues,setupReady} from '../src/hardware/setup.ts'
import {setUniformLength,setIndividualLength} from '../src/hardware/configuration.ts'
import {ProjectStore} from '../src/state/store.ts'
import {invalidateChangedSurfaceFits} from '../src/state/editEffects.ts'
import {maximumInsertion,minimumInsertion} from '@brainana/planning-core/hardware.ts'
const asset=(id,role,modality)=>({id,name:id+'.nii',role,modality,frameId:'frame',sha256:'a'.repeat(64),sourcePath:null})
const make=modality=>createProject(asset('reference','anatomy',modality),'Order check',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
const target=()=>({id:'target',name:'Target',point:[0,0,0],frameId:'frame',color:'#ffffff',atlas:null})
const surface=new Float32Array([-10,-10,-10,10,-10,-10,-10,10,-10,10,10,-10,-10,-10,10,10,-10,10,-10,10,10,10,10,10])
const permutations=xs=>xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map(rest=>[x,...rest])):[[]]
let orders=0,transitions=0,blocked=0
for(const modality of ['mri','ct'])for(const order of permutations(['chamber','target','hardware','link','surface'])){
 const store=new ProjectStore();store.replace(make(modality));let haveSurface=false
 const actions={
  chamber:p=>{if(p.chambers.length)return;addAssembly(p,[0,0,30]);p.chambers[0].height=6;p.chambers[0].placementState='unplaced'},
  target:p=>{if(!p.targets.length)p.targets.push(target())},
  hardware:p=>{if(!p.electrodes.length)return false;const id=p.electrodes[0].targetId;applyHardwarePreset(p.electrodes[0],hardwareCatalog[0]);p.electrodes[0].targetId=id;confirmSetup(p.electrodes[0],{...setupValues(p.electrodes[0]),length:50})},
  link:p=>{if(!p.electrodes.length||!p.targets.length)return false;p.electrodes[0].targetId='target'},
  surface:p=>{if(!p.assets.some(a=>a.id==='skull'))p.assets.push({...asset('skull','surface'),surfaceKind:'skull'});haveSurface=true},
 }
 const pending=[]
 for(const name of order){let ready;store.edit(p=>{ready=actions[name](p)});transitions++;if(ready===false){pending.push(name);blocked++}validateProject(store.project)}
 for(let pass=0;pending.length&&pass<3;pass++)for(let i=pending.length-1;i>=0;i--){let ready;store.edit(p=>{ready=actions[pending[i]](p)});transitions++;if(ready!==false)pending.splice(i,1)}
 assert.equal(pending.length,0)
 const p=store.project,e=p.electrodes[0];assert.ok(haveSurface);assert.ok(setupReady(e));assert.equal(e.targetId,'target')
 const options={surface,expand:true},result=searchTarget(p,e.id,'target',options)
 assert.ok(result.candidates.length,order.join(' → '))
 assert.equal(p.chambers[0].placementState,'unplaced')
 store.edit(d=>applyCandidate(d,e.id,'target',result.candidates[0],options));transitions++
 assert.equal(store.project.chambers[0].placementState,undefined)
 store.undo();assert.equal(store.project.chambers[0].placementState,'unplaced');store.redo();assert.equal(store.project.chambers[0].placementState,undefined);transitions+=2
 const before=store.project;assert.throws(()=>store.edit(d=>{d.chambers[0].height=-1}));assert.deepEqual(store.project,before)
 store.edit(d=>{d.targets=[];for(const e of d.electrodes)e.targetId=null});assert.equal(store.project.electrodes[0].targetId,null)
 store.undo();assert.equal(store.project.electrodes[0].targetId,'target');store.redo();assert.equal(store.project.targets.length,0);transitions+=3
 store.undo();store.edit(d=>{d.targets[0].point=[5,4,3]});assert.equal(store.canRedo,false)
 assert.throws(()=>store.edit(d=>applyCandidate(d,e.id,'target',result.candidates[0],options)),/no longer valid/)
 store.clear();assert.equal(store.project,null);assert.equal(store.canUndo,false);assert.equal(store.canRedo,false)
 orders++
}
let pairs=0
for(const first of hardwareCatalog)for(const second of hardwareCatalog){
 const p=make('mri');addAssembly(p,[0,0,30]);p.targets.push(target());p.electrodes[0].targetId='target'
 for(const preset of [first,second]){
  const e=p.electrodes[0],id=e.targetId;applyHardwarePreset(e,preset);e.targetId=id;confirmSetup(e,setupValues(e));validateProject(p)
  assert.ok(setupReady(e));assert.equal(e.targetId,'target');assert.ok(e.depth>=minimumInsertion(e)&&e.depth<=maximumInsertion(e))
  const draft=structuredClone(e);draft.name='canceled edit';assert.notEqual(e.name,draft.name)
 }
 pairs++
}
for(const preset of hardwareCatalog.filter(p=>['micro-fma','custom-array'].includes(p.id))){
 const p=make('mri');addAssembly(p,[0,0,30]);const e=p.electrodes[0];applyHardwarePreset(e,preset);confirmSetup(e,setupValues(e))
 setUniformLength(e,3);setIndividualLength(e,0,2);e.depth=Math.max(minimumInsertion(e),Math.min(e.depth,maximumInsertion(e)));validateProject(p)
 assert.equal(e.hardware.configuration.lengthProfile,'Individual lengths');setUniformLength(e,3);assert.equal(e.hardware.shankLengths.length,0);assert.equal(e.hardware.configuration.lengthProfile,'Uniform')
}
console.log(`${orders} complete setup orderings (${transitions} state transitions, ${blocked} prerequisite-blocked actions revisited), ${pairs} ordered hardware-family switches, stale candidate rejection, history/delete/reset and individual/uniform length checks passed.`)

// A CT-derived rim is legal, but segmentation changes must invalidate it.
{
 const p=make('ct');addAssembly(p,[0,0,30]);const ct=p.assets[0];p.planningSurfaceIds=[ct.id]
 ct.imageDisplay={min:0,max:1000,opacity:.5,colormap:'gray',visible:true,skull:{threshold:300,bounds:[[-10,-10,-10],[10,10,10]],show:true,useForPlanning:true}}
 const profile={source:'skull',assetIds:[ct.id],gap:.5,innerDepths:Array(64).fill(3),outerDepths:Array(64).fill(3)}
 p.chambers[0].baseFit=structuredClone(profile);validateProject(p)
 for(const change of [a=>{a.imageDisplay.skull.center=[0,1,0]},a=>{a.imageDisplay.skull.componentSeed=[9,0,0]},a=>{a.imageDisplay.skull.representation='outer'},a=>{a.imageDisplay.skull.threshold=400},a=>{a.imageDisplay.skull.spacingMm=1},a=>{a.imageDisplay.skull.components='largest'},a=>{a.imageDisplay.skull.bounds[0][0]=-8},a=>{a.imageDisplay.skull.useForPlanning=false},a=>{delete a.imageDisplay.skull}]){
  const candidate=structuredClone(p),before=structuredClone(candidate.assets);change(candidate.assets[0]);invalidateChangedSurfaceFits(candidate,before);assert.equal(candidate.chambers[0].baseFit,undefined);validateProject(candidate)
 }
 for(const change of [a=>{a.imageDisplay.opacity=.1},a=>{a.imageDisplay.colormap='bone'},a=>{a.imageDisplay.skull.show=false}]){
  const candidate=structuredClone(p),before=structuredClone(candidate.assets);change(candidate.assets[0]);invalidateChangedSurfaceFits(candidate,before);assert.deepEqual(candidate.chambers[0].baseFit,profile);validateProject(candidate)
 }
 console.log('CT rim validation and invalidation on changed threshold/crop/planning selection, while preserving fits for display-only changes, passed.')
}

{
 const p=make('mri');addAssembly(p,[100,-100,-100]);p.chambers[0].placementState='unplaced';p.targets.push(target());p.electrodes[0].targetId='target'
 const first=searchTarget(p,p.electrodes[0].id,'target',{surface,expand:true})
 p.chambers[0].pose.origin=[-100,100,200]
 const second=searchTarget(p,p.electrodes[0].id,'target',{surface,expand:true})
 assert.ok(first.candidates.length);assert.deepEqual(first.candidates,second.candidates,'Unplaced hardware uses target/surface, not an arbitrary creation origin')
 console.log('Automatic new-placement preference is independent of the undefined chamber origin.')
}

{
 const {settings}=await import('@brainana/planning-core/optimization.ts')
 const {gridHoles}=await import('@brainana/planning-core/geometry.ts')
 const p=make('mri');addAssembly(p,[0,0,30]);p.targets.push(target());const e=p.electrodes[0];e.targetId='target'
 p.avoidRegions=[{id:'blocked',name:'Target exclusion',frameId:p.frame.id,center:[0,0,0],radius:3},{id:'far',name:'Far region',frameId:p.frame.id,center:[100,100,100],radius:2}]
 const options={surface,expand:true}
 assert.equal(searchTarget(p,e.id,'target',options).candidates.length,0,'All marked areas constrain search by default')
 p.planning={...settings(p),avoidRegionIds:['far']};validateProject(p)
 assert.ok(searchTarget(p,e.id,'target',options).candidates.length,'Unselected exclusions must not silently constrain the selected search')
 p.planning.avoidRegionIds=['blocked'];assert.equal(searchTarget(p,e.id,'target',options).candidates.length,0)
 p.planning.avoidRegionIds=['missing'];assert.throws(()=>validateProject(p),/selected avoidance/)
 p.planning.avoidRegionIds=[];p.grids[0].enabled=false;validateProject(p);assert.deepEqual(gridHoles(p.chambers[0],p.grids[0]),[[0,0]])
 console.log('Selected avoidance subsets control search; invalid IDs are rejected; disabled guide grids have no off-centre access holes.')
}
