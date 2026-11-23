import {SurfaceRayIndex} from '../../../packages/planning-core/surface-rays.ts'
import {surfaceContours} from '../src/render/surfaceContours.ts'
import assert from 'node:assert/strict'
import {mriSurface} from '../src/render/mriSurface.ts'
import {darkBandCutoff} from '../src/render/mriDarkBand.ts'
const radius=p=>Math.hypot(...p)
const brain={sample:p=>Number(radius(p)<=10)}
const image={sample:p=>{const r=radius(p);return r<=10?100:r<12?5:r<14?180:0}}
const settings={sourceAssetId:'MRI',method:'dark-band',offsetMm:0,threshold:.5,spacingMm:1,largest:true,fillHoles:true,smooth:false,bounds:[[-20,-20,-20],[20,20,20]],darkBand:{maximumIntensity:30,searchMm:10,minimumWidthMm:.5,maximumWidthMm:5,minimumScalpMm:1}}
const mesh=mriSurface(image,settings,brain)
assert.ok(mesh.report.darkBand.supported/mesh.report.darkBand.directions>.98)
const contours=surfaceContours(mesh,2,0);assert.ok(contours.length>0);for(let i=0;i<contours.length;i+=3)assert.ok(Math.abs(Math.hypot(contours[i],contours[i+1])-12)<.5,'Slice contours show the one scalp-side boundary, not additional skin/brain shells')
const radii=[];for(let i=0;i<mesh.pts.length;i+=3)radii.push(Math.hypot(mesh.pts[i],mesh.pts[i+1],mesh.pts[i+2]))
assert.ok(radii.every(r=>Math.abs(r-12)<.5),'Single boundary is beneath scalp, not brain at 10 mm or outer skin at 14 mm')
// All triangles face outward and belong to one continuous shell.
const adjacency=new Map();for(let i=0;i<mesh.tris.length;i+=3){const ids=Array.from(mesh.tris.subarray(i,i+3)),v=ids.map(id=>Array.from(mesh.pts.subarray(id*3,id*3+3))),a=v[1].map((x,k)=>x-v[0][k]),b=v[2].map((x,k)=>x-v[0][k]),normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];assert.ok(normal.reduce((s,n,k)=>s+n*v[0][k],0)>0);for(const id of ids){if(!adjacency.has(id))adjacency.set(id,new Set());for(const other of ids)adjacency.get(id).add(other)}}
const seen=new Set([mesh.tris[0]]),queue=[mesh.tris[0]];while(queue.length)for(const next of adjacency.get(queue.pop()))if(!seen.has(next)){seen.add(next);queue.push(next)}assert.equal(seen.size,mesh.pts.length/3)
const inward=mriSurface(image,{...settings,offsetMm:1},brain)
for(let i=0;i<inward.pts.length;i+=3)assert.ok(Math.abs(Math.hypot(...inward.pts.subarray(i,i+3))-11)<.5)
assert.throws(()=>mriSurface(image,{...settings,offsetMm:4},brain),/No reliable dark band/)
assert.throws(()=>mriSurface(image,settings),/brain-only mask/)
assert.throws(()=>mriSurface(image,settings,{sample:()=>0}),/No brain mask/)
assert.throws(()=>mriSurface(image,{...settings,darkBand:{...settings.darkBand,maximumIntensity:200}},brain),/No reliable dark band/)
assert.throws(()=>mriSurface(image,{...settings,darkBand:{...settings.darkBand,maximumWidthMm:.5}},brain),/No reliable dark band/)
const missing={sample:p=>radius(p)>10&&p[0]>4?0:image.sample(p)},partial=mriSurface(missing,settings,brain)
assert.ok(partial.report.darkBand.missingBand>0);assert.equal(new SurfaceRayIndex([{...partial,outerEnvelope:true}]).distance([20,0,0],[-1,0,0],100,true),Infinity,'A missing near-side boundary must not use the opposite skull wall as support');for(let i=0;i<partial.pts.length;i+=3)assert.ok(partial.pts[i]<=4.5,'Missing scalp sectors stay open')
const double={sample:p=>{const r=radius(p);return r<=10?100:r<11?5:r<12.5?130:r<14?5:r<16?180:0}}
assert.throws(()=>mriSurface(double,settings,brain),/No reliable dark band/,'Ambiguous multiple bright layers are not silently chosen')
const resolved=mriSurface(double,{...settings,darkBand:{...settings.darkBand,maximumIntensity:150}},brain)
for(let i=0;i<resolved.pts.length;i+=3)assert.ok(Math.abs(Math.hypot(...resolved.pts.subarray(i,i+3))-14)<.5,'Cutoff resolves the outer dark band')
const clipped=mriSurface(image,{...settings,bounds:[[-20,-20,-20],[11,20,20]]},brain);assert.ok(clipped.report.darkBand.cropped>0)
for(let i=0;i<clipped.pts.length;i+=3)assert.ok(clipped.pts[i]<11,'No artificial face at crop boundary')
const stroke={mode:'erase',normal:2,thicknessMm:2,radius:3,points:[[12,0,0]]},erased=mriSurface(image,{...settings,edits:[stroke]},brain)
assert.ok(erased.tris.length<mesh.tris.length)
const restored=mriSurface(image,{...settings,edits:[stroke,{...stroke,mode:'restore'}]},brain);assert.deepEqual(restored.pts,mesh.pts);assert.deepEqual(restored.tris,mesh.tris)
const preserved=mriSurface(missing,{...settings,edits:[{...stroke,mode:'restore'}]},brain);assert.deepEqual(preserved.tris,partial.tris,'Restore cannot invent missing evidence')
assert.equal(darkBandCutoff(image,brain,settings.bounds,.5),35)
console.log('MRI dark band: one scalp-side shell, outward normals, bounded inset, brain-mask requirement, cutoff/width controls, ambiguous/missing/cropped sectors, physical brush erase/restore and robust default cutoff passed.')
// Save/reopen keeps the exact controls and source-mask link; invalid recipes are rejected.
const {createProject}=await import('../../../packages/planning-core/model.ts'),{validateProject}=await import('../../../packages/planning-core/validation.ts'),{createAsset}=await import('../src/data/assets.ts'),{packProject,unpackProject}=await import('../src/data/archive.ts')
const a=await createAsset('MRI.nii','anatomy','f',new Uint8Array([1])),b=await createAsset('brain.nii','mask','f',new Uint8Array([2])),s=await createAsset('MRI-dark-band-boundary.stl','surface','f',new Uint8Array([3]));s.surfaceKind='skull';s.mriSurface={...settings,sourceAssetId:a.id,maskAssetId:b.id,darkBand:{...settings.darkBand,center:[0,0,0]}}
const p=createProject(a,'Dark band',{kind:'standalone',subject:null,scan:null,sourceRoot:null});p.assets.push(b,s);p.planningSurfaceIds=[s.id]
const reopened=await unpackProject(await packProject(p,new Map([[a.id,new Uint8Array([1])],[b.id,new Uint8Array([2])],[s.id,new Uint8Array([3])]])));assert.deepEqual(reopened.project,p)
const invalid=structuredClone(p);delete invalid.assets[2].mriSurface.darkBand;assert.throws(()=>validateProject(invalid),/missing dark-band settings/)
const wrong=structuredClone(p);wrong.assets[2].mriSurface.darkBand.maximumWidthMm=.1;assert.throws(()=>validateProject(wrong),/number outside supported range/)
assert.throws(()=>mriSurface(image,{...settings,darkBand:{...settings.darkBand,center:[12,0,0]}},brain),/head centre/)
console.log('Dark-band recipe and brain mask round-trip with checksum verification; missing/invalid settings and an out-of-brain manual centre are rejected.')
