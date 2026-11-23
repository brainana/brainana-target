import assert from 'node:assert/strict'
import {unzipSync,strFromU8} from 'fflate'
import {surfacePatch} from '../../../packages/planning-core/surface-patch.ts'
import {regionClearance} from '../../../packages/planning-core/optimization.ts'
import {avoidanceMask} from '../../../packages/planning-core/avoidance-mask.ts'
import {createProject,addAssembly} from '../../../packages/planning-core/model.ts'
import {binarySTL,printableGrid,geometryBundle} from '../src/data/geometryExport.ts'
import {raySurface} from '../src/render/surfacePicking.ts'
const surface={pts:[-10,-10,0,10,-10,0,10,10,0,-10,10,0],tris:[0,1,2,0,2,3]}
const patch=surfacePatch([surface],[[0,0,0]],2)
assert.ok(patch.tris.length>0);assert.ok(patch.pts.every((v,i)=>i%3!==2||v===0))
const region={id:'r',name:'Surface',frameId:'f',center:[0,0,0],radius:2,drawingMode:'surface',surfacePatch:patch}
assert.ok(Math.abs(regionClearance([0,0,5],[0,0,-5],0,region))<1e-8)
assert.ok(regionClearance([0,0,1],[0,0,1],0,region)>.99,'Surface radius must not dilate into anatomy')
assert.ok(regionClearance([4,0,1],[4,0,1],0,region)>2)
const plane={center:[0,0,1],right:[1,0,0],up:[0,1,0],widthMm:10,heightMm:10}
assert.ok(!avoidanceMask(plane,100,100,[region]).some(Boolean),'Parallel slices away from painted surface remain empty')
assert.ok(avoidanceMask({...plane,center:[0,0,0]},100,100,[region]).some(Boolean))
const p=createProject({id:'a',name:'mri.nii',role:'anatomy',frameId:'f',sha256:'a'.repeat(64),sourcePath:null},'Export',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(p,[0,0,0]);const c=p.chambers[0],g=p.grids[0]
c.innerRadius=2;c.wallThickness=1;c.height=4;Object.assign(g,{minimumThickness:1,holeDiameter:.8,spacing:1.3,count:3,tiltAngle:0})
const mesh=printableGrid(c,g)
assert.equal(raySurface(mesh,[0,0,5],[0,0,-1]),null,'Exported grid central guide bore must be physically open')
assert.ok(raySurface(mesh,[.6,.6,5],[0,0,-1]),'Solid plate remains between channels')
const stl=binarySTL(mesh);assert.equal(new DataView(stl.buffer).getUint32(80,true),mesh.tris.length/3);assert.equal(stl.length,84+mesh.tris.length/3*50)
const zip=unzipSync(geometryBundle(p,[surface]));assert.ok(zip['coordinates.csv']);assert.ok(zip['dimensions-and-coordinates.json']);assert.ok(zip['planning-surface-1.stl']);assert.ok(Object.keys(zip).some(k=>k.startsWith('chamber-')));assert.ok(Object.keys(zip).some(k=>k.startsWith('grid-')));assert.equal(JSON.parse(strFromU8(zip['dimensions-and-coordinates.json'])).grids[0].holeDiameter,.8)
console.log('Surface paint stays on mesh and agrees with slice masks/clearance; exported grid bores are open, binary STL dimensions are valid, and ZIP includes geometry metadata and planning mesh.')
