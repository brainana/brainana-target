import assert from 'node:assert/strict'
import {setMaxListeners} from 'node:events'
import {createProject,addAssembly} from '@brainana/planning-core/model.ts'
class Element extends EventTarget {
 constructor(tag='div'){super();this.tagName=tag;this.children=[];this.style={setProperty(k,v){this[k]=v}};this.dataset={};this.attributes=new Map();this.value='';this.textContent='';this.classList={toggle:()=>{},add:()=>{},remove:()=>{}}}
 get isConnected(){return this===globalThis.document.body||!!this.parent?.isConnected}
 get options(){return this.children.filter(c=>c.tagName==='option')}
 get valueAsNumber(){return Number(this.value)}
 set valueAsNumber(v){this.value=String(v)}
 append(...nodes){for(const n of nodes){if(typeof n==='object'&&n.parent)n.remove();this.children.push(n);if(typeof n==='object')n.parent=this}}
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
 focus(){}
 setPointerCapture(){}
 reportValidity(){return true}
}
const doc=new EventTarget();setMaxListeners(0,doc); // Lifecycle matrix intentionally creates many independent guide instances.
doc.createElement=tag=>new Element(tag);doc.body=new Element('body');doc.documentElement=new Element('html');doc.activeElement=null
globalThis.document=doc;globalThis.window={devicePixelRatio:1,addEventListener:()=>{},location:{protocol:'http:'}}
doc.createElementNS=(_ns,tag)=>new Element(tag)
Element.prototype.checkValidity=function(){if(this.type==='text')return !!this.value.trim();return this.value!==''&&Number.isFinite(Number(this.value))&&Number(this.value)>=Number(this.min??-Infinity)&&Number(this.value)<=Number(this.max??Infinity)}


doc.querySelector=()=>null;doc.querySelectorAll=()=>[];globalThis.window.setInterval=()=>0
Element.prototype.getAttribute=function(k){return this.attributes.get(k)??null}
Object.defineProperty(Element.prototype,'parentElement',{get(){return this.parent}})
const {planningGuide}=await import('../src/ui/planningGuide.ts')
const {hardwareCatalog,applyHardwarePreset}=await import('../src/hardware/catalog.ts')
const {confirmSetup,setupValues}=await import('../src/hardware/setup.ts')
const asset={id:'reference',name:'mri.nii',role:'anatomy',modality:'mri',frameId:'frame',sha256:'a'.repeat(64),sourcePath:null}
// The import step gets exactly one group boundary, with no extra header highlight.
{
 const heading=new Element('h3'),region=new Element('section');heading.textContent='Add aligned data';heading.offsetWidth=100;region.append(heading);doc.body.append(region)
 let headerOutlined=false
 heading.classList={add:()=>{headerOutlined=true},remove:()=>{headerOutlined=false}}
 heading.closest=selector=>selector==='.control-section'?region:null
 region.getBoundingClientRect=()=>({left:20,right:400,top:20,bottom:600})
 doc.querySelectorAll=()=>[heading];globalThis.window.innerWidth=1000;globalThis.window.innerHeight=800
 const groupProject=createProject(asset,'group',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
 const groupGuide=planningGuide({project:()=>groupProject,navigate:()=>{}});groupGuide.start()
 assert.equal(groupGuide.element.querySelector('h2').children[0],'Optional: add images and overlays')
 assert.equal(headerOutlined,false,'The import header must not receive a second outline')
 const boundary=doc.body.children.find(n=>n.className==='guide-boundary guide-region'&&!n.hidden)
 const action=doc.body.children.find(n=>n.className==='guide-boundary guide-action'&&!n.hidden)
 assert.ok(boundary);assert.equal(action,undefined,'Only the encompassing boundary is visible')
 doc.querySelectorAll=()=>[]
}
const p=createProject(asset,'test',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(p,[0,0,30]);p.targets.push({id:'target',name:'Target',point:[0,0,0],frameId:'frame',color:'#ffffff',atlas:null})
let location='';const guide=planningGuide({project:()=>p,hasPlanningSurface:()=>true,navigate:feature=>{location=feature}});guide.start()
const title=()=>guide.element.querySelector('h2').children[0]
for(let i=0;i<15&&title()!=='Define electrode hardware';i++){
 const next=guide.element.querySelectorAll('button').find(button=>button.children.includes('Next step'));assert.ok(next&&!next.disabled);next.click()
}
assert.equal(title(),'Define electrode hardware');guide.refresh();assert.equal(title(),'Define electrode hardware','Opening/canceling configuration cannot complete hardware definition')
applyHardwarePreset(p.electrodes[0],hardwareCatalog[0]);confirmSetup(p.electrodes[0],setupValues(p.electrodes[0]));guide.refresh()
assert.equal(location,'positioning');assert.equal(title(),'Choose hardware and constraints','Applying custom hardware advances directly to Position')
const {sceneControls}=await import('../src/ui/sceneControls.ts');const {defaultSceneDisplay}=await import('../src/render/display.ts')
const display=defaultSceneDisplay();let controls
controls=sceneControls(display,patch=>{const {layers,...rest}=patch;Object.assign(display,rest);Object.assign(display.layers,layers);controls.update(p)})
controls.update(p)
const brain=controls.element.querySelectorAll('button').find(button=>button.attributes.get('aria-label')==='Toggle brain visibility in 3D')
brain.click();assert.equal(display.anatomyOpacity,0);assert.equal(brain.getAttribute('aria-pressed'),'false');brain.click();assert.equal(display.anatomyOpacity,.3);assert.equal(display.skullOpacity,.85)
const chamber=controls.element.querySelectorAll('button').find(button=>button.attributes.get('aria-label')==='Toggle chamber visibility in 3D')
chamber.click();assert.equal(display.chamberOpacity,0);assert.equal(display.implantOpacity,.8)
chamber.click();assert.equal(display.chamberOpacity,.8)
const targets=controls.element.querySelectorAll('button').find(button=>button.children.includes('Targets'))
targets.click();assert.equal(display.layers.targets,false);assert.equal(controls.details.querySelectorAll('input').find(input=>input.ariaLabel==='Show targets in 3D').checked,false)
console.log('Guide remains on hardware until Apply then goes directly to Position; quick 3D controls restore opacity and synchronize visibility (DOM mocked).')
// One chamber + confirmed electrode + one target should require no extra target-link click.
{
 const {targetingPanel}=await import('../src/features/targeting.ts')
 p.chambers[0].placementState='unplaced';p.electrodes[0].targetId=null
 const scene={placementSurface:null}, context={project:p,store:{project:p},scene,selectedElectrode:p.electrodes[0].id,edit:fn=>fn(p),refresh:()=>{},selectElectrode:()=>{},previewPlacement:()=>{},actions:{manageImages:()=>{},loadSkullSurface:()=>{}}}
 const compute=panel=>panel.querySelectorAll('button').find(button=>button.children.includes('Compute placement candidates'))
 let panel=targetingPanel(context)
 assert.equal(panel.querySelectorAll('button').find(b=>b.children.includes('A · Manual')).getAttribute('aria-selected'),'true')
 panel.querySelectorAll('button').find(b=>b.children.includes('B · Automatic')).click()
 panel=targetingPanel(context)
 assert.equal(compute(panel).disabled,true);assert.match(compute(panel).title,/planning surface/i)
 scene.placementSurface=new Float32Array([-10,-10,-10,10,10,10])
 panel=targetingPanel(context);assert.equal(compute(panel).disabled,false,'A ready surface and single target enable search without an extra linking action')
 assert.equal(panel.querySelectorAll('select').find(select=>select.ariaLabel==='Select target').value,'target')
 assert.equal(p.electrodes[0].targetId,null,'Automatic selection is committed with the applied candidate, not by merely rendering controls')
 const hardware=p.electrodes[0].hardware;delete p.electrodes[0].hardware
 panel=targetingPanel(context);assert.equal(compute(panel).disabled,true);assert.match(compute(panel).title,/configure/i)
 p.electrodes[0].hardware=hardware
 console.log('Placement readiness distinguishes missing surface/hardware; a single target is selected automatically and ready inputs enable Compute.')
}

// Surface selection previews validated orientation/rim without mutating the saved project.
{
 const {targetingPanel}=await import('../src/features/targeting.ts')
 const q=createProject({...asset},'Surface selection',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(q,[0,0,20])
 q.chambers[0].placementState='unplaced';q.chambers[0].innerRadius=7;q.chambers[0].wallThickness=1;q.chambers[0].height=12
 q.assets.push({...q.assets[0],id:'skull',name:'skull.obj',role:'surface',surfaceKind:'skull'})
 q.targets=[{id:'t',name:'Target',point:[0,0,-5],frameId:q.frame.id,color:'#fff',atlas:null}]
 q.planning={mode:'new',seed:null,searchRadius:10,searchStep:8,maxMiss:.5,margin:0}
 const e=q.electrodes[0];applyHardwarePreset(e,hardwareCatalog.find(h=>h.id==='custom-linear'));confirmSetup(e,setupValues(e))
 const pts=[],tris=[],n=21
 for(let y=-20;y<=20;y+=2)for(let x=-20;x<=20;x+=2)pts.push(x,y,0)
 for(let y=0;y<20;y++)for(let x=0;x<20;x++){const a=x+y*n;tris.push(a,a+1,a+n,a+1,a+n+1,a+n)}
 const surface={pts:new Float32Array(pts),tris:new Uint32Array(tris),outerEnvelope:true}
 let samples=[],pick,previewed,commit
 const scene={placementSurface:surface.pts,mountingSurface:{source:'skull',assetIds:['skull'],surfaces:[surface]},setPlacementMap:(c,_spacing,select)=>{samples=c;pick=select},setPlacementSelection:()=>{}}
 const context={project:q,store:{get project(){return structuredClone(q)}},scene,selectedElectrode:e.id,edit:fn=>fn(q),refresh:()=>{},selectElectrode:()=>{},previewPlacement:(project,_label,apply)=>{previewed=project;commit=apply},actions:{}}
 const before=structuredClone(q)
 targetingPanel(context).querySelectorAll('button').find(b=>b.children.includes('B · Automatic')).click()
 const panel=targetingPanel(context)
 panel.querySelectorAll('button').find(b=>b.children.includes('Compute placement candidates')).click()
 await Promise.resolve()
 assert.ok(samples.length>1);assert.ok(previewed);assert.deepEqual(q,before)
 const selected=samples.at(-1);pick(selected)
 assert.deepEqual(previewed.chambers[0].pose,selected.pose)
 assert.deepEqual(previewed.chambers[0].baseFit,selected.baseFit)
 assert.deepEqual(q,before,'Clicking another mapped sample must not apply it')
 assert.ok(panel.querySelectorAll('h3').some(h=>h.children.includes('Selected surface location')))
 panel.querySelectorAll('button').find(b=>b.children.includes('Hide feasible-center overlay')).click();assert.equal(samples.length,0)
 panel.querySelectorAll('button').find(b=>b.children.includes('Show feasible-center overlay')).click();assert.ok(samples.length>1)
 commit();await Promise.resolve();assert.deepEqual(q.chambers[0].pose,selected.pose);assert.equal(q.chambers[0].placementState,undefined)
 assert.ok(!targetingPanel(context).querySelectorAll('h3').some(h=>h.children.includes('Selected surface location')),'Applying changes the search key and drops stale results')
 let tabPanel=targetingPanel(context)
 const tabs=()=>tabPanel.querySelectorAll('button').filter(b=>b.getAttribute('role')==='tab')
 assert.equal(tabs().length,2);assert.equal(tabs()[1].getAttribute('aria-selected'),'true')
 tabs()[0].click();tabPanel=targetingPanel(context)
 assert.equal(tabs()[0].getAttribute('aria-selected'),'true')
 assert.equal(tabPanel.querySelectorAll('button').find(b=>b.children.includes('Compute placement candidates')),undefined,'Manual tab hides global compute action')
 assert.ok(tabPanel.querySelectorAll('button').find(b=>b.children.includes('Choose skull location to fit')))
 assert.ok(tabPanel.querySelectorAll('section').some(s=>s.role==='tabpanel'&&s.id==='placement-manual'))
 tabs()[1].click();tabPanel=targetingPanel(context)
 assert.ok(tabPanel.querySelectorAll('button').find(b=>b.children.includes('Compute placement candidates')))
 assert.equal(tabPanel.querySelectorAll('button').find(b=>b.children.includes('Choose skull location to fit')),undefined,'Automatic tab hides manual click-to-fit action')
 console.log('Surface map selection previews the selected validated pose and rim, supports hide/show, and commits only on Place (DOM mocked).')
}

// Project metadata can be drafted before loading any image.
{
 const metadata=await import('../src/features/data.ts')
 let panel=metadata.dataFeature.render({project:null})
 const name=panel.querySelector('input');name.value='Subject A · intervention';name.dispatchEvent(new Event('change'))
 panel=metadata.dataFeature.render({project:null});assert.equal(panel.querySelector('input').value,'Subject A · intervention')
 assert.equal(metadata.dataFeature.glyph,'▤');metadata.clearPendingProjectName();assert.equal(metadata.pendingProjectName,'')
}
// The surface stage waits for geometry, not just an image; successful setup advances.
{
 let ready=false, current='';const surfaceGuide=planningGuide({project:()=>p,hasPlanningSurface:()=>ready,navigate:f=>{current=f}})
 surfaceGuide.start()
 const next=()=>surfaceGuide.element.querySelectorAll('button').find(b=>b.children.includes('Next step'))
 next().click()
 assert.equal(current,'surface');assert.equal(surfaceGuide.element.querySelector('h2').children[0],'Define the planning surface')
 assert.equal(next().disabled,true)
 ready=true;surfaceGuide.refresh();assert.equal(current,'avoidance');assert.equal(surfaceGuide.element.querySelector('h2').children[0],'Optional: draw exclusions')
}
console.log('Pre-image project names persist in draft; guided surface setup waits for a real surface and advances only when ready.')
// Live drafts remain isolated; Finalize produces and selects an isosurface in one action.
{
 Element.prototype.insertBefore=function(node,reference){const i=this.children.indexOf(reference);if(i<0)this.append(node);else{this.children.splice(i,0,node);node.parent=this}}
 Element.prototype.replaceWith=function(next){if(this.parent){const parent=this.parent,index=parent.children.indexOf(this);parent.children[index]=next;next.parent=parent;this.parent=null}}
 const oldContext=Element.prototype.getContext
 Element.prototype.getContext=function(){return this.context??= {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{this.painted=true},beginPath:()=>{},moveTo:()=>{},lineTo:()=>{this.lines=(this.lines??0)+1},stroke:()=>{},fillText(){this.labelColors??=[];this.labelColors.push(this.strokeStyle)}}}
 const {planningSurfaceWorkspace}=await import('../src/ui/planningSurface.ts')
 const {NVImage}=await import('@niivue/niivue')
 const values=Float32Array.from({length:1000},(_,i)=>{const x=i%10,y=Math.floor(i/10)%10,z=Math.floor(i/100);const r=Math.hypot(x-4.5,y-4.5,z-4.5);return r>=2&&r<=3.8?1000:0})
 const image=await NVImage.loadFromUrl({url:NVImage.createNiftiArray([10,10,10],[1,1,1],[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],16,new Uint8Array(values.buffer)),name:'ct.nii'})
 let project=createProject({...asset,modality:'ct'},'Surface preparation',{kind:'standalone',subject:null,scan:null,sourceRoot:null}),prepared=null
 const scene={imageForAsset:()=>image,defaultsForImage:()=>undefined,prepareCTPreview:(_id,_key,geometry)=>{prepared=geometry},get surfaceCandidates(){return []},get mountingSurface(){return {assetIds:project.assets[0].imageDisplay?.skull?.useForPlanning?['reference']:[]}}}
 const workspace=planningSurfaceWorkspace({project:()=>project,scene,edit:fn=>fn(project),importSkull:()=>{},importBrain:()=>{},addCT:()=>{}})
 const sidebar=workspace.panel();doc.body.append(sidebar)
 sidebar.querySelectorAll('button').find(b=>b.children.includes('Open surface editor…')).click()
 const root=()=>doc.body.querySelectorAll('div').find(n=>n.className==='surface-workspace')
 const btn=name=>root().parent.parent.querySelectorAll('button').find(b=>b.children.includes(name))
 const field=name=>root().querySelectorAll('input').find(b=>b.ariaLabel===name)
 const originalRoot=root()
 sidebar.querySelectorAll('button').find(b=>b.children.includes('Open surface editor…')).click()
 assert.equal(root(),originalRoot,'Repeated Open must preserve the same editor and live draft')
 assert.equal(root().querySelectorAll('div').filter(n=>n.className==='surface-editor-controls').length,1)
 workspace.cancel()
 assert.ok(root().isConnected,'Changing main tabs must leave the dedicated editor open')
 const panes=root().querySelectorAll('div').find(n=>n.className==='surface-visual-panes')
 assert.deepEqual(panes.children.map(n=>n.className),['surface-ct-review','surface-view-divider','surface-live-preview'],'3D and CT slices must occupy separate bounded panes')
 const divider=panes.children[1];panes.getBoundingClientRect=()=>({left:10,width:500})
 const down=new Event('pointerdown');Object.assign(down,{button:0,pointerId:1});divider.dispatchEvent(down)
 const move=new Event('pointermove');Object.assign(move,{pointerId:1,clientX:360});divider.dispatchEvent(move)
 assert.equal(panes.style['--surface-slices'],'70fr');assert.equal(panes.style['--surface-model'],'30fr')
 divider.dispatchEvent(new Event('pointerup'));divider.dispatchEvent(new Event('dblclick'));assert.equal(panes.style['--surface-slices'],'35fr')
 assert.equal(field('3D and CT slice size split'),undefined)
 assert.equal(btn('Top'),undefined);assert.equal(btn('Fit preview'),undefined)
 assert.equal(btn('Finalize surface').parent.className,'window-actions')
 assert.equal(field('Bone threshold').value,'500','A new surface cutoff must start at the midpoint of its slider')
 field('Bone threshold').value='650';field('Bone threshold').dispatchEvent(new Event('input'))
 btn('Reset draft').click();assert.equal(field('Bone threshold').value,'500','Reset before finalization restores starting defaults');assert.equal(project.assets[0].imageDisplay,undefined)
 assert.equal(btn('Reset draft').parent,btn('Finalize surface').parent,'Reset must sit beside Finalize in the header')
 const previewCanvas=root().querySelectorAll('canvas').find(c=>c.ariaLabel==='Live surface preparation preview')
 assert.equal(previewCanvas.parent.className,'surface-preview-viewport','GPU canvas must resize within its own bounded viewport, not the controls container')
 assert.equal(btn('Build surface preview'),undefined);assert.equal(field('I inspected the surface alignment and coverage'),undefined)
 assert.equal(btn('Finalize surface').disabled,true)
 await new Promise(resolve=>setTimeout(resolve,340))
 assert.equal(project.assets[0].imageDisplay,undefined,'Live preview cannot edit image or planning settings')
 assert.equal(prepared,null,'Live drafts do not enter the main scene cache')
 const reviews=root().querySelectorAll('canvas').filter(c=>c.ariaLabel?.startsWith('CT surface review'))
 assert.equal(reviews.length,3)
 assert.ok(reviews.every(c=>c.painted&&c.lines>4),'Every CT review slice must draw pixels and mesh contours')
 assert.equal(btn('Finalize surface').disabled,false)
 field('Bone threshold').value='500';field('Bone threshold').dispatchEvent(new Event('input'))
 assert.equal(btn('Finalize surface').disabled,true)
 await new Promise(resolve=>setTimeout(resolve,340))
 assert.equal(project.assets[0].imageDisplay,undefined)
 btn('Erase').click();assert.equal(btn('Erase').getAttribute('aria-pressed'),'true')
 const slice=reviews[0];slice.getBoundingClientRect=()=>({left:0,top:0,width:200,height:200})
 const pointer=(name,x)=>{const e=new Event(name);Object.assign(e,{button:0,pointerId:7,clientX:x,clientY:100});slice.dispatchEvent(e)}
 pointer('pointerdown',170);pointer('pointermove',174);pointer('pointerup',174)
 assert.equal(btn('Finalize surface').disabled,true,'A brush stroke must invalidate the old candidate before rebuilding')
 await new Promise(resolve=>setTimeout(resolve,340))
 assert.equal(project.assets[0].imageDisplay,undefined,'Unfinalized brush strokes must not mutate the project')
 btn('Undo brush stroke').click();await new Promise(resolve=>setTimeout(resolve,340))
 assert.equal(btn('Redo brush stroke').disabled,false)
 btn('Redo brush stroke').click();await new Promise(resolve=>setTimeout(resolve,340))
 btn('Finalize surface').click();await new Promise(resolve=>setTimeout(resolve,0))
 assert.equal(root(),undefined,'Successful Finalize closes the editor')
 assert.ok(workspace.panel().querySelectorAll('p').some(n=>n.children.some(t=>typeof t==='string'&&t.startsWith('Surface finalized'))),'Finalization must expose a persistent success notice')
 sidebar.querySelectorAll('button').find(b=>b.children.includes('Open surface editor…')).click();await new Promise(resolve=>setTimeout(resolve,340))
 assert.equal(project.assets[0].imageDisplay.skull.threshold,500);assert.equal(project.assets[0].imageDisplay.skull.representation,'smooth')
 assert.equal(project.assets[0].imageDisplay.skull.edits.length,1,'Finalizing must save the physical brush stroke')
 assert.equal(project.assets[0].imageDisplay.skull.useForPlanning,true);assert.deepEqual(project.planningSurfaceIds,['reference'])
 assert.ok(prepared.tris.length>0)
 project.surfaceOpenings=[{id:'external-opening',name:'Opening',frameId:project.frame.id,assetId:'reference',assetSha256:project.assets[0].sha256,surfaceKey:'external-key',center:[4.5,4.5,4.5],radius:1,origin:'manual',reviewed:true,avoid:false}]
 workspace.cancel();assert.ok(root().querySelectorAll('select').find(s=>s.ariaLabel==='Avoid opening 1'),'Position/history opening edits must synchronize even while the main surface tab is inactive')
 btn('Navigate').click();assert.equal(btn('Navigate').getAttribute('aria-pressed'),'true')
 const pickSlice=root().querySelectorAll('canvas').find(c=>c.ariaLabel?.startsWith('CT surface review'))
 pickSlice.getBoundingClientRect=()=>({left:0,top:0,width:200,height:200})
 pickSlice.onclick({clientX:100,clientY:100})
 assert.ok(root().querySelectorAll('div').some(n=>n.className==='surface-opening-row selected-opening'),'Clicking a slice marker must select and highlight its candidate entry');assert.equal(pickSlice.context.labelColors.at(-1),'#ff2020','Selected slice annotations must turn red without changing review status')
 project.surfaceOpenings=[];workspace.panel();assert.equal(root().querySelectorAll('select').find(s=>s.ariaLabel==='Avoid opening 1'),undefined,'Undo of an opening-only edit must restore the saved list')

 field('R crop minimum (mm)').value='9.5';field('R crop minimum (mm)').dispatchEvent(new Event('input'))
 await new Promise(resolve=>setTimeout(resolve,340))
 assert.equal(btn('Finalize surface').disabled,true,'Invalid live drafts cannot be finalized')
 btn('Reset draft').click();assert.equal(field('R crop minimum (mm)').value,'-0.5','Reset restores the finalized crop');assert.equal(field('Bone threshold').value,'500');assert.equal(project.assets[0].imageDisplay.skull.edits.length,1,'Reset does not modify the saved project')
 await new Promise(resolve=>setTimeout(resolve,340));assert.equal(btn('Finalize surface').disabled,false,'Reset restarts preview generation from the restored settings')
 assert.equal(project.assets[0].imageDisplay.skull.threshold,500);assert.equal(project.assets[0].imageDisplay.skull.bounds[0][0],-.5,'Failed drafts preserve the finalized mesh and its crop')
 workspace.panel().querySelectorAll('button').find(b=>b.children.includes('Stop using surface for placement')).click();assert.deepEqual(project.planningSurfaceIds,[])
 assert.equal(project.assets[0].imageDisplay.skull.threshold,500,'Disabling placement preserves saved surface settings')
 btn('Reset crop').click()
 root().parent.parent.querySelectorAll('button').find(b=>b.getAttribute('aria-label')==='Close Planning surface editor').click()
 assert.equal(project.assets[0].imageDisplay.skull.threshold,500,'Closing preserves saved surface settings')
 sidebar.querySelectorAll('button').find(b=>b.children.includes('Open surface editor…')).click()
 assert.equal(field('Bone threshold').value,'500','Reopening preserves draft controls')
 project=createProject({...asset,modality:'ct'},'Another subject',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
 workspace.cancel();await new Promise(resolve=>setTimeout(resolve,340));assert.equal(project.assets[0].imageDisplay,undefined)
 Element.prototype.getContext=oldContext
 console.log('Isolated live preview, single-action isosurface finalization, failed draft preservation and cancelled project work passed (DOM/GPU mocked).')
}
// Trajectory views use the Anatomy viewport only when explicitly selected.
{
 const {anatomyModes}=await import('../src/ui/anatomyModes.ts')
 const slices=new Element('canvas'),along=new Element('canvas'),across=new Element('canvas'),reslices={visible:'both',angleDegrees:0,tipOffset:0,zoom:()=>{}}
 let repaints=0;const modes=anatomyModes(slices,along,across,reslices,()=>{repaints++})
 modes.update(null,null);assert.equal(reslices.visible,'none');assert.equal(slices.hidden,false);assert.equal(along.hidden,true)
 p.chambers[0].placementState=undefined;p.electrodes[0].depth=12
 modes.update(p,p.electrodes[0].id)
 modes.selector.value='along';modes.selector.dispatchEvent(new Event('change'));assert.equal(reslices.visible,'along');assert.equal(slices.hidden,true);assert.equal(along.hidden,false)
 const rotation=modes.controls.querySelectorAll('input').find(i=>i.ariaLabel==='Rotate plane around electrode (degrees)');rotation.value='70';rotation.dispatchEvent(new Event('input'));assert.equal(reslices.angleDegrees,70)
 modes.selector.value='across';modes.selector.dispatchEvent(new Event('change'));assert.equal(reslices.visible,'across');assert.equal(across.hidden,false)
 const position=modes.controls.querySelectorAll('input').find(i=>i.ariaLabel==='Cross-section distance from grid (mm)');position.value='4';position.dispatchEvent(new Event('input'));assert.equal(reslices.tipOffset,-8)
 modes.controls.querySelectorAll('button').find(b=>b.children.includes('At tip')).click();assert.equal(reslices.tipOffset,0)
 p.chambers[0].placementState='unplaced';modes.update(p,p.electrodes[0].id);assert.equal(reslices.visible,'none');assert.equal(slices.hidden,false)
 assert.ok(repaints>=4)
 console.log('Optional Anatomy reslice modes, plane rotation, cross-section movement and invalid-placement fallback passed (DOM mocked).')
}
// Missing dropdowns must never make the surface guide fall back to preview text/canvas.
{
 const source=new Element('section'),wrong=new Element('section');doc.body.append(source,wrong)
 source.getBoundingClientRect=()=>({left:20,right:300,top:150,bottom:550})
 wrong.getBoundingClientRect=()=>({left:500,right:800,top:20,bottom:600})
 const originalQuery=doc.querySelector;doc.querySelector=selector=>selector==='.surface-source-controls'?source:selector==='.feature-panel .control-section'?wrong:null
 const before=doc.body.children.length
 const guide=planningGuide({project:()=>p,navigate:()=>{},hasPlanningSurface:()=>false});guide.start()
 const next=()=>guide.element.querySelectorAll('button').find(b=>b.children.includes('Next step'))
 next().click()
 const boundaries=doc.body.children.slice(before),region=boundaries.find(n=>n.className==='guide-boundary guide-region'),action=boundaries.find(n=>n.className==='guide-boundary guide-action')
 assert.equal(region.style.left,'17px');
 source.getBoundingClientRect=()=>({left:80,right:360,top:150,bottom:550});doc.dispatchEvent(new Event('planning-window-move'));assert.equal(region.style.left,'77px','Guide must track a window move synchronously without waiting for its interval')
 const footer=guide.element.querySelectorAll('div').find(n=>n.className==='guide-footer'),instructions=guide.element.querySelectorAll('div').find(n=>n.className==='guide-instructions');assert.ok(footer&&instructions);assert.ok(footer.querySelectorAll('button').length>=4);assert.equal(instructions.querySelectorAll('button').length,0)
assert.equal(action.hidden,true,'The source group receives one outline, without an action box over the preview')
 doc.querySelector=originalQuery
 console.log('Surface guide always frames source controls, including when no Planning source dropdown exists.')
}

// Actual opening-panel actions: candidates require review, deletion is undoable, missed holes can be marked.
{
 const {surfaceOpeningTools}=await import('../src/ui/surfaceOpenings.ts')
 const {skullPreview}=await import('../src/render/ctSkull.ts')
 const bounds=[[-15,-15,-15],[15,15,15]],mesh=skullPreview({sample:p=>{const r=Math.hypot(...p);return r>=8&&r<=10&&!(p[2]>6&&Math.hypot(p[0],p[1])<2)?1000:0}},300,bounds,{spacingMm:.5,components:'largest',representation:'outer',center:[0,0,0]})
 let items=[],key='current',located=null;const selections=[]
 const tool=surfaceOpeningTools({assetId:'reference',sha256:'a'.repeat(64),frameId:'frame',bounds:()=>bounds,spacing:()=>.5,key:()=>key,geometry:()=>mesh,onSelection:id=>selections.push(id),items:()=>items,setItems:next=>{items=next},crosshair:()=>[0,0,10],locate:point=>{located=point}});doc.body.append(tool.element)
 const minimum=tool.element.querySelectorAll('input').find(i=>i.parent?.children.some(n=>n.children?.includes('Minimum candidate diameter (mm)')));assert.equal(minimum.value,'2','Default minimum opening diameter is 2 mm')
 const button=name=>tool.element.querySelectorAll('button').find(b=>b.children.includes(name))
 const avoid=()=>tool.element.querySelectorAll('select').find(i=>i.ariaLabel==='Avoid opening 1')
 button('Detect candidate openings').click();await new Promise(resolve=>setTimeout(resolve,25))
 assert.equal(items.length,1);assert.equal(items[0].reviewed,false);assert.equal(items[0].avoid,false)
 const oldCandidate=items[0].id;tool.select(oldCandidate);assert.equal(selections.at(-1),oldCandidate)
 button('Detect candidate openings').click();await new Promise(resolve=>setTimeout(resolve,25))
 assert.equal(items.length,1);assert.notEqual(items[0].id,oldCandidate,'Re-detection must replace old unreviewed estimates')
 assert.equal(items[0].measurement.source,'mesh');assert.equal(tool.element.querySelectorAll('div').some(r=>r.className==='surface-opening-row selected-opening'),false,'Re-detection clears the selected row');assert.equal(selections.at(-1),null,'Re-detection clears the 3D/slice highlight too')
 tool.select(items[0].id)
 assert.ok(tool.element.querySelectorAll('div').some(r=>r.className==='surface-opening-row selected-opening'),'3D/slice selection must highlight the matching entry')
 avoid().value='hard';avoid().dispatchEvent(new Event('change'));assert.equal(items[0].reviewed,true);assert.equal(items[0].avoid,true);assert.equal(items[0].constraint,'hard')
 avoid().value='soft';avoid().dispatchEvent(new Event('change'));assert.equal(items[0].constraint,'soft');assert.equal(items[0].reviewed,true)
 const reviewedId=items[0].id;button('Detect candidate openings').click();await new Promise(resolve=>setTimeout(resolve,25));assert.notEqual(items[0].id,reviewedId);assert.equal(items[0].reviewed,false);assert.equal(items[0].avoid,false,'Re-detection must replace reviewed automatic exclusions without an extra option')
 button('Undo opening edit').click();assert.equal(items[0].id,reviewedId);assert.equal(items[0].avoid,true,'Undo must restore a replaced reviewed exclusion')
 button('Locate').click();assert.deepEqual(located,items[0].center)
 button('Remove marker').click();assert.equal(items.length,0);button('Undo opening edit').click();assert.equal(items.length,1)
 button('Remove marker').click()
 const diameter=tool.element.querySelectorAll('input').find(i=>i.parent?.children.some(n=>n.children?.includes('Manual opening diameter (mm)')));diameter.value='6';diameter.dispatchEvent(new Event('change'))
 button('Add missed opening at crosshair').click();assert.equal(items.length,1);assert.equal(items[0].origin,'manual');assert.equal(items[0].radius,3);assert.equal(items[0].avoid,false)
 button('Add missed opening at crosshair').click();assert.equal(items.length,1,'Repeated clicks must not duplicate a marker')
 const manualId=items[0].id;button('Detect candidate openings').click();await new Promise(resolve=>setTimeout(resolve,25));assert.equal(items.length,1);assert.equal(items[0].id,manualId,'Replacing all automatic detections must preserve manual markers')
 button('Remove marker').click();tool.addAt([0,0,9.7],{center:[0,0,9.7],radius:2.25});assert.equal(items[0].radius,2.25,'Surface click uses the enclosing boundary diameter instead of the manual default');assert.deepEqual(located,[0,0,9.7])
 key='changed';tool.refresh();assert.equal(avoid().disabled,true)
 button('Re-review on current surface').click();assert.equal(items[0].surfaceKey,'changed');assert.equal(items[0].avoid,false)
 key=null;tool.refresh();assert.equal(button('Detect candidate openings').disabled,true);assert.equal(button('Add missed opening at crosshair').disabled,true)
 tool.element.remove()
 console.log('Opening tools require review, undo deletion, add missed holes, avoid duplicates and disable stale review actions (DOM mocked).')
}

// Nonmodal tools and the guide can alternate foreground; hiding the guide retains its step.
{
 const {floatingWindow}=await import('../src/ui/floatingWindow.ts')
 const tool=floatingWindow('Test tool','Test tool')
 const guide=planningGuide({project:()=>p,navigate:()=>{}});doc.body.append(guide.element);guide.start()
 const next=()=>guide.element.querySelectorAll('button').find(b=>b.children.includes('Next step'))
 next().click();const title=guide.element.querySelector('h2').children[0]
 assert.ok(Number(guide.element.style.zIndex)>Number(tool.root.style.zIndex))
 tool.activate();assert.ok(Number(tool.root.style.zIndex)>Number(guide.element.style.zIndex))
 guide.element.dispatchEvent(new Event('focusin'));assert.ok(Number(guide.element.style.zIndex)>Number(tool.root.style.zIndex))
 guide.element.querySelectorAll('button').find(b=>b.getAttribute('aria-label')==='Close guided planning').click()
 assert.equal(guide.element.hidden,true);guide.start();assert.equal(guide.element.querySelector('h2').children[0],title)
 tool.close()
 console.log('Floating tool stacking and guide close/resume passed.')
}
// Guide entry/resume is reconciled with domain state, not an observed click history.
{
 const escape=()=>{const event=new Event('keydown');event.key='Escape';doc.dispatchEvent(event)}
 escape()
 const create=(name='MRI',modality='mri')=>createProject({...asset,modality},name,{kind:'standalone',subject:null,scan:null,sourceRoot:null})
 const title=g=>g.element.querySelector('h2').children[0]
 const action=(g,name)=>g.element.querySelectorAll('button').find(b=>b.children.includes(name))
 const next=g=>{const b=action(g,'Next step');assert.ok(b&&!b.disabled);b.click()}
 const hide=(g,method)=>method==='Escape'?escape():method==='×'?g.element.querySelectorAll('button').find(b=>b.getAttribute('aria-label')==='Close guided planning').click():action(g,'Hide tutorial').click()
 let count=0
 for(const source of ['MRI','CT','Brainana dataset','Demo','Saved project','Autosave'])for(const timing of ['before','after'])for(const method of ['×','Hide','Escape']){
  let project=timing==='after'?create(source,source==='CT'?'ct':'mri'):null,surface=false,feature=''
  const g=planningGuide({project:()=>project,hasPlanningSurface:()=>surface,navigate:f=>{feature=f}});doc.body.append(g.element);g.start()
  assert.equal(title(g),project?'Optional: add images and overlays':'Load anatomy',`${source}: first entry ${timing} loading`)
  if(!project){g.refresh();assert.equal(title(g),'Load anatomy','Cancelled/failed import must not advance')}
  hide(g,method);assert.equal(g.element.hidden,true)
  if(!project)project=create(source,source==='CT'?'ct':'mri')
  g.refresh();g.start();assert.equal(title(g),'Optional: add images and overlays');assert.equal(feature,'images')
  assert.equal(action(g,'Back').disabled,true,'Loaded anatomy must not send Back to an already completed load prompt')
  next(g);assert.equal(title(g),'Define the planning surface');assert.equal(action(g,'Next step').disabled,true)
  g.start();assert.equal(title(g),'Define the planning surface','Pressing Guided tutorial while already active must not restart it')
  hide(g,method);surface=true;g.refresh();g.start();assert.equal(title(g),'Choose a target','Completing a required action while hidden must be recognized on resume')
  project.name+=' renamed';g.refresh();assert.equal(title(g),'Choose a target','Metadata edits must not reset progress')
  hide(g,method);project=null;surface=false;g.refresh();g.start();assert.equal(title(g),'Load anatomy','New workspace must not retain previous project progress')
  project=create('Different project');g.refresh();assert.equal(title(g),'Optional: add images and overlays','Loading while guide is active must show the optional image stage')
  next(g);hide(g,method);g.projectChanged();g.start();assert.equal(title(g),'Optional: add images and overlays','Explicit reopen of the same saved project starts a new guide session')
  action(g,'Restart tutorial').click();assert.equal(title(g),'Optional: add images and overlays','Restart respects an already loaded reference')
  hide(g,method);g.element.remove();count++
 }
 console.log(`${count} guide load/start/hide/resume/reset sequences across MRI, CT, dataset, demo, saved-project and autosave state passed.`)
 // Completed stages skip forward; Back intentionally allows review without losing place on hide.
 let project=create('Configured'),surface=true,selected=null
 addAssembly(project,[0,0,30]);const e=project.electrodes[0];selected=e.id
 project.chambers[0].placementState='unplaced';project.targets=[{id:'a',name:'A',point:[0,0,0],frameId:project.frame.id,color:'#fff',atlas:null}]
 const g=planningGuide({project:()=>project,selectedElectrode:()=>selected,hasPlanningSurface:()=>surface,navigate:()=>{}});doc.body.append(g.element);g.start()
 assert.equal(title(g),'Optional: draw exclusions','Already defined surface/target stages and the superseded optional image stage should not demand duplicate work')
 next(g);assert.equal(title(g),'Define electrode hardware')
 hide(g,'×');applyHardwarePreset(e,hardwareCatalog[0]);confirmSetup(e,setupValues(e));g.start();assert.equal(title(g),'Choose hardware and constraints')
 action(g,'Back').click();assert.equal(title(g),'Define electrode hardware');hide(g,'×');g.start();assert.equal(title(g),'Define electrode hardware','Back-review survives close/reopen even when the hardware is already ready')
 next(g);next(g);assert.equal(title(g),'Set trajectory constraints','A single target does not require a redundant link step')
 next(g);assert.equal(title(g),'Search and apply a placement');assert.equal(action(g,'Next step').disabled,true,'A geometrically aligned but unplaced chamber is not an applied result')
 hide(g,'Hide');project.chambers[0].placementState=undefined;e.targetId='a';e.depth=30
 project.targets[0].point=[0,0,4];project.targets[0].region={kind:'sphere',radiusMm:5}
 g.start();assert.equal(title(g),'Review and save','A placed tip inside a valid region completes the tutorial even when far from the center')
 action(g,'Finish tutorial').click();assert.equal(g.element.hidden,true);g.start();assert.equal(title(g),'Optional: draw exclusions','Reopening a finished tutorial starts from the first applicable step')
 // Route to Position, then remove prerequisites while active or hidden.
 next(g);assert.equal(title(g),'Choose hardware and constraints')
 surface=false;g.refresh();assert.equal(title(g),'Define the planning surface')
 surface=true;g.refresh();assert.equal(title(g),'Optional: draw exclusions')
 next(g);assert.equal(title(g),'Choose hardware and constraints')
 project.targets=[];g.refresh();assert.equal(title(g),'Choose a target','Undo/delete must invalidate dependent placement guidance')
 escape();g.element.remove()
 // Other electrodes cannot satisfy readiness for the selected device or its target link.
 project=create('Multiple electrodes');surface=true;addAssembly(project,[0,0,30]);const first=project.electrodes[0],other=structuredClone(first);other.id='other';project.electrodes.push(other)
 selected=first.id;project.chambers[0].placementState='unplaced';project.targets=[{id:'a',name:'A',point:[0,0,0],frameId:project.frame.id,color:'#fff',atlas:null},{id:'b',name:'B',point:[1,0,0],frameId:project.frame.id,color:'#fff',atlas:null}]
 applyHardwarePreset(other,hardwareCatalog[0]);confirmSetup(other,setupValues(other));other.targetId='a'
 const multi=planningGuide({project:()=>project,selectedElectrode:()=>selected,hasPlanningSurface:()=>surface,navigate:()=>{}});doc.body.append(multi.element);multi.start();next(multi)
 assert.equal(title(multi),'Define electrode hardware');assert.equal(action(multi,'Next step').disabled,true)
 applyHardwarePreset(first,hardwareCatalog[0]);confirmSetup(first,setupValues(first));multi.refresh();assert.equal(title(multi),'Choose hardware and constraints');next(multi)
 assert.equal(title(multi),'Link the electrode to a target');assert.equal(action(multi,'Next step').disabled,true,'Another electrode target must not satisfy the selected electrode')
 first.targetId='b';multi.refresh();assert.equal(title(multi),'Set trajectory constraints')
 delete first.hardware;multi.refresh();assert.equal(title(multi),'Define electrode hardware','Changing the selected device invalidates downstream guidance')
 escape();multi.element.remove()
 console.log('Guide completed-step skipping, Back review, Finish/Restart, prerequisite deletion, unplaced geometry and selected-electrode/target isolation passed.')
}
// Sidebar synchronization happens after navigation; stale queued clicks cannot leak across Close or Open project.
{
 const base=createProject(asset,'Sidebar',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
 let project=base,feature=''
 const guide=planningGuide({project:()=>project,hasPlanningSurface:()=>false,navigate:f=>{feature=f}});doc.body.append(guide.element);guide.start()
 const title=()=>guide.element.querySelector('h2').children[0]
 const button=name=>guide.element.querySelectorAll('button').find(b=>b.children.includes(name))
 const nav=id=>{const target=new Element('button');target.dataset.feature=id;target.closest=selector=>selector==='button[data-feature]'?target:null;const event=new Event('click');Object.defineProperty(event,'target',{value:target});doc.dispatchEvent(event)}
 nav('targets');await new Promise(r=>setTimeout(r,0));assert.equal(title(),'Choose a target');assert.equal(feature,'targets','Target definition does not require the surface stage first')
 project.targets.push({id:'sidebar-target',name:'Target',point:[0,0,0],frameId:project.frame.id,color:'#fff',atlas:null});guide.refresh();assert.equal(title(),'Optional: draw exclusions','Sidebar navigation to an incomplete step must still auto-advance after its successful action')
 nav('chamber');await new Promise(r=>setTimeout(r,0));assert.equal(title(),'Define your chamber','Chamber definitions can precede target/surface work')
 nav('positioning');await new Promise(r=>setTimeout(r,0));assert.equal(title(),'Define the planning surface');assert.equal(feature,'surface','Placement routes to its first missing prerequisite')
 nav('targets');nav('chamber');await new Promise(r=>setTimeout(r,0));assert.equal(title(),'Define your chamber','Only the last queued sidebar click should win')
 nav('targets');button('Hide tutorial').click();guide.start();await new Promise(r=>setTimeout(r,0));assert.equal(title(),'Define your chamber','Closing cancels pending sidebar synchronization')
 nav('targets');project=structuredClone(base);guide.projectChanged();await new Promise(r=>setTimeout(r,0));assert.equal(title(),'Optional: add images and overlays','Reopening the same project invalidates old queued navigation')
 button('Restart tutorial').click();assert.equal(title(),'Optional: add images and overlays')
 project=null;guide.projectChanged();assert.equal(title(),'Load anatomy');assert.equal(feature,'images')
 button('Hide tutorial').click();guide.element.remove()
 console.log('Guide sidebar follow, independent definition order, placement prerequisites, rapid clicks and queued-event cancellation on close/reopen passed.')
}

// Actual placement worker transport, including UI activity lifecycle and errors.
{
 const {Worker:NodeWorker}=await import('node:worker_threads')
 const {placementCompute}=await import('../src/features/placementCompute.ts')
 const {searchTarget}=await import('@brainana/planning-core/optimization.ts')
 const {activity,beginActivity}=await import('../src/ui/activity.ts')
 const {normalize,defaults}=await import('../src/ui/settings.ts')
 const preferences=normalize({...defaults,colors:{placement:'#123456',placementSoft:'invalid'}})
 assert.equal(preferences.colors.placement,'#123456');assert.equal(preferences.colors.placementSoft,defaults.colors.placementSoft)
 assert.deepEqual(normalize(JSON.parse(JSON.stringify(preferences))),preferences)
 const first=beginActivity('First operation'),second=beginActivity('Second operation')
 first();assert.equal(activity.hidden,false);assert.equal(activity.textContent,'Second operation');second();assert.equal(activity.hidden,true)
 const oldWorker=globalThis.Worker,oldRaf=globalThis.requestAnimationFrame
 class BrowserWorker{
  constructor(url){this.worker=new NodeWorker(`const {parentPort,workerData}=require('node:worker_threads');globalThis.self={postMessage:data=>parentPort.postMessage(data)};import(workerData.url).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true,workerData:{url:url.href}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({message:error.message}))}
  postMessage(data){this.worker.postMessage(data)}terminate(){void this.worker.terminate()}
 }
 globalThis.Worker=BrowserWorker;globalThis.requestAnimationFrame=callback=>setTimeout(callback,0)
 try{
  const q=createProject({...asset},'Worker',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(q,[0,0,30]);q.targets=[{id:'t',name:'T',frameId:q.frame.id,point:[0,0,0],atlas:null,color:'#ffffff'}];q.planning={mode:'existing',seed:null,searchStep:2,searchRadius:5,maxMiss:.5,margin:0}
  const before=structuredClone(q),expected=searchTarget(q,q.electrodes[0].id,'t',{})
  const task=placementCompute(q,q.electrodes[0].id,'t',{});assert.equal(activity.hidden,false)
  const actual=await task;assert.deepEqual(actual,expected);assert.equal(activity.hidden,true);assert.deepEqual(q,before)
  const applied=await placementCompute(q,q.electrodes[0].id,'t',{},actual.candidates[0]);assert.equal(applied.electrodes[0].targetId,'t');assert.deepEqual(q,before)
  await assert.rejects(placementCompute(q,q.electrodes[0].id,'missing',{}),/Choose an electrode and target/);assert.equal(activity.hidden,true)
  const controller=new AbortController()
  const cancelled=placementCompute(q,q.electrodes[0].id,'t',{},undefined,controller.signal)
  const rejected=assert.rejects(cancelled,{name:'AbortError'});controller.abort();await rejected
  assert.equal(activity.hidden,true,'Cancellation clears the processing indicator')
  let posted=false,terminated=false
  class HeldWorker{postMessage(){posted=true}terminate(){terminated=true}}
  globalThis.Worker=HeldWorker
  const inflight=new AbortController(),held=placementCompute(q,q.electrodes[0].id,'t',{},undefined,inflight.signal)
  const stopped=assert.rejects(held,{name:'AbortError'})
  while(!posted)await new Promise(resolve=>setTimeout(resolve,1))
  inflight.abort();await stopped
  assert.equal(terminated,true,'Cancelling an active placement terminates the worker')
  assert.equal(activity.hidden,true)

 }finally{globalThis.Worker=oldWorker;globalThis.requestAnimationFrame=oldRaf}
 console.log('Actual placement worker matches synchronous geometry, preserves source project, applies validated state, and clears nested processing feedback on success/error. Color preferences validate and round-trip.')
}
{
 const {avoidanceFeature}=await import('../src/features/avoidance.ts')
 const {activity}=await import('../src/ui/activity.ts')
 const q=createProject({...asset},'One click',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
 const surface={pts:[-10,-10,0,10,-10,0,10,10,0,-10,10,0],tris:[0,1,2,0,2,3]}
 let updates=0
 const ctx={project:q,store:{get project(){return q}},scene:{brushMode:'surface',brushRadius:2,drawingEnabled:true,mountingSurface:{surfaces:[surface]},updateAvoidanceSurfaces(){updates++}},crosshair:()=>[0,0,1],edit:fn=>fn(q),refresh(){}}
 const ui=avoidanceFeature.render(ctx),control=ui.querySelectorAll('button').find(b=>b.children.includes('Paint surface region near crosshair'))
 control.click();assert.equal(activity.hidden,false,'First click immediately shows processing')
 for(let i=0;i<100&&updates===0;i++)await new Promise(resolve=>setTimeout(resolve,5))
 assert.equal(q.avoidRegions.length,1);assert.ok(q.avoidRegions[0].surfacePatch.tris.length);assert.equal(updates,1,'First click requests visible mesh update even with drawing enabled');assert.equal(activity.hidden,true)
 const {normalize,defaults}=await import('../src/ui/settings.ts')
 const migrated=normalize({...defaults,colors:{...defaults.colors,avoidance:'#ef6c79',placementOpening:'#ff55cc'}})
 assert.notEqual(migrated.colors.avoidance,'#ef6c79');assert.notEqual(migrated.colors.placementOpening,'#ff55cc')
 console.log('One crosshair click creates one surface patch, requests its immediate display, reports processing, and migrates old overlapping default colors (DOM mocked).')
}
{
 const {gridFeature}=await import('../src/features/grid.ts')
 const p=createProject({...asset},'Preview grid',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(p,[20,0,40]);p.electrodes[0].hole=[1,0]
 const before=structuredClone(p)
 const root=gridFeature.render({scene:{},project:p,hasPlacementPreview:true,selectedElectrode:p.electrodes[0].id})
 assert.equal(root.querySelector('fieldset').disabled,true,'Preview grid edits are guarded until Apply/Cancel')
 const selected=root.querySelectorAll('button').find(b=>b.className?.includes('active-electrode'))
 assert.match(selected.getAttribute('aria-label'),/\(1, 0\)/,'Grid inspector reflects preview hole')
 assert.deepEqual(p,before,'Inspecting the grid does not discard or mutate placement geometry')
 console.log('Grid inspection displays preview hole without mutating hardware and explains guarded edits (DOM mocked).')
}
// Chamber-only planning must not require an electrode or a target.
{
 const project=createProject(asset,'Chamber only',{kind:'standalone',subject:null,scan:null,sourceRoot:null});project.planningIntent='chamber';addAssembly(project,[0,0,30]);project.chambers[0].placementState='unplaced';project.electrodes=[]
 let feature='';const g=planningGuide({project:()=>project,hasPlanningSurface:()=>true,navigate:f=>{feature=f}});doc.body.append(g.element);g.start()
 const title=()=>g.element.querySelector('h2').children[0]
 for(let i=0;i<12&&title()!=='Place your chamber';i++){const b=g.element.querySelectorAll('button').find(b=>b.children.includes('Next step'));assert.ok(b&&!b.disabled,title());b.click()}
 assert.equal(title(),'Place your chamber');assert.equal(feature,'positioning')
 delete project.chambers[0].placementState;g.refresh();assert.equal(title(),'Review and save')
 g.element.querySelectorAll('button').find(b=>b.getAttribute('aria-label')==='Close guided planning').click()
 console.log('Chamber-only guide skips target and electrode requirements and waits for a placed chamber.')
}
// MRI estimation has dedicated controls and cannot finalize without required input.
{
 const {planningSurfaceWorkspace}=await import('../src/ui/planningSurface.ts'),{NVImage}=await import('@niivue/niivue')
 const values=new Float32Array(1000);for(let z=2;z<=7;z++)for(let y=2;y<=7;y++)for(let x=2;x<=7;x++)values[x+y*10+z*100]=100
 const raw=NVImage.createNiftiArray([10,10,10],[1,1,1],[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],16,new Uint8Array(values.buffer)),image=await NVImage.loadFromUrl({url:raw,name:'MRI.nii'})
 const project=createProject({...asset,name:'MRI.nii'},'MRI surface',{kind:'standalone',subject:null,scan:null,sourceRoot:null}),scene={surfaceCandidates:[],mountingSurface:{assetIds:[],source:'skull',surfaces:[]},imageForAsset:()=>image,defaultsForImage:()=>undefined,prepareCTPreview:()=>{}}
 let saved
 const workspace=planningSurfaceWorkspace({project:()=>project,scene,edit:fn=>fn(project),importSkull:()=>{},importBrain:()=>{},addCT:()=>{},saveMRI:async value=>{saved=value}})
 const panel=workspace.panel();panel.querySelectorAll('button').find(b=>b.children.includes('Open surface editor…')).click()
 const root=()=>doc.body.querySelectorAll('section').find(n=>n.className==='image-tool-window'&&n.ariaLabel==='Planning surface editor')
 const action=text=>root().querySelectorAll('button').find(b=>b.children.includes(text))
 const select=label=>root().querySelectorAll('label').find(n=>n.querySelectorAll('span').some(s=>s.children.includes(label)))?.querySelector('select')
 assert.equal(select('Estimate surface from').value,'dark-band-head');assert.ok(!select('Estimate surface from').options.some(o=>o.value==='brain-dilate'),'Mask methods are absent until a brain region exists');assert.equal(action('Select skull at crosshair'),undefined,'CT tools do not appear for MRI')
 const originalLoad=NVImage.loadFromFile;NVImage.loadFromFile=async()=>image
 action('Load brain mask…').click();const file=doc.body.querySelectorAll('input').find(n=>n.type==='file');file.files=[new File([raw],'brain-mask.nii')];file.dispatchEvent(new Event('change'))
 await new Promise(resolve=>setTimeout(resolve,350))
 assert.equal(action('Finalize surface').disabled,true,'Reviewing a brain region cannot finalize it as skull')
 select('Estimate surface from').value='brain-dilate';select('Estimate surface from').dispatchEvent(new Event('change'));await new Promise(resolve=>setTimeout(resolve,350))
 assert.equal(action('Finalize surface').disabled,false)
 const outward=root().querySelectorAll('input').find(n=>n.ariaLabel==='Expand brain region outward (mm)');outward.value='1';outward.dispatchEvent(new Event('input'));assert.equal(action('Finalize surface').disabled,true,'Changing expansion invalidates the old mesh immediately')
 await new Promise(resolve=>setTimeout(resolve,300));assert.equal(action('Finalize surface').disabled,false)
 action('Finalize surface').click();await new Promise(resolve=>setTimeout(resolve,25));assert.ok(saved.geometry.tris.length);assert.equal(saved.settings.method,'brain-dilate');assert.equal(saved.settings.offsetMm,1);assert.equal(saved.mask.name,'brain-mask.nii');assert.equal(root(),undefined)
 NVImage.loadFromFile=originalLoad
 console.log('MRI-only surface editor requires a mask, hides CT tools, previews physical offsets, invalidates stale mesh and finalizes the shown geometry with its input mask.')
}
// MRI preparation defaults to a no-mask boundary and separates optional brain-region review.
{
 const previousContext=Element.prototype.getContext
 Element.prototype.getContext=function(){return this.context??={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(data){this.lastImage=data},beginPath(){},moveTo(){},lineTo(){this.lines=(this.lines??0)+1},stroke(){},fillText(){}}}
 const {planningSurfaceWorkspace}=await import('../src/ui/planningSurface.ts'),{NVImage}=await import('@niivue/niivue')
 const values=new Float32Array(32**3),brainValues=new Float32Array(values.length)
 for(let z=0;z<32;z++)for(let y=0;y<32;y++)for(let x=0;x<32;x++){const r=Math.hypot(x-16,y-16,z-16),i=x+y*32+z*1024;values[i]=r<=6?100:r<8?5:r<10?180:0;brainValues[i]=Number(r<=6)}
 const nifti=data=>NVImage.createNiftiArray([32,32,32],[1,1,1],[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],16,new Uint8Array(data.buffer))
 const image=await NVImage.loadFromUrl({url:nifti(values),name:'head.nii'}),brainImage=await NVImage.loadFromUrl({url:nifti(brainValues),name:'brain-mask.nii'})
 const project=createProject({...asset,name:'head.nii'},'Dark band',{kind:'standalone',subject:null,scan:null,sourceRoot:null}),scene={surfaceCandidates:[],mountingSurface:{assetIds:[],source:'skull',surfaces:[]},imageForAsset:()=>image,defaultsForImage:()=>undefined,prepareCTPreview:()=>{}}
 let saved
 const workspace=planningSurfaceWorkspace({project:()=>project,scene,edit:fn=>fn(project),importSkull:()=>{},importBrain:()=>{},addCT:()=>{},saveMRI:async value=>{saved=value},crosshair:()=>[16,16,16]})
 workspace.panel().querySelectorAll('button').find(b=>b.children.includes('Open surface editor…')).click()
 const root=()=>doc.body.querySelectorAll('section').find(n=>n.className==='image-tool-window'&&n.ariaLabel==='Planning surface editor')
 const action=text=>root().querySelectorAll('button').find(b=>b.children.includes(text)),input=label=>root().querySelectorAll('input').find(i=>i.ariaLabel===label)
 assert.ok(action('Load brain mask…'));assert.ok(input('Dark band maximum brightness'));assert.equal(input('Shrink inward (mm)'),undefined);assert.equal(input('Head-mask brightness cutoff'),undefined);assert.equal(action('Finalize surface').disabled,true)
 await new Promise(r=>setTimeout(r,400));assert.equal(action('Finalize surface').disabled,false,'No-mask MRI dark-band estimate is available immediately')
 assert.equal(input('Bridge gaps along surface').checked,true);assert.equal(input('Maximum gap span (mm)').value,'8')
 const canvas=root().querySelectorAll('canvas').find(c=>c.ariaLabel?.startsWith('MRI surface review'))
 const hasFill=()=>canvas.context.lastImage.data.some((v,i,a)=>i%4===0&&(v!==a[i+1]||v!==a[i+2]))
 assert.ok(hasFill(),'Estimated boundary is displayed as filled native-image voxels')
 const fill=input('Show boundary voxels in slices');fill.checked=false;fill.dispatchEvent(new Event('change'));assert.equal(hasFill(),false);assert.equal(action('Finalize surface').disabled,false,'Display changes do not trigger a new surface computation')
 fill.checked=true;fill.dispatchEvent(new Event('change'));assert.ok(hasFill())
 input('Boundary voxel opacity').value='.3';input('Boundary voxel opacity').dispatchEvent(new Event('input'));assert.equal(action('Finalize surface').disabled,false)
 input('Maximum gap span (mm)').value='6';input('Maximum gap span (mm)').dispatchEvent(new Event('input'));assert.equal(action('Finalize surface').disabled,true,'Reconstruction settings invalidate the old mesh')
 for(let i=0;i<40&&action('Finalize surface').disabled;i++)await new Promise(r=>setTimeout(r,50))
 action('Finalize surface').click();await new Promise(r=>setTimeout(r,25));assert.equal(root(),undefined);assert.equal(saved.settings.method,'dark-band-head');assert.equal(saved.mask,undefined,'Direct MRI finalization does not require or attach a mask');assert.equal(saved.settings.darkBand.completion.maximumGapMm,6);assert.ok(saved.boundary.file.length>0,'Finalization includes the aligned boundary voxel image')
 workspace.panel().querySelectorAll('button').find(b=>b.children.includes('Open surface editor…')).click();await new Promise(r=>setTimeout(r,400))
 action('Estimate brain region from MRI').click();await new Promise(r=>setTimeout(r,400));assert.equal(action('Finalize surface').disabled,true,'Brain-region review is distinct from the skull boundary')
 assert.ok(input('Brain tissue brightness cutoff'))
 action('Reset draft').click();await new Promise(r=>setTimeout(r,400));assert.equal(action('Finalize surface').disabled,false);assert.equal(input('Brain tissue brightness cutoff'),undefined,'Reset discards the draft brain estimate')
 action('Estimate brain region from MRI').click();await new Promise(r=>setTimeout(r,400))
 action('Show surface estimate').click();await new Promise(r=>setTimeout(r,400));assert.equal(action('Finalize surface').disabled,false)
 const method=()=>root().querySelectorAll('select').find(s=>s.ariaLabel==='Estimate surface from')
 method().value='dark-band-head';method().dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,400));assert.equal(action('Finalize surface').disabled,false)
 assert.ok(method().options.some(o=>o.value==='dark-band'),'An estimated brain region remains available after switching to direct MRI')
 action('Erase').click();assert.equal(action('Erase').getAttribute('aria-pressed'),'true');action('Erase').click();assert.equal(action('Navigate').getAttribute('aria-pressed'),'true')
 action('Add back').click();assert.equal(action('Add back').getAttribute('aria-pressed'),'true');action('Navigate').click()
 const original=NVImage.loadFromFile;NVImage.loadFromFile=async()=>brainImage
 action('Load brain mask…').click();const file=doc.body.querySelectorAll('input').find(n=>n.type==='file');file.files=[new File([nifti(brainValues)],'brain-mask.nii')];file.dispatchEvent(new Event('change'))
 await new Promise(r=>setTimeout(r,400));assert.equal(action('Finalize surface').disabled,true);action('Show surface estimate').click()
 for(let i=0;i<40&&action('Finalize surface').disabled;i++)await new Promise(r=>setTimeout(r,50))
 assert.equal(action('Finalize surface').disabled,false)
 const reviewCanvases=root().querySelectorAll('canvas').filter(c=>c.ariaLabel?.startsWith('MRI surface review'));assert.equal(reviewCanvases.length,3);for(const canvas of reviewCanvases)assert.ok(canvas.context.lines>0)
 const cutoff=input('Dark band maximum brightness');cutoff.value='180';cutoff.dispatchEvent(new Event('input'));assert.equal(action('Finalize surface').disabled,true)
 await new Promise(r=>setTimeout(r,400));assert.equal(action('Finalize surface').disabled,true,'An invalid cutoff must not leave the last valid surface available for finalization')
 assert.ok(root().querySelectorAll('p').some(p=>p.textContent.includes('No reliable dark band')))
 cutoff.value='35';cutoff.dispatchEvent(new Event('input'))
 for(let i=0;i<40&&action('Finalize surface').disabled;i++)await new Promise(r=>setTimeout(r,50))
 assert.equal(action('Finalize surface').disabled,false)
 action('Set head centre at crosshair').click()
 for(let i=0;i<40&&action('Finalize surface').disabled;i++)await new Promise(r=>setTimeout(r,50))
 action('Finalize surface').click();await new Promise(r=>setTimeout(r,25))
 assert.equal(root(),undefined);assert.equal(saved.settings.method,'dark-band');assert.equal(saved.settings.darkBand.maximumIntensity,35);assert.deepEqual(saved.settings.darkBand.center,[16,16,16]);assert.ok(saved.mask.bytes.length>0)
 for(let i=0;i<saved.geometry.pts.length;i+=3)assert.ok(Math.abs(Math.hypot(saved.geometry.pts[i]-16,saved.geometry.pts[i+1]-16,saved.geometry.pts[i+2]-16)-8)<1)
 NVImage.loadFromFile=original;Element.prototype.getContext=previousContext
 console.log('MRI editor: direct no-mask default, derived brain review, input-dependent methods, retained region on switching, toggleable editing, invalid draft recovery and finalized masked recipe passed (DOM mocked).')
}

// Headpost tasks guide head fixation before chamber hardware, without demanding irrelevant electrodes.
{
 for(const intent of ['headpost','headpost-chamber','headpost-combined']){
  const project=createProject(asset,'Headpost guide',{kind:'standalone',subject:null,scan:null,sourceRoot:null});project.planningIntent=intent
  let feature='';const g=planningGuide({project:()=>project,hasPlanningSurface:()=>true,navigate:f=>{feature=f}});doc.body.append(g.element);g.start()
  const title=()=>g.element.querySelector('h2').children[0]
  for(let i=0;i<5&&title()!=='Define your headpost first';i++){const next=g.element.querySelectorAll('button').find(b=>b.children.includes('Next step'));assert.ok(next&&!next.disabled,title());next.click()}
  assert.equal(title(),'Define your headpost first');assert.equal(feature,'headposts')
  project.headposts=[{id:'hp'}];g.refresh()
  assert.equal(title(),intent==='headpost'?'Review and save':'Define your chamber');assert.equal(feature,intent==='headpost'?'review':'chamber')
  g.element.querySelectorAll('button').find(b=>b.getAttribute('aria-label')==='Close guided planning').click()
 }
 console.log('All three headpost guide tasks route to headposts first, then to chamber or save without irrelevant prerequisites (DOM mocked).')
}

// Anatomical layouts remain available without an electrode and preserve the selected layout.
{
 const {anatomyModes}=await import('../src/ui/anatomyModes.ts')
 const modes=[];const reslices={visible:'none',angleDegrees:0,tipOffset:0,zoom:()=>{}}
 const views=anatomyModes(new Element('canvas'),new Element('canvas'),new Element('canvas'),reslices,()=>{},mode=>modes.push(mode))
 assert.equal(views.selector.value,'column');assert.equal(modes[0],'column')
 const project=createProject(asset,'layouts',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
 for(const layout of ['row','column','axial','coronal','sagittal','cardinal']){views.selector.value=layout;views.selector.dispatchEvent(new Event('change'));views.update(project,null);assert.equal(views.selector.value,layout);assert.equal(reslices.visible,'none');assert.equal(modes.at(-1),layout)}
 views.reset();assert.equal(views.selector.value,'column');assert.equal(modes.at(-1),'column')
 console.log('Grid, row, column and single-plane anatomy layouts remain available without hardware and survive refreshes (DOM mocked).')
}

// Finalizing a surface outside the tutorial supersedes its optional image step.
{
 const next=g=>g.element.querySelectorAll('button').find(b=>b.children.includes('Next step')).click()
 const title=g=>g.element.querySelector('h2').children[0]
 for(const hidden of [false,true]){
  let surface=false,feature=''
  const project=createProject(asset,'Independent surface',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
  const g=planningGuide({project:()=>project,hasPlanningSurface:()=>surface,navigate:f=>{feature=f}});doc.body.append(g.element);g.start()
  assert.equal(title(g),'Optional: add images and overlays')
  // Opening another panel or changing an unrelated field is not completion.
  project.name='Renamed';g.refresh();assert.equal(title(g),'Optional: add images and overlays')
  if(hidden)g.element.querySelectorAll('button').find(b=>b.getAttribute('aria-label')==='Close guided planning').click()
  surface=true;g.refresh();if(hidden)g.start()
  assert.equal(title(g),'Choose a target');assert.equal(feature,'targets','Committed surface catches up without requiring any guide-button click')
  g.element.querySelectorAll('button').find(b=>b.children.includes('Back')).click()
  assert.equal(title(g),'Define the planning surface','Back can deliberately review the completed stage')
  g.element.querySelectorAll('button').find(b=>b.children.includes('Back')).click();assert.equal(title(g),'Optional: add images and overlays');g.refresh();assert.equal(title(g),'Optional: add images and overlays','Explicit Back review remains available')
  next(g);assert.equal(title(g),'Choose a target')
  g.element.querySelectorAll('button').find(b=>b.getAttribute('aria-label')==='Close guided planning').click();g.element.remove()
 }
 console.log('Out-of-guide surface finalization catches up from optional images while active or hidden; unrelated edits do not advance and explicit Back review remains available (DOM mocked).')
}
// Headpost drafts survive panel rebuilds and saving edits the one defined post.
{
 const {headpostsFeature}=await import('../src/features/headposts.ts'),{ProjectStore}=await import('../src/state/store.ts')
 const store=new ProjectStore();store.replace(createProject(asset,'Headpost editor',{kind:'standalone',subject:null,scan:null,sourceRoot:null}))
 const ctx={store,get project(){return store.project},scene:{mountingSurface:{surfaces:[]},setSurfaceFitHandler:()=>{},moveCrosshair:()=>{}},crosshair:()=>[1,2,3],edit:fn=>store.edit(fn),refresh:()=>{}}
 let panel=headpostsFeature.render(ctx)
 const field=label=>panel.querySelectorAll('input').find(i=>i.ariaLabel===label)
 const ref=()=>panel.querySelectorAll('select').find(i=>i.ariaLabel==='Headpost reference')
 const action=text=>panel.querySelectorAll('button').find(b=>b.children.includes(text))
 const change=(label,value)=>{const i=field(label);i.value=value;i.dispatchEvent(new Event('input'))}
 assert.equal(action('Define another headpost'),undefined)
 ref().value='thomas-pin';ref().dispatchEvent(new Event('change'));assert.equal(field('Post height above baseplate (mm)').value,'7')
 change('Headpost name','My measured headpost');change('Post diameter (mm)','4');change('Baseplate footprint diameter (mm)','16');change('Baseplate thickness (mm)','1.5')
 panel=headpostsFeature.render(ctx);assert.equal(ref().value,'thomas-pin');assert.equal(field('Headpost name').value,'My measured headpost');assert.equal(field('Baseplate footprint diameter (mm)').value,'16','Leaving and rebuilding the panel retains unsaved measurements')
 assert.ok(panel.querySelectorAll('canvas').find(c=>c.ariaLabel==='Rotatable 3D headpost preview'))
 panel.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}))
 assert.equal(store.project.headposts.length,1);const id=store.project.headposts[0].id
 panel=headpostsFeature.render(ctx);assert.equal(ref().value,'thomas-pin');assert.equal(field('Post diameter (mm)').value,'4','The saved headpost is selected automatically')
 change('Post height above baseplate (mm)','9');panel.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));assert.equal(store.project.headposts.length,1);assert.equal(store.project.headposts[0].id,id);assert.equal(store.project.headposts[0].postHeight,9)
 panel=headpostsFeature.render(ctx);ref().value='mark-ii';ref().dispatchEvent(new Event('change'));assert.equal(field('Baseplate thickness (mm)').value,'1','Published measurements populate immediately')
 assert.equal(field('Post diameter (mm)').required,true,'Missing dimensions must be filled for a dimensional envelope')
 assert.equal(field('Post diameter (mm)').disabled,false)
 assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('Published dimensions fill in where available')))
 panel=headpostsFeature.render(ctx);assert.equal(ref().value,'mark-ii','Unsaved reference selection survives a panel change')
 ref().value='esi-modular';ref().dispatchEvent(new Event('change'));assert.equal(field('Baseplate thickness (mm)').value,'','A new reference must not inherit another design’s dimensions')
 assert.equal(field('Baseplate thickness (mm)').required,true)
 assert.equal(store.project.headposts[0].reference,'thomas-pin','Draft edits are not silently committed')
 ref().value='custom';ref().dispatchEvent(new Event('change'));assert.equal(ref().value,'custom');assert.equal(field('Post diameter (mm)').disabled,false)
 store.undo();panel=headpostsFeature.render(ctx);assert.equal(ref().value,'thomas-pin');assert.equal(field('Post height above baseplate (mm)').value,'7','Undo of saved headpost edits discards a stale draft')
 store.replace(createProject({...asset,id:'other-image'},'Different project',{kind:'standalone',subject:null,scan:null,sourceRoot:null}));panel=headpostsFeature.render(ctx);assert.equal(ref().value,'custom');assert.equal(field('Headpost name').value,'Headpost','Drafts do not leak into another project')
 console.log('Headpost preset values, draft/selection persistence, single-post save/update, optional CAD, undo/project isolation and isolated 3D preview passed (DOM/GPU mocked).')
}

// Importing actual headpost geometry overrides the editable dimensional envelope.
{
 const {headpostsFeature}=await import('../src/features/headposts.ts'),{ProjectStore}=await import('../src/state/store.ts'),{headpostGeometry}=await import('../src/render/headpostGeometry.ts'),{binarySTL}=await import('../src/data/geometryExport.ts')
 const store=new ProjectStore();store.replace(createProject(asset,'CAD headpost',{kind:'standalone',subject:null,scan:null,sourceRoot:null}))
 const ctx={store,get project(){return store.project},scene:{mountingSurface:{surfaces:[]},setSurfaceFitHandler:()=>{},moveCrosshair:()=>{}},crosshair:()=>[1,2,3],edit:fn=>store.edit(fn),refresh:()=>{}}
 let panel=headpostsFeature.render(ctx)
 const action=text=>panel.querySelectorAll('button').find(b=>b.children.includes(text))
 const ref=()=>panel.querySelectorAll('select').find(s=>s.ariaLabel==='Headpost reference')
 ref().value='mark-ii';ref().dispatchEvent(new Event('change'));assert.equal(panel.querySelectorAll('input').find(i=>i.ariaLabel==='Post diameter (mm)').required,true)
 const geometry=headpostGeometry({pose:{origin:[0,0,0],angles:[0,0,0]},postDiameter:4,postHeight:20,baseDiameter:18,baseThickness:1})
 action('Import headpost STL…').click();const input=doc.body.querySelectorAll('input').find(i=>i.type==='file');input.files=[new File([binarySTL(geometry)],'measured-headpost.stl')];input.dispatchEvent(new Event('change'))
 await new Promise(r=>setTimeout(r,40));assert.ok(!action('Save headpost').disabled)
 assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('measured-headpost.stl')))
 assert.ok(panel.querySelectorAll('span').some(p=>p.children.includes('Model height (mm)')),'Imported models expose their measured overall dimensions')
 panel=headpostsFeature.render(ctx);assert.equal(ref().value,'mark-ii');assert.ok(!action('Save headpost').disabled,'Imported geometry persists with the unsaved reference')
 panel.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}))
 assert.equal(store.project.headposts.length,1);assert.equal(store.project.headposts[0].sourceName,'measured-headpost.stl');assert.equal(store.project.headposts[0].reference,'mark-ii');assert.ok(store.project.headposts[0].mesh.pts.length)
 assert.deepEqual(store.project.headposts[0].pose.origin,[0,0,0],'Aligned imported geometry starts without an extra translation')
 panel=headpostsFeature.render(ctx);assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('already line up with the image')))
 console.log('Real STL parsing, imported-model measurements, optional CAD override, draft retention and saved mesh selection passed (DOM/GPU mocked).')
}

// Refreshing assets of the same project must not restart a later guide stage.
{
 let project=createProject(asset,'In-place reload',{kind:'standalone',subject:null,scan:null,sourceRoot:null}),surface=true
 addAssembly(project,[0,0,30]);project.chambers[0].placementState='unplaced';project.targets=[{id:'t',name:'Target',point:[0,0,0],frameId:project.frame.id,color:'#fff',atlas:null}];const e=project.electrodes[0];applyHardwarePreset(e,hardwareCatalog[0]);confirmSetup(e,setupValues(e))
 const g=planningGuide({project:()=>project,hasPlanningSurface:()=>surface,navigate:()=>{}});doc.body.append(g.element);g.start()
 const title=()=>g.element.querySelector('h2').children[0],next=()=>g.element.querySelectorAll('button').find(b=>b.children.includes('Next step')).click()
 next();assert.equal(title(),'Choose hardware and constraints');next();assert.equal(title(),'Set trajectory constraints')
 project=structuredClone(project);g.projectChanged(true);assert.equal(title(),'Set trajectory constraints','MRI surface/mesh reload preserves tutorial progress in the same reference frame')
 surface=false;g.refresh();assert.equal(title(),'Define the planning surface','A removed surface still invalidates downstream stages')
 surface=true;g.projectChanged(true);assert.equal(title(),'Optional: draw exclusions','Refinalization observes the completed surface without restarting images')
 project=createProject({...asset,id:'new-ref'},'New reference',{kind:'standalone',subject:null,scan:null,sourceRoot:null});surface=false;g.projectChanged(true);assert.equal(title(),'Optional: add images and overlays','A genuinely new reference still starts its own guide session')
 g.element.querySelectorAll('button').find(b=>b.getAttribute('aria-label')==='Close guided planning').click();g.element.remove()
 console.log('Same-project surface reload preserves later guidance; surface removal and new references still reconcile prerequisites (DOM mocked).')
}

// Product/literature templates expose sourced dimensions without inventing another variant's shape.
{
 const {headpostsFeature}=await import('../src/features/headposts.ts'),{ProjectStore}=await import('../src/state/store.ts')
 const store=new ProjectStore();store.replace(createProject(asset,'Sourced templates',{kind:'standalone',subject:null,scan:null,sourceRoot:null}))
 const ctx={store,get project(){return store.project},scene:{mountingSurface:{surfaces:[]},setSurfaceFitHandler:()=>{},moveCrosshair:()=>{}},crosshair:()=>[1,2,3],edit:fn=>store.edit(fn),refresh:()=>{}}
 let panel=headpostsFeature.render(ctx)
 const ref=()=>panel.querySelectorAll('select').find(i=>i.ariaLabel==='Headpost reference'),field=label=>panel.querySelectorAll('input').find(i=>i.ariaLabel===label)
 for(const id of ['gmr-dahp-1','gmr-dahp-2','gmr-peek','crist','adams-2011'])assert.ok(ref().options.some(o=>o.value===id))
 ref().value='gmr-dahp-2';ref().dispatchEvent(new Event('change'));assert.equal(field('Baseplate thickness (mm)').value,'1.39');assert.ok(panel.querySelectorAll('strong').some(n=>n.children.includes('3 mm')));assert.ok(panel.querySelectorAll('a').some(a=>a.href?.includes('PMC5814707')))
 panel=headpostsFeature.render(ctx);assert.equal(ref().value,'gmr-dahp-2');assert.equal(field('Baseplate thickness (mm)').value,'1.39')
 ref().value='gmr-dahp-1';ref().dispatchEvent(new Event('change'));assert.equal(field('Baseplate thickness (mm)').value,'');assert.ok(!panel.querySelectorAll('strong').some(n=>n.children.includes('3 mm')),'Previous design measurements must not remain visible')
 ref().value='adams-2011';ref().dispatchEvent(new Event('change'));assert.equal(field('Baseplate thickness (mm)').value,'1.5')
 ref().value='mark-ii';ref().dispatchEvent(new Event('change'));assert.equal(field('Baseplate thickness (mm)').value,'1')
 assert.ok(!panel.querySelectorAll('a').some(a=>a.href?.includes('PMC13603819') || a.href?.includes('primate-chairs')),'Caps and chair holders are excluded from headpost references')
 assert.ok(!ref().options.some(o=>o.value.includes('cap')),'A protective cap is not a selectable headpost implant')
 console.log('Sourced headpost UI: manufacturer/reference choices, linked dimensions, draft retention, variant/revision isolation, stale-detail removal and separate accessory resources passed (DOM mocked).')
}
// Programmatic restores must update both controls and their percentage readouts.
display.anatomyOpacity=.92;display.skullOpacity=.17;controls.update(p)
assert.equal(controls.element.querySelectorAll('input').find(input=>input.ariaLabel==='Brain opacity in 3D').value,'0.92')
assert.equal(controls.element.querySelectorAll('input').find(input=>input.ariaLabel==='Skull opacity in 3D').value,'0.17')
assert.equal(controls.element.querySelectorAll('output')[0].textContent,'92%')
assert.equal(controls.element.querySelectorAll('output')[1].textContent,'17%')
console.log('Programmatic opacity restores synchronize sliders and percentage outputs.')
