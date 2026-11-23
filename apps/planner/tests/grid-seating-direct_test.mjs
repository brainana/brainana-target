import {packProject,unpackProject} from '../src/data/archive.ts'
import assert from 'node:assert/strict'
import {createProject,addAssembly} from '@brainana/planning-core/model.ts'
import {gridSeatHeight,gridFitsChamber,worldToLocal,trajectory,sub,length} from '@brainana/planning-core/geometry.ts'
import {addDirectElectrode,electrodeAssembly} from '@brainana/planning-core/electrode-frame.ts'
import {searchDirect,applyDirect} from '@brainana/planning-core/direct-placement.ts'
import {gridCompatibility} from '@brainana/planning-core/hardware.ts'
import {connectorPreset,connectorAvoidance} from '@brainana/planning-core/connectors.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
import {gridWedge} from '../src/render/gridGeometry.ts'
import {connectorGeometry} from '../src/render/connectorGeometry.ts'
import {hardwareCatalog,applyHardwarePreset} from '../src/hardware/catalog.ts'
import {coordinateRows,planReport} from '../src/data/export.ts'
import {geometryBundle} from '../src/data/geometryExport.ts'
import {SceneParts} from '../src/render/sceneParts.ts'
import {defaultSceneColors} from '../src/render/colors.ts'
import {unzipSync} from 'fflate'
const make=()=>createProject({id:'a',name:'MRI',role:'anatomy',modality:'mri',frameId:'f',sha256:'a'.repeat(64),sourcePath:null},'Grid and direct',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
const p=make();addAssembly(p,[11,-5,20]);const c=p.chambers[0],g=p.grids[0];Object.assign(c,{innerRadius:5,wallThickness:2,height:8});c.pose.angles=[70,15,-30];Object.assign(g,{minimumThickness:2,tiltAngle:30,tiltAzimuth:40,enabled:true})
for(const angle of [0,30,0,30]){
 g.tiltAngle=angle;const mesh=gridWedge(c,g),z=[]
 for(let i=0;i<mesh.pts.length;i+=3)z.push(worldToLocal(c.pose,Array.from(mesh.pts.slice(i,i+3)))[2])
 assert.ok(Math.max(...z)<1e-5);assert.ok(Math.min(...z)>=-8-1e-5);assert.equal(gridFitsChamber(c,g),true)
 assert.ok(Math.abs(gridSeatHeight(c,g)+(2+10*Math.tan(angle*Math.PI/180)))<1e-10)
}
g.tiltAngle=40;assert.equal(gridFitsChamber(c,g),false,'A physically too-tall grid must be reported, not hidden')
Object.assign(g,{seating:'manual',seatHeight:0,tiltAngle:0});assert.equal(gridSeatHeight(c,g),0);assert.equal(gridFitsChamber(c,g),false,'Above-lip illustration requires explicit custom seating')
console.log('Exact 10 mm bore / 2 mm wall / 8 mm chamber: flush seating at 0°, 30°, back to 0°, arbitrary chamber orientation and impossible-thickness checks passed.')
const direct=make();direct.planningIntent='direct';const e=addDirectElectrode(direct);applyHardwarePreset(e,hardwareCatalog.find(x=>x.id==='micro-fma'));e.length=3;e.depth=0;e.hardware.shankLengths=[];e.targetId='t';direct.targets=[{id:'t',name:'Target',frameId:'f',point:[0,0,-8],color:'#ffffff',atlas:null}];direct.planning={mode:'new',seed:null,searchRadius:10,searchStep:2,maxMiss:.5,margin:0}
assert.equal(gridCompatibility(e).available,false);assert.equal(direct.chambers.length,0);assert.equal(direct.grids.length,0);validateProject(direct)
const options={surface:new Float32Array([0,0,0,10,0,0,0,10,0]),accessPoint:[0,0,0]}
const found=searchDirect(direct,e.id,'t',options);assert.equal(found.candidates.length,1);assert.equal(found.candidates[0].depth,3)
const before=structuredClone(direct);applyDirect(direct,e.id,'t',found.candidates[0],options);validateProject(direct)
const assembly=electrodeAssembly(direct,e),path=trajectory(assembly.chamber,assembly.grid,e);assert.ok(length(sub(path.tip,[0,0,-8]))<1e-8);assert.ok(path.entry[2]<-4,'Floating array base is inside skull; flexible cable does not become an eight-mm needle')
assert.deepEqual(e.direct.preferredEntry,[0,0,0]);assert.equal(direct.chambers.length,0)
const altered=structuredClone(before);altered.targets[0].point=[1,0,-8];assert.throws(()=>applyDirect(altered,e.id,'t',found.candidates[0],options),/Recompute/)
const blocked=structuredClone(before);blocked.avoidRegions=[{id:'x',name:'Block',center:[0,0,-4],radius:2,frameId:'f',constraint:'hard'}];assert.equal(searchDirect(blocked,e.id,'t',options).candidates.length,0);blocked.avoidRegions[0].constraint='soft';assert.ok(searchDirect(blocked,e.id,'t',options).candidates[0].softViolations.length);blocked.avoidRegions[0].constraint='ignore';assert.equal(searchDirect(blocked,e.id,'t',options).candidates[0].softViolations.length,0)
for(const family of ['micro-fma','utah']){const device=structuredClone(e);applyHardwarePreset(device,hardwareCatalog.find(x=>x.id===family));assert.equal(gridCompatibility(device).available,false)}
e.connector=connectorPreset('cereport-128',[30,0,0]);assert.deepEqual([e.connector.width,e.connector.height,e.connector.neckDiameter],[19,16.5,12]);e.connector.unplaced=false;assert.equal(connectorAvoidance(direct).length,1)
const mesh=connectorGeometry(e.connector);assert.equal(Math.max(...Array.from(mesh.pts).filter((_,i)=>i%3===2)),16.5)
const oldConnector=structuredClone(e.connector);e.direct.pose.origin[0]+=1;assert.deepEqual(e.connector,oldConnector,'Connector is not rigidly attached to array')
const rows=coordinateRows(direct);assert.ok(rows.some(r=>r[0]==='connector_base'));assert.ok(rows.some(r=>r[0]==='skull_entry'));assert.ok(planReport(direct,null).includes('Target'))
const files=unzipSync(geometryBundle(direct,[]));assert.ok(files[`connector-${e.id}.stl`]);assert.equal(Object.keys(files).some(k=>k.startsWith('chamber-')),false)
console.log('Direct FMA targeting, selected-shank offsets, short floating-array reference, stale apply rejection, Hard/Soft/Ignore constraints, compatibility, independent published connector envelope and export passed.')

const context={colors:defaultSceneColors,enhanceElectrodes:false,center:[0,0,0],surfaces:[],placementPoint:null,placementParts:[]},parts=new SceneParts().build(direct,e.id,context)
assert.ok(parts.some(p=>p.name===e.name));assert.ok(parts.some(p=>p.name.includes('skull connector')));assert.equal(parts.some(p=>p.layer==='chambers'||p.layer==='grids'),false)
console.log('Direct array and connector render without any chamber or guide-grid parts.')

const payload=new Uint8Array([1,2,3]);direct.assets[0].sha256=Buffer.from(await crypto.subtle.digest('SHA-256',payload)).toString('hex')
const archive=await packProject(direct,new Map([['a',payload]])),reopened=await unpackProject(archive)
assert.equal(reopened.project.schemaVersion,2);assert.equal(reopened.project.planningIntent,'direct');assert.deepEqual(reopened.project.electrodes,JSON.parse(JSON.stringify(direct.electrodes)));assert.equal(reopened.project.chambers.length,0)
console.log('Portable save/reopen preserves direct entry, independent connector dimensions/coordinates and no-chamber task.')
