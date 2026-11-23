import assert from 'node:assert/strict'
import {createProject,addAssembly} from '../../../packages/planning-core/model.ts'
import {ProjectStore} from '../src/state/store.ts'
import {avoidanceKey} from '../src/render/avoidanceKey.ts'
import {windowPlacement} from '../src/ui/windowPlacement.ts'
const source=createProject({id:'a',name:'MRI',role:'anatomy',frameId:'f',sha256:'a'.repeat(64),sourcePath:null},'Performance',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(source,[0,0,30]);const pts=[],tris=[]
for(let i=0;i<100000;i++){pts.push(i%100,Math.floor(i/100),0);if(i<99998)tris.push(i,i+1,i+2)}
source.avoidRegions=[{id:'r',name:'Large surface patch',frameId:'f',center:[0,0,0],radius:5,drawingMode:'surface',surfacePatch:{pts,tris},points:[[0,0,0]],stamps:[[0,0,0]]}]
const store=new ProjectStore();store.replace(source);const before=store.project,patch=before.avoidRegions[0].surfacePatch,key=avoidanceKey(before.avoidRegions)
const began=performance.now();for(let i=0;i<20;i++)store.edit(d=>{d.name=`Display edit ${i}`},'display')
const elapsed=performance.now()-began,after=store.project
assert.equal(after.avoidRegions[0].surfacePatch,patch,'Display edits reuse polygon geometry')
assert.equal(avoidanceKey(after.avoidRegions),key,'Display edits do not rebuild avoidance geometry/masks')
assert.throws(()=>{after.avoidRegions[0].surfacePatch.pts[0]=100},TypeError,'Snapshots cannot mutate shared geometry')
after.chambers[0].height=99;assert.notEqual(store.project.chambers[0].height,99,'Metadata remains isolated')
const external=source.avoidRegions[0].surfacePatch.pts[0];source.avoidRegions[0].surfacePatch.pts[0]=999;assert.equal(store.project.avoidRegions[0].surfacePatch.pts[0],external,'Incoming mesh is copied once')
store.edit(d=>{d.avoidRegions[0].surfacePatch={pts:[0,0,0,1,0,0,0,1,0],tris:[0,1,2]}});assert.notEqual(avoidanceKey(store.project.avoidRegions),key);store.undo();assert.equal(store.project.avoidRegions[0].surfacePatch,patch)
for(const [width,height] of [[1600,1000],[1024,768],[800,600]]){
 const avoid={left:width*.55,top:100,width:width*.45,height:height-120},rect=windowPlacement({width,height},{width:320,height:400},avoid)
 assert.ok(rect.left>=8&&rect.top>=8&&rect.left+rect.width<=width-8&&rect.top+rect.height<=height-8)
 assert.ok(rect.left+rect.width<=avoid.left,'Fits to the left of controlled 3D pane')
}
console.log(`Review performance: 100k-vertex mesh reused across 20 edits in ${elapsed.toFixed(1)} ms; cache identity, immutable snapshots, undo and popup avoidance geometry passed.`)
