import assert from 'node:assert/strict'
import { createAsset } from '../src/data/assets.ts'
import { createProject } from '@brainana/planning-core/model.ts'
import { packProject, unpackProject } from '../src/data/archive.ts'
const payload=new Uint8Array(257*1024*1024)
payload[0]=73;payload[payload.length/2]=124;payload[payload.length-1]=201
const asset=await createAsset('large-MRI.nii','anatomy','frame',payload)
asset.modality='mri'
const project=createProject(asset,'Large portable project',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
const ct={...asset,id:'large-ct',name:'large-CT.nii',role:'ct',modality:'ct'}
project.assets.push(ct)
const progress=[],archive=await packProject(project,new Map([[asset.id,payload],[ct.id,payload]]),label=>progress.push(label))
assert.ok(archive.byteLength>512*1024*1024)
const restored=await unpackProject(archive)
assert.equal(restored.project.assets.length,2)
for(const image of restored.project.assets){
 const actual=restored.bytes.get(image.id)
 assert.equal(actual.byteLength,payload.byteLength)
 for(const index of [0,payload.length/2,payload.length-1])assert.equal(actual[index],payload[index])
 assert.equal(image.sha256,asset.sha256)
}
assert.ok(progress.includes('Packaging portable project…'))
console.log(`Portable save/reopen passed for ${(archive.byteLength/1048576).toFixed(1)} MiB with both image checksums verified.`)
