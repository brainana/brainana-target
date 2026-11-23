import assert from 'node:assert/strict'
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
globalThis.document=doc;globalThis.window={devicePixelRatio:1,addEventListener:()=>{},location:{protocol:'http:'}}
doc.createElementNS=(_ns,tag)=>new Element(tag)
Element.prototype.checkValidity=function(){if(this.type==='text')return !!this.value.trim();return this.value!==''&&Number.isFinite(Number(this.value))&&Number(this.value)>=Number(this.min??-Infinity)&&Number(this.value)<=Number(this.max??Infinity)}

const {openChamberSpecifications,chamberSpecificationsPanel}=await import('../src/ui/chamberSpecifications.ts')
const asset={id:'reference',name:'mri.nii',role:'anatomy',modality:'mri',frameId:'frame',sha256:'a'.repeat(64),sourcePath:null}
const p=createProject(asset,'test',{kind:'standalone',subject:null,scan:null,sourceRoot:null}),store=new ProjectStore();store.replace(p)
const ctx={store,project:store.project,edit:fn=>store.edit(fn),refresh:()=>{}}
openChamberSpecifications(ctx)
const input=label=>doc.body.querySelectorAll('input').find(n=>n.ariaLabel===label)
assert.equal(input('Bore / inner diameter (mm)').value,'');assert.equal(store.project.chambers.length,0)
doc.body.querySelectorAll('button').find(n=>n.children.includes('Cancel')).click();assert.equal(store.project.chambers.length,0)
openChamberSpecifications(ctx)
input('Chamber name').value='Left chamber'
for(const [label,value] of [['Bore / inner diameter (mm)',16],['Wall thickness (mm)',1],['Chamber height (mm)',12]]){input(label).value=String(value);input(label).dispatchEvent(new Event('input'))}
assert.ok(doc.body.querySelectorAll('svg').length)
doc.body.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}))
assert.equal(store.project.chambers[0].name,'Left chamber');assert.equal(store.project.chambers[0].placementState,'unplaced');assert.equal(store.project.chambers[0].innerRadius,8)
openChamberSpecifications({...ctx,project:store.project});input('Wall thickness (mm)').value='2'
store.edit(d=>{d.chambers[0].name='Changed elsewhere'})
doc.body.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}))
assert.equal(store.project.chambers[0].wallThickness,1,'A stale specification editor cannot overwrite newer hardware')
const panel=chamberSpecificationsPanel({...ctx,project:store.project})
assert.deepEqual(panel.querySelectorAll('select').map(x=>x.ariaLabel),['Chamber to edit','Chamber mounting method','Grid seating'],'Selections define physical mounting and grid seating, not implantation status')
console.log('Chamber definition requires explicit dimensions; Cancel creates no hardware; save remains unplaced; stale save is rejected (DOM mocked).')

// Rebuilding the inline panel (e.g. after blur or unrelated image updates) retains its draft.
{
 const fresh=new ProjectStore();fresh.replace(createProject(asset,'draft test',{kind:'standalone',subject:null,scan:null,sourceRoot:null}))
 const context={store:fresh,project:fresh.project,edit:fn=>fresh.edit(fn),refresh:()=>{}}
 let inline=chamberSpecificationsPanel(context)
 const field=label=>inline.querySelectorAll('input').find(input=>input.ariaLabel===label)
 for(const [label,value] of [['Chamber name','Unsaved chamber'],['Bore / inner diameter (mm)','18'],['Wall thickness (mm)','1'],['Chamber height (mm)','12']]){field(label).value=value;field(label).dispatchEvent(new Event('input'))}
 const grid=field('Define a guide grid');grid.checked=true;grid.dispatchEvent(new Event('change'))
 inline=chamberSpecificationsPanel(context)
 assert.equal(field('Chamber name').value,'Unsaved chamber');assert.equal(field('Bore / inner diameter (mm)').value,'18');assert.equal(field('Define a guide grid').checked,true)
 assert.equal(inline.querySelectorAll('summary').some(summary=>summary.children.includes('Guide grid dimensions')),false,'The grid label is not a disclosure control')
 assert.equal(fresh.project.chambers.length,0,'Draft edits do not create or delete saved hardware')
 inline.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}))
 assert.equal(fresh.project.chambers[0].innerRadius,9);assert.equal(fresh.project.grids[0].enabled,true)
 console.log('Grid toggling retains unsaved chamber dimensions across panel rebuilds; Save preserves the configured chamber and grid.')
}
// Angled grid dimensions are editable before placement and survive explicit save.
{
 const fresh=new ProjectStore();fresh.replace(createProject(asset,'wedge test',{kind:'standalone',subject:null,scan:null,sourceRoot:null}))
 const context={store:fresh,project:fresh.project,edit:fn=>fresh.edit(fn),refresh:()=>{}}
 const editor=chamberSpecificationsPanel(context)
 const field=label=>editor.querySelectorAll('input').find(n=>n.ariaLabel===label)
 for(const [label,value] of [['Bore / inner diameter (mm)',20],['Wall thickness (mm)',1],['Chamber height (mm)',20]]){field(label).value=String(value);field(label).dispatchEvent(new Event('input'))}
 field('Define a guide grid').checked=true;field('Define a guide grid').dispatchEvent(new Event('change'))
 field('Grid tilt relative to chamber (°)').value='15';field('Grid tilt relative to chamber (°)').dispatchEvent(new Event('input'))
 assert.equal(field('Grid thin-edge thickness (mm)').value,'2')
 field('Grid tilt direction around chamber (°)').value='90';field('Grid tilt direction around chamber (°)').dispatchEvent(new Event('input'))
 editor.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}))
 assert.equal(fresh.project.grids[0].tiltAngle,15);assert.equal(fresh.project.grids[0].tiltAzimuth,90);assert.equal(fresh.project.grids[0].minimumThickness,2);assert.equal(fresh.project.chambers[0].placementState,'unplaced')
 console.log('Angled guide-grid controls preserve wedge dimensions and tilt direction without placing hardware (DOM mocked).')
}

// Headposts require measured dimensions; source references must not invent full device presets.
{
 const {headpostsFeature}=await import('../src/features/headposts.ts')
 const fresh=new ProjectStore();fresh.replace(createProject(asset,'headpost',{kind:'standalone',subject:null,scan:null,sourceRoot:null}))
 const context={store:fresh,project:fresh.project,crosshair:()=>[1,2,3],scene:{setSurfaceFitHandler:()=>{},mountingSurface:{surfaces:[]}},edit:fn=>fresh.edit(fn),refresh:()=>{}}
 let panel=headpostsFeature.render(context),field=label=>panel.querySelectorAll('input').find(x=>x.ariaLabel===label)
 assert.equal(field('Post diameter (mm)').value,'');panel.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));assert.equal(fresh.project.headposts,undefined)
 for(const [label,value] of [['Post diameter (mm)',4],['Post height above baseplate (mm)',15],['Baseplate footprint diameter (mm)',12],['Baseplate thickness (mm)',1]])field(label).value=String(value)
 panel.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));assert.equal(fresh.project.headposts.length,1);assert.deepEqual(fresh.project.headposts[0].pose.origin,[1,2,3]);assert.equal(fresh.project.headposts[0].avoid,true)
 panel=headpostsFeature.render({...context,project:fresh.project});const reference=panel.querySelectorAll('select').find(x=>x.ariaLabel==='Headpost reference');reference.value='thomas-pin';reference.dispatchEvent(new Event('change'));assert.equal(panel.querySelectorAll('input').find(x=>x.ariaLabel==='Post height above baseplate (mm)').value,'7');assert.equal(panel.querySelectorAll('input').find(x=>x.ariaLabel==='Post diameter (mm)').value,'','Unverified diameter remains blank')
 reference.value='mark-ii';reference.dispatchEvent(new Event('change'));for(const [label,value] of [['Post diameter (mm)',4],['Post height above baseplate (mm)',15],['Baseplate footprint diameter (mm)',12],['Baseplate thickness (mm)',1]])panel.querySelectorAll('input').find(x=>x.ariaLabel===label).value=String(value)
 panel.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));assert.equal(fresh.project.headposts.length,1);assert.equal(fresh.project.headposts[0].reference,'mark-ii');assert.equal(fresh.project.headposts[0].mesh,undefined)
 console.log('Headpost UI requires measured custom dimensions, saves crosshair/avoidance state, supplies only documented Thomas pin length, and saves a measured envelope for a published design without STL (DOM mocked).')
}

// Grid clicks toggle comparison trajectories, including blocked holes, without moving the applied electrode.
{
 const {gridFeature}=await import('../src/features/grid.ts'),{addAssembly}=await import('@brainana/planning-core/model.ts'),{seatedGridHeight,trajectory}=await import('@brainana/planning-core/geometry.ts')
 const p=createProject(asset,'grid comparisons',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(p,[0,0,20]);const c=p.chambers[0],g=p.grids[0],e=p.electrodes[0];c.innerRadius=5;c.height=10;g.count=9;g.tiltAngle=25;g.minimumThickness=2;g.seatHeight=seatedGridHeight(c,g);e.depth=25;e.targetId='t';p.targets=[{id:'t',name:'T',point:trajectory(c,g,e).tip,frameId:p.frame.id,color:'#ff6c32',atlas:null}]
 const fresh=new ProjectStore();fresh.replace(p);const context={store:fresh,scene:{},project:fresh.project,selectedElectrode:e.id,edit:fn=>fresh.edit(fn),refresh:()=>{}}
 let root=gridFeature.render(context),cell=(x,y)=>root.querySelectorAll('button').find(b=>b.title?.startsWith(`Grid hole (${x}, ${y})`))
 assert.ok(cell(0,0).className.includes('target-hit'));assert.ok(cell(4,0).className.includes('blocked'));assert.equal(cell(4,0).disabled,false,'Real blocked holes stay visible/selectable for inspection');assert.ok(!cell(4,0).className.includes('outside'))
 cell(0,0).click();cell(4,0).click();assert.equal(fresh.project.display.gridPreviewHoles.length,2);assert.deepEqual(fresh.project.electrodes[0].hole,[0,0]);cell(4,0).click();assert.equal(fresh.project.display.gridPreviewHoles.length,1);assert.deepEqual(fresh.project.display.gridPreviewHoles[0].hole,[0,0])
 console.log('Grid map shows wall-blocked holes in red, marks target hits, supports independent comparison toggles and preserves the actual electrode (DOM mocked).')
}

// Target tools create real spherical/voxel regions, and painting batches add/erase exact cells.
{
 const {targetsFeature}=await import('../src/features/targets.ts')
 const p=createProject(asset,'target tools',{kind:'standalone',subject:null,scan:null,sourceRoot:null});p.targets=[{id:'t',name:'T',point:[1,2,3],frameId:p.frame.id,color:'#ff6c32',atlas:null,displayRadiusMm:2}]
 const fresh=new ProjectStore();fresh.replace(p);let paint=null
 const scene={atlasReadout:()=>null,voxelAt:point=>({center:point.map(Math.round),axes:[[1,0,0],[0,1,0],[0,0,1]]}),setTargetPaintHandler(handler,id){paint=handler;this.targetPaintId=handler?id:undefined}}
 const context={store:fresh,scene,project:fresh.project,crosshair:()=>[4,5,6],edit:(fn,group)=>fresh.edit(fn,group),refresh:()=>{},actions:{openAtlas:()=>{},loadAtlas:()=>{},importBookmarks:()=>{}}}
 let root=targetsFeature.render(context),shape=root.querySelectorAll('select').find(x=>x.ariaLabel==='Valid target geometry');shape.value='sphere';shape.dispatchEvent(new Event('change'));assert.deepEqual(fresh.project.targets[0].region,{kind:'sphere',radiusMm:1});assert.equal(fresh.project.targets[0].displayRadiusMm,2)
 shape.value='voxels';shape.dispatchEvent(new Event('change'));assert.deepEqual(fresh.project.targets[0].region.centers,[[1,2,3]])
 root=targetsFeature.render({...context,project:fresh.project});root.querySelectorAll('button').find(b=>b.children.includes('Paint target voxels in slices')).click();assert.ok(paint);paint([[2,2,3],[3,2,3],[3.01,2,3]]);assert.equal(fresh.project.targets[0].region.centers.length,3,'Duplicate snapped voxels are not added');assert.ok(Object.isFrozen(fresh.project.targets[0].region.centers),'Voxel buffers are shared immutably')
 root=targetsFeature.render({...context,project:fresh.project});root.querySelectorAll('button').find(b=>b.children.includes('Erase target voxels in slices')).click();paint([[2,2,3]]);assert.equal(fresh.project.targets[0].region.centers.length,2);paint([[1,2,3],[3,2,3]]);assert.equal(fresh.project.targets[0].region.centers.length,2,'Erasing every voxel cannot silently save an empty region')
 root=targetsFeature.render({...context,project:fresh.project});root.querySelectorAll('button').find(b=>b.children.includes('Clear voxel region (return to point)')).click();assert.equal(fresh.project.targets[0].region,undefined);assert.equal(paint,null)
 console.log('Target UI separates display/valid radii, seeds reference voxels, batches snapped painting/erasing, rejects empty regions and returns safely to point mode (DOM mocked).')
}
