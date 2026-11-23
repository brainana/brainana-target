import assert from 'node:assert/strict'
import {createProject,addAssembly} from '../model.ts'
import {gridAxes,holeLocal,trajectory,targetApproach,gridHoleClearance,gridHoles,gridPose,axes,aimGridPose,sub,length} from '../geometry.ts'
import {searchTarget,applyCandidate} from '../optimization.ts'
import {validateProject} from '../validation.ts'
import {segmentTriangleDistance} from '../wall-mesh.ts'
const p=createProject({id:'a',name:'mri.nii',role:'anatomy',frameId:'f',sha256:'a'.repeat(64),sourcePath:null},'Angled grid',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(p,[0,0,0])
const c=p.chambers[0],g=p.grids[0],e=p.electrodes[0];c.innerRadius=10;c.height=20;c.wallThickness=1;g.spacing=1;g.count=19;e.depth=35;e.diameter=.3
const old=trajectory(c,g,e);assert.deepEqual(old.direction,[0,0,-1])
Object.assign(g,{seating:'manual',tiltAngle:15,tiltAzimuth:0,minimumThickness:2,holeDiameter:.7,seatHeight:0})
const t=trajectory(c,g,e),theta=15*Math.PI/180
assert.ok(Math.abs(t.direction[0]-Math.sin(theta))<1e-12);assert.ok(Math.abs(t.direction[2]+Math.cos(theta))<1e-12)
assert.ok(Math.abs(t.entry[2]-(2+10*Math.tan(theta)))<1e-12)
const h=holeLocal(g,[3,2],c),h2=holeLocal(g,[4,2],c)
assert.ok(Math.abs(length(sub(h2,h))-1)<1e-12,'Pitch is measured on the sloped entry face')
const approach=targetApproach(c,g,e.hole,t.tip,e);assert.ok(approach.miss<1e-10);assert.ok(Math.abs(approach.depth-e.depth)<1e-10)
assert.deepEqual(trajectory(c,g,{...e,hole:[2,1]}).direction,t.direction,'All channels remain parallel')
const safe=gridHoles(c,g).filter(h=>gridHoleClearance(c,g,e,h)>=-1e-8),blocked=gridHoles(c,g).filter(h=>gridHoleClearance(c,g,e,h)<-1e-8)
assert.ok(safe.some(h=>h[0]===0&&h[1]===0));assert.ok(blocked.some(h=>h[0]>=5));assert.ok(safe.length>0&&blocked.length>0)
const guide={...e,guideTube:{innerDiameter:.4,outerDiameter:1,length:25,tipDepth:10}}
assert.ok(gridHoleClearance(c,g,guide,[0,0])<0,'A guide tube wider than the grid channel must be blocked')
const rotated={...g,tiltAzimuth:90};const d=trajectory(c,rotated,e).direction;assert.ok(Math.abs(d[0])<1e-10&&d[1]>.25)
for(const angle of [0,15,45,90,160]){
 const pose=aimGridPose({origin:[10,20,30],angles:[0,0,angle]},g,[0,0,-30]);const aimed=axes(pose),gb=gridAxes(g),world=gb[2].map((_,k)=>aimed.reduce((sum,col,i)=>sum+col[k]*gb[2][i],0));const wanted=sub(pose.origin,[0,0,-30]);assert.ok(length(sub(world,wanted.map(v=>v/length(wanted))))<1e-8)
}
assert.ok(length(sub(axes(gridPose(c,g))[2],gridAxes(g)[2]))<1e-10)
p.targets=[{id:'t',name:'Angled target',point:t.tip,frameId:p.frame.id,color:'#ffffff',atlas:null}];e.targetId='t';p.planning={mode:'existing',seed:null,searchRadius:5,searchStep:2,maxMiss:.01,margin:0}
const result=searchTarget(p,e.id,'t');assert.ok(result.candidates.some(candidate=>candidate.hole[0]===0&&candidate.hole[1]===0&&candidate.miss<1e-8));assert.ok(searchTarget({...p,planning:{...p.planning,maxMiss:100}},e.id,'t').rejectedWall>0)
applyCandidate(p,e.id,'t',result.candidates[0]);validateProject(p)
const q=structuredClone(p);Object.assign(q.grids[0],{tiltAngle:0,tiltAzimuth:0,minimumThickness:2,angleSearch:{maximum:15,step:15,azimuthStep:90}})
const optimized=searchTarget(q,e.id,'t');assert.ok(optimized.candidates.length);assert.equal(optimized.candidates[0].gridConfiguration.tiltAngle,15)
applyCandidate(q,e.id,'t',optimized.candidates[0]);assert.equal(q.grids[0].tiltAngle,15);assert.ok(length(sub(trajectory(q.chambers[0],q.grids[0],q.electrodes[0]).tip,q.targets[0].point))<1e-8)
assert.equal(segmentTriangleDistance([0,0,-1],[0,0,1],[-1,-1,0],[1,-1,0],[0,1,0]),0)
assert.ok(Math.abs(segmentTriangleDistance([0,0,2],[0,0,3],[-1,-1,0],[1,-1,0],[0,1,0])-2)<1e-12)
console.log(`Angled grids: ${safe.length} usable / ${blocked.length} blocked holes, true parallel axes, wedge entry heights, guide-tube fit, target depth, azimuth, composed poses, fixed-chamber angle search and apply passed.`)

// New-chamber placement honors the specified grid tilt rather than silently aiming the chamber axis.
{
 const q=structuredClone(p);q.chambers[0].placementState='unplaced';q.chambers[0].height=12;q.grids[0].seating='flush';q.chambers[0].pose={origin:[0,0,30],angles:[0,0,0]};q.planning={mode:'new',seed:null,searchStep:15,searchRadius:10,maxMiss:.01,margin:0};q.targets[0].point=[0,0,-10]
 const plane={pts:new Float32Array([-30,-30,0,30,-30,0,-30,30,0,30,30,0]),tris:new Uint32Array([0,1,2,1,3,2])}
 const options={surface:plane.pts,supportSurfaces:[plane],supportSource:'skull',supportAssetIds:['a'],expand:true}
 const result=searchTarget(q,e.id,'t',options);assert.ok(result.candidates.length,'A supported angled grid must remain usable during chamber placement')
 applyCandidate(q,e.id,'t',result.candidates[0],options)
 assert.ok(length(sub(trajectory(q.chambers[0],q.grids[0],q.electrodes[0]).tip,q.targets[0].point))<1e-8)
 const z=axes(q.chambers[0].pose)[2],direction=trajectory(q.chambers[0],q.grids[0],q.electrodes[0]).direction
 assert.ok(Math.abs(z.reduce((s,v,k)=>s-v*direction[k],0)-Math.cos(theta))<1e-8)
 console.log('New chamber search preserves independent grid angle, fits its rim, and reaches target along the actual angled channel.')
}

{
 const {chamberWall,insideWall}=await import('../wall-mesh.ts')
 assert.equal(insideWall([10.5,0,-10],chamberWall(c)),true);assert.equal(insideWall([0,0,-10],chamberWall(c)),false)
 const tilted={...g,tiltAngle:30},device={...e,depth:0,guideTube:{innerDiameter:.4,outerDiameter:.5,length:.2,tipDepth:20.5}}
 assert.ok(gridHoleClearance(c,tilted,device,[0,0],0)<0,'A tube lying wholly within wall material must be rejected')
 const short={...c,baseFit:{source:'skull',assetIds:['a'],gap:.5,innerDepths:Array(64).fill(5),outerDepths:Array(64).fill(5)}}
 assert.ok(gridHoleClearance(short,tilted,device,[0,0],0)>=0,'Actual fitted wall depths must allow a trajectory passing below the lower rim')
 console.log('Wall solid membership and fitted lower-rim exits reject embedded tubes without extending short walls into absent material.')
}
