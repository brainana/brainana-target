import assert from 'node:assert/strict'
import {unzipSync,strFromU8} from 'fflate'
import {createProject,addAssembly} from '@brainana/planning-core/model.ts'
import {searchTarget,applyCandidate,activeAvoidRegions} from '@brainana/planning-core/optimization.ts'
import {gridFitsChamber,seatedGridHeight,axes,trajectory,sub,length,worldToLocal,dot} from '@brainana/planning-core/geometry.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
import {headpostAvoidance,headpostReferences} from '@brainana/planning-core/headposts.ts'
import {projectSnapshot} from '../src/state/projectSnapshot.ts'
import {chamberBody,chamberSupport} from '../src/render/mountGeometry.ts'
import {gridWedge} from '../src/render/gridGeometry.ts'
import {geometryBundle} from '../src/data/geometryExport.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
import {createAsset} from '../src/data/assets.ts'
const bytes=new Uint8Array([1,2,3]),asset=await createAsset('MRI','anatomy','f',bytes)
const skullBytes=new Uint8Array([4,5,6]),skullAsset=await createAsset('skull.stl','surface','f',skullBytes);skullAsset.id='s';skullAsset.surfaceKind='skull'
const make=()=>{const p=createProject(asset,'Mount',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(p,[0,0,30]);const c=p.chambers[0],g=p.grids[0],e=p.electrodes[0];c.height=12;c.innerRadius=5;g.minimumThickness=2;g.holeDiameter=1;e.depth=30;p.targets=[{id:'t',name:'T',point:[0,0,-10],frameId:p.frame.id,color:'#ffffff',atlas:null}];p.planning={mode:'new',seed:null,searchStep:8,searchRadius:10,maxMiss:.01,margin:0};p.assets.push({...skullAsset});return p}
const plane={pts:new Float32Array([-100,-100,0,100,-100,0,-100,100,0,100,100,0]),tris:new Uint32Array([0,1,2,1,3,2])},options={surface:plane.pts,supportSurfaces:[plane],supportAssetIds:['s'],supportSource:'skull',accessPoint:[0,0,0],maximumLocalGridTilt:30}
for(const mounting of ['custom','cut','pedestal','acrylic']){
 const p=make();p.chambers[0].mounting=mounting
 const result=searchTarget(p,p.electrodes[0].id,'t',options);assert.ok(result.candidates.length,`${mounting} produces fits`)
 for(const candidate of result.candidates){const c={...p.chambers[0],pose:candidate.pose,baseFit:candidate.baseFit},g={...p.grids[0],...candidate.gridConfiguration};assert.ok(gridFitsChamber(c,g));const wedge=gridWedge(c,g);for(let i=0;i<wedge.pts.length;i+=3)assert.ok(worldToLocal(c.pose,Array.from(wedge.pts.slice(i,i+3)))[2]<1e-5,'No grid vertex above lip');if(mounting==='cut')assert.ok(Math.max(...c.baseFit.innerDepths,...c.baseFit.outerDepths)<=c.height+1e-6);if(mounting==='pedestal'||mounting==='acrylic')assert.ok(Math.min(...c.baseFit.innerDepths,...c.baseFit.outerDepths)>=c.height+.5-1e-6)}
 applyCandidate(p,p.electrodes[0].id,'t',result.candidates[0],options);validateProject(p)
 const c=p.chambers[0],body=chamberBody(c),support=chamberSupport(c)
 assert.equal(!!support,['pedestal','acrylic'].includes(mounting));if(support)for(let i=0;i<body.pts.length;i+=3){const z=worldToLocal(c.pose,Array.from(body.pts.slice(i,i+3)))[2];assert.ok(Math.abs(z)<1e-5||Math.abs(z+c.height)<1e-5,'Fixed cylinder stays flat-bottomed')}
 const zip=unzipSync(geometryBundle(p,[plane]));assert.ok(zip[`rim-measurements-${c.id}.csv`]);assert.equal(!!zip[`mount-${c.id}.stl`],!!support)
}
function makeWithMount(mode){const p=make();p.chambers[0].mounting=mode;return p}
for(const mounting of ['cut','pedestal','acrylic']){const p=makeWithMount(mounting);assert.ok(searchTarget(p,p.electrodes[0].id,'t',{...options,accessPoint:undefined,expand:true}).candidates.length,`Automatic ${mounting} has a feasible fit`)}
const p=make(),c=p.chambers[0],g=p.grids[0];assert.ok(seatedGridHeight(c,{...g,tiltAngle:25})<0)
for(const manualPreference of ['grid','vertical','surface']){const r=searchTarget(p,p.electrodes[0].id,'t',{...options,manualPreference});assert.ok(r.candidates.length);const score=x=>manualPreference==='grid'?x.gridConfiguration.tiltAngle:Math.acos(axes(x.pose)[2][2]);assert.ok(score(r.candidates[0])<=Math.min(...r.candidates.map(score))+1e-8)}
const first=searchTarget(p,p.electrodes[0].id,'t',options);applyCandidate(p,p.electrodes[0].id,'t',first.candidates[0],options);const secondOptions={...options,accessPoint:[3,0,0]},second=searchTarget(p,p.electrodes[0].id,'t',secondOptions);assert.ok(second.candidates.length);applyCandidate(p,p.electrodes[0].id,'t',second.candidates[0],secondOptions);assert.ok(length(sub(trajectory(p.chambers[0],p.grids[0],p.electrodes[0]).tip,p.targets[0].point))<.01);assert.ok(gridFitsChamber(p.chambers[0],p.grids[0]));assert.ok(length(sub(second.candidates[0].surfaceCenter,[3,0,0]))<1)
for(const intent of ['headpost','headpost-chamber','headpost-combined'])validateProject({...make(),planningIntent:intent})
const hp=make();hp.headposts=[{id:'hp',name:'Headpost',frameId:hp.frame.id,pose:{origin:[0,0,0],angles:[0,0,0]},avoid:true,existing:true,reference:'custom',postDiameter:4,postHeight:15,baseDiameter:12,baseThickness:1}];validateProject(hp);assert.equal(headpostAvoidance(hp).length,2);assert.equal(activeAvoidRegions(hp).length,2);assert.ok(searchTarget(hp,hp.electrodes[0].id,'t',options).rejectedAvoidance>0);hp.headposts[0].avoid=false;assert.equal(headpostAvoidance(hp).length,0)
const mesh={pts:[0,0,0,1,0,0,0,1,0],tris:[0,1,2]};hp.headposts[0].mesh=mesh;const snapshot=projectSnapshot(hp),again=projectSnapshot(snapshot);assert.equal(snapshot.headposts[0].mesh,again.headposts[0].mesh,'Large imported mesh is shared immutably across snapshots');assert.notEqual(snapshot.headposts[0],again.headposts[0]);assert.ok(Object.isFrozen(snapshot.headposts[0].mesh.pts));const archive=await packProject(hp,new Map([[asset.id,bytes],['s',skullBytes]]));const restored=(await unpackProject(archive)).project;assert.deepEqual(restored.headposts,hp.headposts);const output=unzipSync(geometryBundle(restored,[plane]));assert.ok(output['headpost-hp.stl']);assert.ok(strFromU8(output['coordinates.csv']).includes('headpost_base'));assert.equal(headpostReferences.find(x=>x.id==='thomas-pin').source.includes('thomasrecording'),true)
console.log('Repeated manual clicks keep grid inside chamber and hit target; fit preferences rank correctly; all stock/custom mounting modes have valid geometry, support exports and automatic/manual fits. Headposts validate, affect avoidance, export, round-trip and share immutable imported geometry.')

const {SurfaceRayIndex}=await import('@brainana/planning-core/surface-rays.ts')
const {fitHeadpostPose}=await import('../src/render/headpostSlide.ts')
const slope={pts:[-10,-10,-5,10,-10,5,10,10,5,-10,10,-5],tris:[0,1,2,0,2,3]}
const index=new SurfaceRayIndex([slope]),expected=[-1/Math.sqrt(5),0,2/Math.sqrt(5)]
for(const x of [-3,0,4]){
 const hit=index.intersection([x,0,20],[0,0,-1])
 const pose=fitHeadpostPose(index,hit,{origin:[0,0,0],angles:[0,0,0]},2)
 assert.ok(dot(axes(pose)[2],expected)>.999999)
 assert.ok(Math.abs(dot(pose.origin,expected)-.05)<1e-5)
}
assert.equal(index.intersection([30,30,20],[0,0,-1]),null)
console.log('Headpost slide follows a tilted surface and keeps the flat base above it.')
