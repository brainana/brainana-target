import assert from 'node:assert/strict'
import { placementMap, nearestPlacement } from '../src/render/placementMap.ts'
import { raySurface } from '../src/render/surfacePicking.ts'
const surface={pts:new Float32Array([0,0,0, 1,0,0, 0,1,0, 10,0,0, 11,0,0, 10,1,0, 30,0,0, 31,0,0, 30,1,0]),tris:new Uint32Array([0,1,2,3,4,5,6,7,8])}
const sample=(point,soft=false)=>({surfaceCenter:point,pose:{origin:[point[0],point[1],10],rotation:[0,0,0]},softViolations:soft?[{id:'soft',name:'Preference',clearance:0}]:undefined})
const a=sample([.3,.3,0]),b=sample([10.3,.3,0],true)
const original=Array.from(surface.pts)
const map=placementMap([surface],[a,b],2)
assert.equal(map[0].soft,false);assert.equal(map[1].soft,true)
assert.equal(map[0].geometry.tris.length,6)
assert.equal(map[1].geometry.tris.length,6)
assert.ok(Array.from(map[0].geometry.pts).filter((_,i)=>i%3===2).every(v=>v>0&&v<.16))
assert.deepEqual(Array.from(surface.pts),original)
assert.equal(nearestPlacement([a,b],[10,.2,0],2),b)
assert.equal(nearestPlacement([a,b],[30,.2,0],2),undefined)
assert.equal(placementMap([surface],[],2).reduce((n,g)=>n+g.geometry.tris.length,0),0)
assert.deepEqual(raySurface(surface,[.2,.2,20],[0,0,-1]).map(v=>Math.round(v*100)/100),[.2,.2,0])
// Empty areas and coarse triangles spanning unsampled territory are not painted.
const broad={pts:new Float32Array([0,0,0,10,0,0,0,10,0]),tris:new Uint32Array([0,1,2])}
assert.equal(placementMap([broad],[a],2)[0].geometry.tris.length,0)
console.log('Sampled surface map separates soft conflicts, preserves skull geometry, excludes uncovered triangles, and selects only nearby validated placements.')

const {frameBounds,panCamera}=await import('../src/render/camera.ts')
const camera={pivot3D:[99,99,99],furthestFromPivot:1000,position:[0,0,0],scene:{volScaleMultiplier:1}}
frameBounds(camera,[[-30,-40,-20],[30,40,20]])
assert.deepEqual(camera.pivot3D,[0,0,0]);assert.ok(camera.furthestFromPivot<60)
const before=camera.furthestFromPivot
// Hardware framing cannot affect the anatomy frame when its bounds stay unchanged.
camera.furthestFromPivot=999;frameBounds(camera,[[-30,-40,-20],[30,40,20]]);assert.equal(camera.furthestFromPivot,before)
const right=panCamera(camera,1,0);assert.ok(right[0]<0);assert.equal(right[1],0)
camera.position=right;assert.deepEqual(panCamera(camera,-1,0),[0,0,0])
const up=panCamera(camera,0,1);assert.ok(up[1]>0)
camera.scene.volScaleMultiplier=2;assert.equal(panCamera(camera,0,1)[1],up[1]/2)
console.log('Anatomy framing excludes extended hardware; screen-relative arrows pan reversibly and account for zoom.')

const {keyboardPan}=await import('../src/ui/keyboardPan.ts')
assert.deepEqual(keyboardPan({key:'ArrowLeft'},true,false),[-1,0])
assert.deepEqual(keyboardPan({key:'ArrowUp',shiftKey:true},true,false),[0,3])
for(const event of [{key:'ArrowRight',metaKey:true},{key:'ArrowDown',ctrlKey:true},{key:'a'}])assert.equal(keyboardPan(event,true,false),null)
assert.equal(keyboardPan({key:'ArrowRight'},true,true),null)
assert.equal(keyboardPan({key:'ArrowRight'},false,false),null)
const {fillOutline}=await import('../src/render/filledOutline.ts')
const {regionClearance}=await import('@brainana/planning-core/optimization.ts')
const {avoidanceMask}=await import('@brainana/planning-core/avoidance-mask.ts')
const boundary=[[-4,-4,0],[4,-4,0],[4,4,0],[-4,4,0],[-4,-4,0]]
const stamps=fillOutline(boundary,.4),region={id:'fill',name:'Filled outline',frameId:'f',center:boundary[0],points:boundary,stamps,radius:.4}
assert.ok(stamps.length>100)
assert.ok(regionClearance([0,0,0],[0,0,0],0,region)<0,'Outline interior must be included in targeting exclusions')
assert.ok(regionClearance([0,0,2],[0,0,2],0,region)>0,'Fill does not exclude an unbounded slice slab')
const plane={center:[0,0,0],right:[1,0,0],up:[0,1,0],widthMm:10,heightMm:10}
const mask=avoidanceMask(plane,100,100,[region]);assert.equal(mask[50+50*100],1)
const concave=[[-4,-4,0],[4,-4,0],[4,0,0],[0,0,0],[0,4,0],[-4,4,0],[-4,-4,0]],c={...region,points:concave,stamps:fillOutline(concave,.4)}
assert.ok(regionClearance([2,2,0],[2,2,0],0,c)>0,'Independent stamps cannot connect across a concave cutout')
const openingSample={...a,openingOverlap:true}
const openingMap=placementMap([surface],[openingSample],2)
assert.equal(openingMap[2].opening,true);assert.equal(openingMap[2].geometry.tris.length,6)
assert.equal(openingMap[0].geometry.tris.length,0)
console.log('Keyboard panning respects editing/modifiers; filled outlines exclude their interiors, preserve concavities, and agree with slice masks; opening-nearby map category is distinct.')
const {snapAvoidance}=await import('../src/render/snapAvoidance.ts')
const patch={pts:new Float32Array([-10,-10,0,10,-10,0,-10,10,0,10,10,0]),tris:new Uint32Array([0,1,2,1,3,2])}
const projected=snapAvoidance([[-4,0,.5],[4,0,.5]],[],1,[patch],[0,0,1])
assert.ok(projected.length>8);assert.ok(projected.every(p=>Math.abs(p[2])<1e-8))
assert.throws(()=>snapAvoidance([[0,0,10]],[],1,[patch],[0,0,1]),/No planning surface/)
const lateral={pts:Float32Array.from(patch.pts,(v,i)=>i%3===0?patch.pts[i+2]:i%3===2?patch.pts[i-2]:v),tris:patch.tris}
assert.ok(snapAvoidance([[.5,0,-4],[.5,0,4]],[],1,[lateral],[1,0,0]).every(p=>Math.abs(p[0])<1e-8))
console.log('Surface snapping follows the actual triangle surface in axial/lateral slices, densifies stamps, and rejects remote opposite walls.')
