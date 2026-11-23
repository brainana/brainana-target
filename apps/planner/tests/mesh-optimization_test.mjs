import assert from 'node:assert/strict'
import {localToWorld,add,sub,scale,normalize} from '@brainana/planning-core/geometry.ts'
import {transformVertices} from '../src/render/meshTransform.ts'
import {combine} from '../src/render/primitives.ts'
import {binarySTL,printableGrid} from '../src/data/geometryExport.ts'
import {gridChannel} from '../src/render/gridGeometry.ts'
import {raySurface} from '../src/render/surfacePicking.ts'
import {bytesView} from '../src/data/buffers.ts'
import {hashBytes} from '../src/data/assets.ts'
const points=new Float32Array([1,2,3,-7.5,8.25,-9,0,0,0,17,-22,31])
for(const angles of [[0,0,0],[12,23,34],[90,-90,180],[-45,30,123]]){
 const pose={origin:[12,-3.5,7],angles},transformed=transformVertices(points,pose)
 const expected=new Float32Array(Array.from({length:points.length/3},(_,i)=>localToWorld(pose,Array.from(points.subarray(i*3,i*3+3)))).flat())
 assert.deepEqual(transformed,expected)
}
const triangle={pts:new Float32Array([0,0,0,1,0,0,0,1,0]),tris:new Uint32Array([0,1,2])}
const combined=combine([triangle,triangle]);assert.deepEqual(combined.tris,new Uint32Array([0,1,2,3,4,5]));assert.deepEqual(combined.pts,new Float32Array([...triangle.pts,...triangle.pts]))
const encoded=binarySTL(triangle),record=new DataView(encoded.buffer);assert.equal(record.getUint32(80,true),1)
assert.deepEqual(Array.from({length:12},(_,i)=>record.getFloat32(84+i*4,true)),[0,0,1,0,0,0,1,0,0,0,1,0]);assert.equal(record.getUint16(132,true),0)
const chamber={id:'c',name:'Chamber',frameId:'f',pose:{origin:[5,-4,7],angles:[12,23,34]},innerRadius:3,wallThickness:1,height:5}
for(const tilt of [0,15,30])for(const azimuth of [0,90,215]){
 const grid={id:'g',chamberId:'c',name:'Grid',spacing:1.3,count:3,rotation:27,minimumThickness:1,holeDiameter:.8,tiltAngle:tilt,tiltAzimuth:azimuth}
 const mesh=printableGrid(chamber,grid),[start,end]=gridChannel(chamber,grid,[0,0]),direction=normalize(sub(end,start)),origin=add(start,scale(direction,-10))
 assert.equal(raySurface(mesh,origin,direction),null,`Central bore remains open through tilt ${tilt} / direction ${azimuth}`)
}
const buffer=new Uint8Array([9,1,2,3,8]),subset=buffer.subarray(1,4),view=bytesView(subset)
assert.equal(view.buffer,buffer.buffer);assert.equal(view.byteLength,3);assert.equal(await hashBytes(subset),await hashBytes(new Uint8Array([1,2,3])))
const file=new File([view],'subset.bin');buffer[1]=99;assert.deepEqual(new Uint8Array(await file.arrayBuffer()),new Uint8Array([1,2,3]),'Browser file owns its snapshot without a redundant preparatory copy')
if(typeof SharedArrayBuffer!=='undefined'){const shared=new Uint8Array(new SharedArrayBuffer(3));shared.set([1,2,3]);const copy=bytesView(shared);assert.ok(copy.buffer instanceof ArrayBuffer);assert.notEqual(copy.buffer,shared.buffer);assert.deepEqual(copy,new Uint8Array([1,2,3]))}
console.log('Optimized mesh loops preserve transform coordinates, combined indices, STL records, tilted grid bores, subarray hashing, File snapshots and shared-buffer fallback.')
