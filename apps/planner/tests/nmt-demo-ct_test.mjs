import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as nifti from 'nifti-reader-js'
import {importNmtDemo} from '../src/data/brainana.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
import {validateProject} from '@brainana/planning-core/validation.ts'
const root=path.resolve('datasets/demo_viewer/nmt2sym'),requests=new Map()
const client={async apiFetch(url){const name=decodeURIComponent(url.split('/').at(-1));assert.equal(name,path.basename(name));requests.set(name,(requests.get(name)??0)+1);try{return new Response(await fs.readFile(path.join(root,name)))}catch{return new Response(null,{status:404})}}}
const bundle=await importNmtDemo(client,'demo'),p=bundle.project,ct=p.assets.find(a=>a.role==='ct')
assert.ok(ct);assert.equal(ct.modality,'ct');assert.match(ct.name,/MEBRAINS CT estimate/)
assert.equal(p.species,'macaque');assert.ok(p.display.anatomyOverlayIds.includes(ct.id));assert.equal(ct.imageDisplay.visible,true);assert.equal(ct.imageDisplay.opacity,.5)
assert.equal(ct.frameId,p.frame.id);assert.equal(ct.imageDisplay.skull,undefined,'A loaded CT is not automatically a finalized skull')
assert.deepEqual(p.planningSurfaceIds,[])
assert.match(ct.derivation.description,/population CT estimate/);assert.match(ct.derivation.description,/not calibrated Hounsfield/);assert.ok(ct.derivation.references.some(v=>v.url.includes('RheMAP')))
const header=bytes=>nifti.readHeader(nifti.decompress(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)))
const a=header(bundle.bytes.get(ct.id)),b=header(bundle.bytes.get(p.frame.referenceAssetId))
assert.deepEqual(a.dims.slice(1,4),b.dims.slice(1,4).map(v=>v+40));assert.deepEqual(a.pixDims.slice(1,4),b.pixDims.slice(1,4))
for(let i=0;i<4;i++)for(let j=0;j<4;j++)assert.ok(Math.abs(a.affine[i][j]-(b.affine[i][j]-(j===3&&i<3?10:0)))<1e-6,'CT keeps the same lattice with 10 mm extra coverage on each side')
assert.equal(requests.get('tpl-NMT2Sym_res-05_desc-MEBRAINS_CT.nii.gz'),1)
const sources=JSON.parse(await fs.readFile(path.join(root,'sources.json'),'utf8'));assert.equal(sources.find(v=>v.file.endsWith('desc-MEBRAINS_CT.nii.gz')).sha256,ct.sha256)
validateProject(p)
const saved=await unpackProject(await packProject(p,bundle.bytes)),restored=saved.project.assets.find(a=>a.id===ct.id)
assert.deepEqual(restored.derivation,ct.derivation);assert.deepEqual(saved.bytes.get(ct.id),bundle.bytes.get(ct.id));assert.ok(saved.project.display.anatomyOverlayIds.includes(ct.id))
for(const url of ['javascript:alert(1)','not a URL']){
 const bad=structuredClone(p);bad.assets.find(a=>a.id===ct.id).derivation.references[0].url=url;assert.throws(()=>validateProject(bad))
}
console.log('NMT demo: bundled CT import, expanded coverage on aligned MRI lattice, estimate/source labeling, slice blending, unfinalized surface state, source hash, portable CT/provenance persistence and reference validation passed.')
