import assert from 'node:assert/strict'
import {headpostReferences,headpostDesignResources} from '@brainana/planning-core/headposts.ts'
import {createProject} from '@brainana/planning-core/model.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
import {createAsset} from '../src/data/assets.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
import {headpostGeometry} from '../src/render/headpostGeometry.ts'
const ref=id=>headpostReferences.find(r=>r.id===id)
assert.equal(new Set(headpostReferences.map(r=>r.id)).size,headpostReferences.length)
assert.equal(ref('mark-ii').dimensions.baseThickness,1,'Original 2007 measurements remain unchanged')
assert.equal(ref('adams-2011').dimensions.baseThickness,1.5,'The later revision is a separate design')
assert.equal(ref('gmr-dahp-2').dimensions.baseThickness,1.39)
assert.equal(ref('gmr-dahp-1').dimensions.baseThickness,undefined,'Do not transfer measurements between manufacturer variants')
assert.equal(ref('gmr-dahp-2').details.find(d=>d.label.startsWith('Screw')).value,'3 mm')
assert.equal(ref('ortiz-rios-ha-peek').dimensions.postHeight,27)
assert.equal(ref('ortiz-rios-ha-peek').profile,'trapezoid')
assert.equal(ref('ortiz-rios-ha-peek').dimensions.baseDiameter,undefined)
assert.ok(!headpostDesignResources.some(r=>r.url.includes('PMC13603819') || r.url.includes('primate-chairs')))
assert.ok(!headpostReferences.some(r=>r.source.includes('PMC13603819')),'Accessory caps cannot be selected as headpost implants')
const asset=await createAsset('MRI.nii','anatomy','f',new Uint8Array([1]))
const project=createProject(asset,'Catalog',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
const mesh={pts:[0,0,0,2,0,0,0,2,0],tris:[0,1,2]}
for(const r of headpostReferences){
 project.headposts=[{id:'headpost',name:r.name,frameId:project.frame.id,pose:{origin:[1,2,3],angles:[0,0,0]},avoid:true,existing:false,reference:r.id,mesh}]
 validateProject(project)
 const restored=await unpackProject(await packProject(project,new Map([[asset.id,new Uint8Array([1])]])))
 assert.equal(restored.project.headposts[0].reference,r.id)
 assert.deepEqual(headpostGeometry(restored.project.headposts[0]).pts,new Float32Array([1,2,3,3,2,3,1,4,3]),'Changing literature reference never substitutes guessed geometry for the imported model')
}
project.headposts[0].reference='not-a-real-template';assert.throws(()=>validateProject(project),/headpost settings/)
console.log('Headpost source catalog: versioned measurements, no variant inference, accessories separated, all imported template IDs validate/save/reopen and preserve actual geometry.')
