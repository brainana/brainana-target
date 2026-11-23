import assert from 'node:assert/strict'
import {mriSurface} from '../src/render/mriSurface.ts'
import {estimateBrainRegion} from '../src/render/mriBrainRegion.ts'
import {surfaceContours} from '../src/render/surfaceContours.ts'
import {createProject} from '@brainana/planning-core/model.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
import {createAsset} from '../src/data/assets.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
const image={sample:p=>{const r=Math.hypot(...p);return r<=10?100:r<12?5:r<14?180:0}}
const settings={sourceAssetId:'mri',method:'dark-band-head',offsetMm:0,threshold:50,spacingMm:1,largest:true,fillHoles:true,smooth:false,bounds:[[-20,-20,-20],[20,20,20]],darkBand:{maximumIntensity:30,searchMm:10,minimumWidthMm:.5,maximumWidthMm:5,minimumScalpMm:1}}
const assertRadius=(mesh,r)=>{assert.ok(mesh.tris.length);for(let i=0;i<mesh.pts.length;i+=3)assert.ok(Math.abs(Math.hypot(...mesh.pts.subarray(i,i+3))-r)<.6)}
const mesh=mriSurface(image,settings);assertRadius(mesh,12)
for(const axis of [0,1,2]){const c=surfaceContours(mesh,axis,0);assert.ok(c.length);for(let i=0;i<c.length;i+=3)assert.ok(Math.abs(Math.hypot(c[i],c[i+1],c[i+2])-12)<.6,'Exactly the inner scalp edge; no outer-skin or brain outlines')}
assertRadius(mriSurface(image,{...settings,offsetMm:1}),11)
assert.throws(()=>mriSurface(image,{...settings,threshold:20}),/cutoff above/)
assert.throws(()=>mriSurface(image,{...settings,darkBand:{...settings.darkBand,maximumWidthMm:1}}),/No reliable/)
const missing={sample:p=>p[0]>4&&Math.hypot(...p)>10?0:image.sample(p)}
const partial=mriSurface(missing,settings);assert.ok(partial.report.darkBand.missingBand>0)
for(let i=0;i<partial.pts.length;i+=3)assert.ok(partial.pts[i]<5,'Missing scalp evidence stays open')
const cropped=mriSurface(image,{...settings,bounds:[[-20,-20,-20],[11,20,20]]});assert.ok(cropped.report.darkBand.cropped>0);for(let i=0;i<cropped.pts.length;i+=3)assert.ok(cropped.pts[i]<11)
const correction={mode:'erase',normal:2,thicknessMm:2,radius:3,points:[[12,0,0]]}
const erased=mriSurface(image,{...settings,edits:[correction]});assert.ok(erased.tris.length<mesh.tris.length)
assert.deepEqual(mriSurface(image,{...settings,edits:[correction,{...correction,mode:'restore'}]}).tris,mesh.tris)
const seeded={...settings,method:'dark-band',threshold:.5,brainEstimate:{threshold:50,seed:[0,0,0]}}
const region=estimateBrainRegion(image,seeded);assert.equal(region.sample([0,0,0]),1);assert.equal(region.sample([13,0,0]),0,'Disconnected scalp must not enter the brain region')
assert.equal(estimateBrainRegion(image,seeded),region,'Unchanged brain region is cached across surface adjustments')
assert.notEqual(estimateBrainRegion(image,{...seeded,brainEstimate:{threshold:60,seed:[0,0,0]}}),region,'Cutoff changes invalidate the region')
assert.throws(()=>estimateBrainRegion(image,{...seeded,brainEstimate:{threshold:110,seed:[0,0,0]}}),/below the tissue cutoff/)
assertRadius(mriSurface(image,seeded),12)
const mri=await createAsset('MRI.nii','anatomy','f',new Uint8Array([1])),surface=await createAsset('MRI-boundary.stl','surface','f',new Uint8Array([2]));surface.surfaceKind='skull'
const project=createProject(mri,'MRI direct',{kind:'standalone',subject:null,scan:null,sourceRoot:null});project.assets.push(surface)
for(const recipe of [settings,seeded]){surface.mriSurface={...recipe,sourceAssetId:mri.id};validateProject(project);const reopened=await unpackProject(await packProject(project,new Map([[mri.id,new Uint8Array([1])],[surface.id,new Uint8Array([2])]])));assert.deepEqual(reopened.project,project,'Both no-file workflows persist all settings without a mask asset')}
console.log('MRI without supplied masks: single subscalp contour, inset, cutoff/width controls, missing/cropped sectors, brush history, connected brain-region estimation/cache, and save/reopen passed.')
