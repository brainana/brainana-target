import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { NVImage } from '@niivue/niivue'
import { unpackProject } from '../src/data/archive.ts'
import { serveOffline } from './offline-app.mjs'
const bytes=kind=>NVImage.createNiftiArray([16,16,16],[2,2,2],[2,0,0,-16,0,2,0,-16,0,0,2,0,0,0,0,1],16,new Uint8Array(Float32Array.from({length:4096},(_,i)=>kind==='ct'?(i%16<5?1000:0):(i%16)*15).buffer))
const b=await chromium.launch({headless:true,args:['--single-process','--in-process-gpu','--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']})
try {
 const p=await b.newPage({viewport:{width:1440,height:1000}});await serveOffline(p)
 const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5183/')
 assert.equal(await p.getByRole('button',{name:'Load reference MRI…',exact:true}).count(),1)
 const chooser=p.waitForEvent('filechooser');await p.getByRole('button',{name:'Load reference MRI…',exact:true}).click();await(await chooser).setFiles({name:'mri.nii',mimeType:'application/octet-stream',buffer:Buffer.from(bytes('mri'))});await p.locator('.welcome').waitFor({state:'hidden'})
 await p.locator('button[data-feature="data"]').click();assert.equal(await p.getByRole('button',{name:'Add aligned MRI…',exact:true}).count(),0);assert.equal(await p.getByRole('button',{name:'Save portable project',exact:true}).count(),0)
 await p.locator('button[data-feature="images"]').click();assert.equal(await p.getByRole('button',{name:'Add aligned CT…',exact:true}).count(),1)
 const ctChooser=p.waitForEvent('filechooser');await p.getByRole('button',{name:'Add aligned CT…',exact:true}).click();await(await ctChooser).setFiles({name:'ct.nii',mimeType:'application/octet-stream',buffer:Buffer.from(bytes('ct'))})
 const ct=p.getByRole('dialog',{name:'Adjust ct.nii'});
 await ct.getByRole('button',{name:'Close',exact:true}).click()
 const anatomy=p.locator('canvas').first()
 const selection=p.getByLabel('Anatomical image',{exact:true})
 const options=await selection.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value))
 await p.getByRole('checkbox',{name:'Blend other MRI and CT images'}).check()
 for(const id of options){
  await selection.selectOption(id)
  assert.equal(await p.getByRole('slider',{name:'Skull opacity in 3D'}).isEnabled(),true)
  assert.equal(await p.getByRole('slider',{name:'Brain opacity in 3D'}).isEnabled(),true)
  assert.equal(await p.getByRole('checkbox',{name:'Blend other MRI and CT images'}).isChecked(),true)
  await p.getByRole('slider',{name:'Anatomy brightness',exact:true}).fill('25');await p.waitForTimeout(150);const dark=await anatomy.screenshot()
  await p.getByRole('slider',{name:'Anatomy brightness',exact:true}).fill('75');await p.waitForTimeout(150);assert.notDeepEqual(await anatomy.screenshot(),dark,'Brightness must change rendered MRI and CT slices')
 }
 await p.getByRole('checkbox',{name:'Blend other MRI and CT images'}).uncheck()
 await selection.selectOption(options[0])
 await p.getByRole('button',{name:'Anatomy display settings'}).click()
 const mriEditor=p.getByRole('dialog',{name:'Adjust mri.nii'});await mriEditor.getByRole('button',{name:'Close',exact:true}).click()
 await p.getByRole('button',{name:'Image layers',exact:true}).click()
 await p.getByRole('dialog',{name:'Image layers'}).getByRole('button',{name:'Adjust',exact:true}).nth(1).click()
await ct.getByRole('button',{name:'Build / update skull preview'}).click();await ct.getByRole('button',{name:'Close',exact:true}).click()
 const snapshot=async()=>{const event=p.waitForEvent('download');await p.getByRole('button',{name:'Save project',exact:true}).click();return(await unpackProject(new Uint8Array(await fs.readFile(await(await event).path())))).project}
 const before=await snapshot();await p.getByRole('slider',{name:'Anatomy brightness',exact:true}).fill('75');await p.waitForTimeout(200)
 await p.getByRole('button',{name:'Anatomy display settings'}).click();const editor=p.getByRole('dialog',{name:'Adjust mri.nii'});const center=await editor.getByLabel('Window center value',{exact:true}).inputValue();assert.ok(Math.abs(Number(center)-56.25)<1)
 await editor.getByRole('button',{name:'Close',exact:true}).click();const after=await snapshot();assert.equal(before.frame.referenceAssetId,after.frame.referenceAssetId);assert.deepEqual(before.chambers,after.chambers)
 const brain=p.getByRole('slider',{name:'Brain opacity in 3D'}),skull=p.getByRole('slider',{name:'Skull opacity in 3D'});await brain.fill('0');await skull.fill('0');await p.waitForTimeout(150);const canvas=p.getByLabel('Three-dimensional anatomy and chamber',{exact:true});const hidden=await canvas.screenshot();await skull.fill('0.7');await p.waitForTimeout(150);const shown=await canvas.screenshot();assert.notDeepEqual(hidden,shown)
 assert.equal(await brain.inputValue(),'0')
 await p.getByRole('button',{name:'3D scene settings'}).click();const scene=p.getByRole('dialog',{name:'Scene display'});assert.equal(await scene.getAttribute('aria-modal'),null);await scene.getByLabel('Cut plane',{exact:true}).selectOption('0');await scene.getByRole('button',{name:'Close Scene display'}).click()
 for(const width of [1440,1100,960]){await p.setViewportSize({width,height:1000});await p.waitForTimeout(150);const headers=await p.locator('.viewer-panel-header').evaluateAll(nodes=>nodes.slice(0,2).map(n=>({height:n.getBoundingClientRect().height,overflow:n.scrollWidth-n.clientWidth})));for(const h of headers){assert.ok(h.height<=90,JSON.stringify({width,...h}));assert.ok(h.overflow<=2,JSON.stringify({width,...h}))}}
 await p.setViewportSize({width:1440,height:1000});await p.screenshot({path:'/tmp/organized-viewer-panels.png'})
 assert.deepEqual(errors,[]);console.log('Import ownership, synchronized header/exact window controls, separate brain/skull rendering and zero-opacity restoration, advanced scene, fixed geometry, and compact headers at 960/1100/1440 passed.')
}finally{await b.close()}
