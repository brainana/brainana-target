import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { NVImage } from '@niivue/niivue'
import { VolumeSampler } from '../src/render/volume.ts'
import { imageBounds, skullPreview } from '../src/render/ctSkull.ts'
import { ctDefaults } from '../src/render/ctDefaults.ts'
import { ctCropFeedback } from '../src/ui/ctCropFeedback.ts'

const root='datasets/demo_viewer/nmt2sym/'
const image=await NVImage.loadFromUrl({url:new Uint8Array(await fs.readFile(root+'tpl-NMT2Sym_res-05_desc-MEBRAINS_CT.nii.gz')),name:'demo-ct.nii.gz'})
const mri=await NVImage.loadFromUrl({url:new Uint8Array(await fs.readFile(root+'tpl-NMT2Sym_res-05_T1w.nii.gz')),name:'demo-mri.nii.gz'})
const volume=new VolumeSampler(image),full=imageBounds(volume,true),old=imageBounds(new VolumeSampler(mri),true),threshold=ctDefaults(image).min
const options={spacingMm:.5,components:'largest',representation:'smooth',smoothing:{iterations:30,maximumDisplacementMm:.5}}
const cropped=skullPreview(volume,threshold,old,options)
assert.ok(cropped.report.boundaryFaces[5]>0,'The old MRI field of view cuts through real CT bone at the crown')
const expanded=skullPreview(volume,threshold,full,options)
assert.equal(expanded.report.boundaryVoxels,0,'The expanded CT retains the skull without source-image cuts')
assert.deepEqual(expanded.report.boundaryFaces,[0,0,0,0,0,0])
let top=-Infinity
for(let i=2;i<expanded.pts.length;i+=3)top=Math.max(top,expanded.pts[i])
assert.ok(top>old[1][2],'The retained crown extends above the previous CT field of view')
function openCrownEdges(mesh){
 const counts=new Map(),n=mesh.pts.length/3
 for(let i=0;i<mesh.tris.length;i+=3)for(let k=0;k<3;k++){
  const a=mesh.tris[i+k],b=mesh.tris[i+(k+1)%3]
  if(mesh.pts[a*3+2]<=40||mesh.pts[b*3+2]<=40)continue
  const key=Math.min(a,b)*n+Math.max(a,b);counts.set(key,(counts.get(key)??0)+1)
 }
 return [...counts.values()].filter(v=>v===1).length
}
assert.ok(openCrownEdges(cropped)>0,'Reproduces the oval opening from the MRI-sized CT')
assert.equal(openCrownEdges(expanded),0,'The crown has no open mesh edges when original CT coverage is retained')
assert.equal(ctCropFeedback(expanded.report.boundaryFaces,full,full),'')
assert.match(ctCropFeedback(cropped.report.boundaryFaces,old,full),/selected crop.*S maximum \(41.88 mm\).*Widen the crop/)
assert.match(ctCropFeedback(cropped.report.boundaryFaces,old,old),/CT image boundary.*S maximum \(41.88 mm\).*larger field of view/)
const removed=skullPreview({sample:([x,y,z])=>x<1||Math.hypot(x-5,y-5,z-5)<2?1000:0},300,[[0,0,0],[10,10,10]],{spacingMm:1,components:'all'})
assert.equal(removed.report.boundaryFaces[0],100)
const cleaned=skullPreview({sample:([x,y,z])=>x<1&&y<1&&z<1||Math.hypot(x-5,y-5,z-5)<2?1000:0},300,[[0,0,0],[10,10,10]],{spacingMm:1,components:'largest'})
assert.equal(cleaned.report.boundaryVoxels,0,'A removed component cannot cause a false crop warning')
const metadata=JSON.parse(await fs.readFile(root+'tpl-NMT2Sym_res-05_desc-MEBRAINS_CT.json','utf8'))
assert.equal(metadata.coverage.deformation_extrapolated,false);assert.equal(metadata.coverage.holes_filled,false)
assert.ok(metadata.metrics.overlap_with_original_CT_max_absolute_difference<1e-5)
assert.equal(metadata.metrics.expanded_nonpositive_jacobians,0)
console.log(`CT coverage: actual demo crown retained at threshold ${threshold}, old crop opening reproduced, closed crown verified, source/crop feedback and registration provenance passed.`)
