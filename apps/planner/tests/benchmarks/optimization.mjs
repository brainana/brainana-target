import {SurfaceRayIndex} from '@brainana/planning-core/surface-rays.ts'
import {binarySTL,printableGrid} from '../../src/data/geometryExport.ts'
import {headpostGeometry} from '../../src/render/headpostGeometry.ts'
import {combine} from '../../src/render/primitives.ts'
import {createProject,addAssembly} from '@brainana/planning-core/model.ts'
const pts=[],tris=[]
for(let i=0;i<100000;i++){const j=pts.length/3;pts.push(i%200,Math.floor(i/200),0,i%200+1,Math.floor(i/200),0,i%200,Math.floor(i/200)+1,1);tris.push(j,j+1,j+2)}
const mesh={pts:new Float32Array(pts),tris:new Uint32Array(tris)}
const project=createProject({id:'a',name:'MRI',role:'anatomy',frameId:'f',sha256:'a'.repeat(64),sourcePath:null},'Benchmark',{kind:'standalone',subject:null,scan:null,sourceRoot:null});addAssembly(project,[1,2,3])
const chamber=project.chambers[0],grid=project.grids[0];chamber.innerRadius=7;Object.assign(grid,{tiltAngle:15,minimumThickness:2,holeDiameter:.7,count:11,spacing:1})
const post={id:'p',name:'Post',frameId:'f',pose:{origin:[1,2,3],angles:[12,23,34]},mesh}
const surfacePoints=[],surfaceIndices=[]
for(let y=0;y<=200;y++)for(let x=0;x<=250;x++)surfacePoints.push(x,y,Math.sin(x*.01)*Math.cos(y*.01))
for(let y=0;y<200;y++)for(let x=0;x<250;x++){const a=x+y*251;surfaceIndices.push(a,a+1,a+251,a+1,a+252,a+251)}
const indexSurface={pts:new Float32Array(surfacePoints),tris:new Uint32Array(surfaceIndices)}
const report={}
for(const [name,run] of [['binary_stl_100k_triangles',()=>binarySTL(mesh)],['transform_headpost_300k_vertices',()=>headpostGeometry(post)],['combine_1000_meshes',()=>combine(Array.from({length:1000},()=>({pts:mesh.pts.subarray(0,900),tris:mesh.tris.subarray(0,300)})))],['printable_grid_14mm_15deg',()=>printableGrid(chamber,grid)],['surface_index_100k_triangles',()=>new SurfaceRayIndex([indexSurface])]]){
 run();const times=[];let result
 for(let i=0;i<3;i++){const start=performance.now();result=run();times.push(performance.now()-start)}
 times.sort((a,b)=>a-b);report[name]={medianMs:Number(times[1].toFixed(2)),bytes:result.byteLength??(result.pts?result.pts.byteLength+result.tris.byteLength:undefined)}
}
console.log(JSON.stringify(report,null,2))
