import assert from 'node:assert/strict'
import {SurfaceRayIndex} from '../surface-rays.ts'
import {sphere} from '../../../apps/planner/src/render/primitives.ts'
import {raySurface} from '../../../apps/planner/src/render/surfacePicking.ts'
const mesh=sphere([1,2,3],10,48,24),index=new SurfaceRayIndex([mesh])
let seed=123456
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
for(let i=0;i<300;i++){
 const origin=Array.from({length:3},()=>random()*60-30),vector=Array.from({length:3},(_,k)=>[1,2,3][k]-origin[k]+(random()-.5)*20),size=Math.hypot(...vector),direction=vector.map(v=>v/size)
 const hit=raySurface(mesh,origin,direction),expected=hit?Math.hypot(...hit.map((v,k)=>v-origin[k])):Infinity,actual=index.distance(origin,direction)
 if(Number.isFinite(expected)){assert.ok(Math.abs(actual-expected)<.0001,`${actual} != ${expected}`);assert.equal(index.distance(origin,direction,Math.max(0,expected-.01)),Infinity)}else assert.equal(actual,Infinity)
 const projection=index.maximumProjection(origin,direction)
 let maximum=-Infinity;for(let j=0;j<mesh.pts.length;j+=3)maximum=Math.max(maximum,(mesh.pts[j]-origin[0])*direction[0]+(mesh.pts[j+1]-origin[1])*direction[1]+(mesh.pts[j+2]-origin[2])*direction[2])
 assert.ok(Math.abs(projection-maximum)<1e-8)
}
const plane={pts:[0,0,0,10,0,0,0,10,0],tris:[0,1,2],outerEnvelope:true},sided=new SurfaceRayIndex([plane])
assert.equal(sided.distance([1,1,10],[0,0,-1],Infinity,true),10)
assert.equal(sided.distance([1,1,-10],[0,0,1],Infinity,true),Infinity)
assert.equal(sided.distance([1,1,-10],[0,0,1]),10)
assert.equal(new SurfaceRayIndex([]).distance([0,0,0],[0,0,1]),Infinity)
const duplicates={pts:[0,0,0,1,0,0,0,1,0],tris:Array.from({length:1000},()=>[0,1,2]).flat()}
assert.equal(new SurfaceRayIndex([duplicates]).distance([.1,.1,1],[0,0,-1]),1,'Equal centroids must still partition and terminate')
console.log('Partitioned surface index agrees with 300 brute-force rays and vertex projections; limits, one-sided mounting, empty meshes and duplicate centroids passed.')
