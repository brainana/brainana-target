import assert from 'node:assert/strict'
import {applySurfaceBrush} from '../src/render/surfaceBrush.ts'
import {skullPreview} from '../src/render/ctSkull.ts'
import {detectOpenings} from '../src/render/detectOpenings.ts'
import {createProject,addAssembly} from '../../../packages/planning-core/model.ts'
import {validateProject} from '../../../packages/planning-core/validation.ts'
import {activeAvoidRegions,searchTarget,settings} from '../../../packages/planning-core/optimization.ts'
import {openingSurfaceKey} from '../../../packages/planning-core/skull-surface.ts'
import {currentOpening} from '../../../packages/planning-core/surface-openings.ts'
const lo=[-5,20,30],hi=[5,30,40],dims=[10,10,10],original=new Uint8Array(1000).fill(1)
const stroke={mode:'erase',normal:2,thicknessMm:1,radius:1,points:[[-1.5,25.5,35.5]]}
let mask=original.slice();applySurfaceBrush(mask,dims,lo,hi,1,[stroke]);assert.equal(mask.filter(v=>!v).length,5)
for(let i=0;i<mask.length;i++)if(!mask[i])assert.equal(Math.floor(i/100),5,'Slice brush may not erase neighboring planes')
applySurfaceBrush(mask=original.slice(),dims,lo,hi,1,[stroke,{...stroke,mode:'restore'}]);assert.deepEqual(mask,original)
const air=original.slice();air[3+5*10+5*100]=0;applySurfaceBrush(mask=air.slice(),dims,lo,hi,1,[stroke,{...stroke,mode:'restore'}]);assert.deepEqual(mask,air,'Restore must never invent bone where the threshold mask was empty')
const swept={...stroke,radius:.4,points:[[-1.5,25.5,35.5],[1.5,25.5,35.5]]};applySurfaceBrush(mask=original.slice(),dims,lo,hi,1,[swept]);assert.equal(mask.filter(v=>!v).length,4,'Fast pointer motion must paint a continuous capsule')
assert.ok(original.every(v=>v===1),'Brush replay must not mutate source data')
console.log('Physical slice brush, continuous strokes, bounded slab, restore semantics and immutable source passed.')
const bounds=[[-15,-15,-15],[15,15,15]],options={spacingMm:.5,components:'largest',representation:'outer',center:[0,0,0]}
const shell={sample:p=>{const r=Math.hypot(...p);return r>=8&&r<=10?1000:0}},hole={sample:p=>p[2]>6&&Math.hypot(p[0],p[1])<2?0:shell.sample(p)}
const mesh=skullPreview(shell,300,bounds,options),holed=skullPreview(hole,300,bounds,options)
assert.deepEqual(detectOpenings(mesh,bounds,.5),[])
const candidates=detectOpenings(holed,bounds,.5);assert.equal(candidates.length,1);assert.ok(candidates[0].center[2]>9);assert.ok(candidates[0].radius>1.5&&candidates[0].radius<3)
assert.deepEqual(detectOpenings(holed,bounds,.5,.5,2),[],'Size controls must filter larger openings')
const cropped=skullPreview(shell,300,[[-15,-15,-15],[15,15,8]],options);assert.deepEqual(detectOpenings(cropped,[[-15,-15,-15],[15,15,8]],.5),[],'Crop boundaries are not screw-hole candidates')
assert.throws(()=>detectOpenings(mesh,bounds,.5,5,1),/Minimum/)
const p=createProject({id:'ct',name:'ct.nii',role:'anatomy',modality:'ct',frameId:'frame',sha256:'a'.repeat(64),sourcePath:null},'Editing',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
const config={...options,threshold:300,bounds,useForPlanning:true,show:true,edits:[]}
p.assets[0].imageDisplay={min:0,max:1000,opacity:.85,colormap:'cool',visible:true,skull:config};p.planningSurfaceIds=['ct']
p.surfaceOpenings=[{id:'opening',name:'Candidate opening',frameId:p.frame.id,assetId:'ct',assetSha256:p.assets[0].sha256,surfaceKey:openingSurfaceKey(config),center:[0,0,10],radius:2,origin:'detected',reviewed:false,avoid:false}]
assert.equal(activeAvoidRegions(p).length,0)
p.surfaceOpenings[0].avoid=true;assert.equal(activeAvoidRegions(p).length,0,'Unreviewed automatic detections must never constrain placement')
p.surfaceOpenings[0].reviewed=true;assert.equal(activeAvoidRegions(p).length,1);validateProject(p)
p.planning={...settings(p),mode:'new',avoidRegionIds:[],seed:[0,0,18],searchStep:2,margin:0}
assert.equal(activeAvoidRegions(p).length,1,'Confirmed opening exclusions are managed independently of generic avoidance-area selection')
const before=openingSurfaceKey(config);config.edits=[stroke];assert.notEqual(openingSurfaceKey(config),before);assert.equal(currentOpening(p,p.surfaceOpenings[0]),false);assert.equal(activeAvoidRegions(p).length,0,'Edited segmentation must invalidate prior opening review')
config.edits=[];assert.equal(currentOpening(p,p.surfaceOpenings[0]),true)
const oldHash=p.assets[0].sha256;p.assets[0].sha256='b'.repeat(64);assert.equal(activeAvoidRegions(p).length,0);p.assets[0].sha256=oldHash
addAssembly(p,[0,0,18]);p.chambers[0].innerRadius=1.5;p.chambers[0].wallThickness=.5;p.chambers[0].height=6;p.targets.push({id:'target',name:'Target',frameId:p.frame.id,point:[0,0,0],color:'#ffffff',atlas:null})
const e=p.electrodes[0],searchOptions={surface:mesh.pts,supportSurfaces:[mesh],supportSource:'skull',supportAssetIds:['ct'],expand:true}
p.surfaceOpenings[0].avoid=false;const unrestricted=searchTarget(p,e.id,'target',searchOptions)
p.surfaceOpenings[0].avoid=true;const restricted=searchTarget(p,e.id,'target',searchOptions)
assert.ok(unrestricted.candidates.length&&restricted.candidates.length);assert.ok(restricted.rejectedAvoidance>0);assert.ok(restricted.candidates[0].displacement>unrestricted.candidates[0].displacement)
assert.ok(restricted.candidates.every(c=>c.clearance>=0));validateProject(p)
for(const change of [q=>{q.assets[0].imageDisplay.skull.edits=[{...stroke,radius:NaN}]},q=>{q.surfaceOpenings[0].radius=-1},q=>{q.surfaceOpenings[0].assetId='missing'},q=>{q.surfaceOpenings.push({...q.surfaceOpenings[0]})}]){const bad=structuredClone(p);change(bad);assert.throws(()=>validateProject(bad))}
console.log('Opening detection size/crop filters, explicit review, stale-source protection, schema checks and real placement exclusions passed.')
const {reviewPointer}=await import('../src/ui/surfaceReview.ts')
const reviewBounds=[[0,0,0],[10,20,30]],selected=[5,10,15]
assert.equal(reviewPointer({left:100,top:50,width:400,height:200},150,150,reviewBounds,selected,2,0,1),null,'Letterbox margins are not image coordinates')
assert.deepEqual(reviewPointer({left:100,top:50,width:400,height:200},300,150,reviewBounds,selected,2,0,1),selected)
assert.deepEqual(reviewPointer({left:0,top:0,width:200,height:400},100,200,reviewBounds,selected,2,0,1),selected,'Changing the relative pane sizes must preserve physical picking')
console.log('Resized and letterboxed slice picking preserves physical brush/crosshair coordinates.')
// Lower-skull filtering follows skull extents even in an asymmetric acquisition FOV.
const asymmetricBounds=[[-16,-17,-35],[18,19,16]]
const twoHoles={sample:p=>Math.abs(p[2])>6&&Math.hypot(p[0],p[1])<2?0:shell.sample(p)}
const both=skullPreview(twoHoles,300,asymmetricBounds,options)
const all=detectOpenings(both,asymmetricBounds,.5),upper=detectOpenings(both,asymmetricBounds,.5,.5,10,true)
assert.equal(all.length,2);assert.equal(upper.length,1);assert.ok(upper[0].center[2]>9)
const {surfaceRay,raySurface,rayOpening}=await import('../src/render/surfacePicking.ts')
const {mat4,vec3}=await import('gl-matrix')
const camera=mat4.create(),projection=mat4.create(),mvp=mat4.create()
mat4.lookAt(camera,[30,25,40],[0,0,0],[0,0,1]);mat4.perspective(projection,Math.PI/3,1.7,.1,200);mat4.multiply(mvp,projection,camera)
const ndc=vec3.transformMat4(vec3.create(),[0,0,10],mvp),ray=surfaceRay(mvp,(ndc[0]+1)/2,(1-ndc[1])/2)
assert.ok(rayOpening([{center:[0,0,10],radius:.1}],...ray,null),'Camera unprojection must find a known point across perspective and rotation')
const origin=[0,0,30],direction=[0,0,-1],hit=raySurface(holed,origin,direction)
assert.ok(hit&&hit[2]<-9,'Clicking through the hole must not snap to a nonexistent front triangle')
assert.equal(rayOpening(candidates,origin,direction,hit),candidates[0],'A hole centre must remain selectable despite missing triangles')
assert.equal(rayOpening([{center:[0,0,-20],radius:1}],origin,direction,[0,0,-10]),null,'Bone must occlude far-side markers')
assert.ok(raySurface(mesh,origin,direction)[2]>9,'Surface click must use the nearest triangle')
assert.equal(rayOpening(candidates,[12,0,30],direction,null),null,'A distant opening must not be selected')
console.log('Skull-relative lower-half filter, camera unprojection, nearest-surface picking, hole-centre selection and bone occlusion passed.')
// A diameter threshold must describe the aperture, not its farthest rim vertex.
const {measureBoundary,apertureInRange}=await import('../src/render/openingGeometry.ts')
const {measureCTOpening}=await import('../src/render/measureCTOpening.ts')
const circle=(diameter,z=0)=>Array.from({length:96},(_,i)=>[Math.cos(i*Math.PI/48)*diameter/2,Math.sin(i*Math.PI/48)*diameter/2,z])
for(const diameter of [1,2,2.5,3]){
 const c=measureBoundary(circle(diameter));assert.ok(Math.abs(c.diameter-diameter)<.005);assert.ok(Math.abs(c.minimumWidth-diameter)<.005)
}
const slit=measureBoundary(circle(3).map(p=>[p[0],p[1]/3,p[2]]))
assert.ok(slit.radius*2>=3);assert.ok(slit.minimumWidth<1.01);assert.equal(apertureInRange(slit,2,5),false,'A long narrow gap is not a >=2 mm opening')
const inflated=measureBoundary(circle(4))
for(const diameter of [1.2,2.4,3]){
 const sample=p=>Math.abs(p[2])<.7&&Math.hypot(p[0],p[1])>=diameter/2?1000:0
 const measured=measureCTOpening(inflated,sample,500,.2)
 assert.ok(measured);assert.ok(Math.abs(measured.diameter-diameter)<.15,`CT aperture ${diameter} mm must not inherit the 4 mm mesh boundary`)
 assert.equal(apertureInRange(measured,2,5),diameter>=2)
 assert.equal(measured.measurement.source,'ct');assert.equal(measured.measurement.resolutionMm,.2)
}
assert.equal(measureCTOpening(inflated,p=>Math.abs(p[2])<.7?1000:0,500,.2),null,'A mesh gap over intact CT bone is not an opening')
assert.equal(measureCTOpening(inflated,()=>0,500,.2),null,'Open air without a closed bone rim is not an opening')
assert.equal(measureCTOpening(inflated,()=>NaN,500,.2),null,'Apertures outside source data must not receive a fabricated estimate')
const verified=measureCTOpening(candidates[0],hole.sample,300,.5)
assert.ok(verified);assert.ok(Math.abs(verified.diameter-4)<.5,'Physical CT aperture must agree with a known 4 mm hole despite mesh sampling/smoothing')
p.surfaceOpenings[0].measurement={diameter:2.4,minimumWidth:2.3,maximumWidth:2.6,resolutionMm:.2,source:'ct'};validateProject(p)
const corrupt=structuredClone(p);corrupt.surfaceOpenings[0].measurement.diameter=NaN;assert.throws(()=>validateProject(corrupt))
console.log('Known 1–3 mm aperture measurements, slit rejection, CT-confirmed sizing, mesh-only gap rejection and measurement schema passed.')
// Irregular, unrecognized mesh gaps must not place manual markers on the far skull wall.
const {rayRimPoint}=await import('../src/render/surfacePicking.ts')
const frontRim=rayRimPoint(holed,origin,direction,hit,3)
assert.ok(frontRim&&frontRim[2]>8,'An unrecognized hole click must anchor at its front rim rather than the far-side ray hit')
assert.ok(Math.abs(frontRim[0])<1e-6&&Math.abs(frontRim[1])<1e-6,'Rim anchoring must preserve the click ray, not jump to a boundary vertex')
assert.equal(rayRimPoint(mesh,origin,direction,raySurface(mesh,origin,direction),3),null,'An intact skull has no hole rim and must not acquire an automatic manual anchor')
assert.equal(rayRimPoint(holed,[12,0,30],direction,null,1),null,'Remote rims must not attract unrelated clicks')
// Exercise the real NiiVue camera, including its orthographic depth convention and mirrored axis.
const {Niivue}=await import('@niivue/niivue')
let viewsChecked=0
for(const [azimuth,elevation] of [[0,70],[45,60],[120,25],[210,65],[300,75]]){
 const camera={gl:{canvas:{width:1100,height:420}},furthestFromPivot:30,pivot3D:[0,0,0],scene:{volScaleMultiplier:1.7},position:[0,0,0]}
 const matrix=Niivue.prototype.calculateMvpMatrix.call(camera,null,[0,0,1100,420],azimuth,elevation)[0]
 const ndc=vec3.transformMat4(vec3.create(),[0,0,10],matrix),clickRay=surfaceRay(matrix,(ndc[0]+1)/2,(1-ndc[1])/2)
 if(clickRay[0][2]<10||clickRay[1][2]>=0)continue
 const boneHit=raySurface(holed,...clickRay),anchor=rayRimPoint(holed,...clickRay,boneHit,3)
 assert.ok(anchor&&anchor[2]>8,'Rotation must not move a front-opening anchor to the opposite skull wall')
 viewsChecked++
}
assert.ok(viewsChecked>=2,'Exercise several visible views through the real camera transform')
console.log('Manual front-rim anchoring, no remote/far-wall fallback and actual NiiVue rotation/zoom camera checks passed.')
// Full-aperture annotations retain the CT footprint and never alter mounting geometry.
const {openingMarker}=await import('../src/render/openingMarker.ts')
const footprint=measureCTOpening(inflated,p=>Math.abs(p[2])<.7&&Math.hypot(p[0],p[1])>=1.2?1000:0,500,.2)
assert.ok(footprint.patch?.tris.length>6)
const savedMesh=holed.pts.slice(),opening={...p.surfaceOpenings[0],center:footprint.center,radius:footprint.radius,normal:footprint.normal,patch:footprint.patch,constraint:'soft',reviewed:true,avoid:true}
const annotation=openingMarker(opening,[0,0,-10]);assert.equal(annotation.tris.length,footprint.patch.tris.length*2,'Colored aperture patches must be double-sided when rotating')
assert.deepEqual(holed.pts,savedMesh,'Aperture annotations must never fill holes in the planning mesh')
p.surfaceOpenings=[{...opening,center:[0,0,10]}];validateProject(p)
const {openingAvoidRegions}=await import('../../../packages/planning-core/surface-openings.ts')
assert.equal(openingAvoidRegions(p).length,0);assert.equal(openingAvoidRegions(p,'soft').length,1)
p.surfaceOpenings[0].constraint='hard';assert.equal(openingAvoidRegions(p).length,1)
p.surfaceOpenings[0].constraint='ignore';assert.equal(openingAvoidRegions(p).length,0);assert.equal(openingAvoidRegions(p,'soft').length,0)
p.surfaceOpenings[0].constraint='soft';p.assets[0].sha256='b'.repeat(64);assert.equal(openingAvoidRegions(p,'soft').length,0,'Stale soft markers are inactive just like stale hard markers')
console.log('Full aperture display footprints, immutable skull topology, three opening-priority modes and stale-source checks passed.')
