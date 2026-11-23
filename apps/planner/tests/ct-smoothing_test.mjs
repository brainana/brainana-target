import assert from 'node:assert/strict'
import { skullPreview } from '../src/render/ctSkull.ts'
import { smoothSurface } from '../src/render/smoothSurface.ts'
import { ctSurfaceKey } from '../src/render/ctSurfaceKey.ts'
import { openingSurfaceKey } from '@brainana/planning-core/skull-surface.ts'
import { validateProject } from '@brainana/planning-core/validation.ts'
import { createAsset } from '../src/data/assets.ts'
import { createProject } from '@brainana/planning-core/model.ts'
import { packProject, unpackProject } from '../src/data/archive.ts'
const bounds=[[-5,-5,-3],[5,5,4]], step=.2
const source={sample:p=>Math.hypot(...p)>3.4&&Math.hypot(...p)<4.4&&!(p[2]>0&&Math.hypot(p[0],p[1])<.8)?200:0}
const config={representation:'smooth',threshold:100,bounds,spacingMm:step,components:'largest'}
const raw=skullPreview(source,100,bounds,{...config,representation:'isosurface'})
const off={iterations:0,maximumDisplacementMm:.5},strong={iterations:60,maximumDisplacementMm:.5}
assert.deepEqual(skullPreview(source,100,bounds,{...config,smoothing:off}).pts,raw.pts)
const legacy=smoothSurface(raw,...bounds,step),smoothed=skullPreview(source,100,bounds,{...config,smoothing:strong})
assert.deepEqual(smoothed.tris,raw.tris,'Smoothing must retain every face and opening')
const energy=mesh=>{
 const counts=new Uint32Array(mesh.pts.length/3),sum=new Float64Array(mesh.pts.length)
 for(let i=0;i<mesh.tris.length;i+=3)for(let j=0;j<3;j++){
  const a=mesh.tris[i+j],b=mesh.tris[i+(j+1)%3],c=mesh.tris[i+(j+2)%3]
  counts[a]+=2
  for(let k=0;k<3;k++)sum[3*a+k]+=mesh.pts[3*b+k]+mesh.pts[3*c+k]
 }
 let value=0
 for(let i=0;i<counts.length;i++)if(counts[i])for(let k=0;k<3;k++)value+=(mesh.pts[3*i+k]-sum[3*i+k]/counts[i])**2
 return value/counts.length
}
assert.ok(energy(smoothed)<energy(legacy),'Additional passes must reduce local roughness')
let movement=0
for(let i=0;i<raw.pts.length;i+=3){
 const distance=Math.hypot(...[0,1,2].map(k=>raw.pts[i+k]-smoothed.pts[i+k]))
 movement=Math.max(movement,distance)
 assert.ok(distance<=.50001)
 for(let k=0;k<3;k++)if(Math.abs(raw.pts[i+k]-bounds[0][k])<1e-5||Math.abs(raw.pts[i+k]-bounds[1][k])<1e-5)
  assert.deepEqual(smoothed.pts.slice(i,i+3),raw.pts.slice(i,i+3),'Crop boundary stays fixed')
}
assert.ok(movement>step*.5,'The movement control must work independently of sample spacing')
assert.notEqual(ctSurfaceKey(config),ctSurfaceKey({...config,smoothing:strong}))
assert.notEqual(openingSurfaceKey(config),openingSurfaceKey({...config,smoothing:strong}))
const data=new Uint8Array([1,2,3]),asset=await createAsset('ct.nii','anatomy','frame',data)
asset.modality='ct';asset.imageDisplay={min:0,max:200,opacity:1,colormap:'gray',visible:true,skull:{...config,smoothing:strong}}
const project=createProject(asset,'Smoothing',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
validateProject(project)
const loaded=await unpackProject(await packProject(project,new Map([[asset.id,data]])))
assert.deepEqual(loaded.project.assets[0].imageDisplay.skull.smoothing,strong)
for(const invalid of [{iterations:-1,maximumDisplacementMm:.5},{iterations:1.5,maximumDisplacementMm:.5},{iterations:20,maximumDisplacementMm:-1},{iterations:20,maximumDisplacementMm:Infinity}]){
 const bad=structuredClone(project);bad.assets[0].imageDisplay.skull.smoothing=invalid
 assert.throws(()=>validateProject(bad),/smoothing/)
 assert.throws(()=>smoothSurface(raw,...bounds,step,undefined,invalid),/Smoothing/)
}
console.log('Adjustable CT smoothing reduces roughness, preserves topology/crop edges, obeys physical movement, changes surface/opening identity, validates and survives portable save/reopen.')
