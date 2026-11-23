import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { gzipSync } from 'fflate'
import { NVImage } from '@niivue/niivue'
import { createAsset } from '../src/data/assets.ts'
import { createProject } from '@brainana/planning-core/model.ts'
import { packProject, unpackProject } from '../src/data/archive.ts'

const binary = process.env.PLANNER_DESKTOP_BINARY
if (!binary) throw new Error('Set PLANNER_DESKTOP_BINARY to the packaged application.')
const profile = await fs.mkdtemp(path.join(os.tmpdir(),'brainana-native-ct-'))
const dims=[250,360,200],values=new Uint16Array(dims.reduce((a,b)=>a*b,1))
for(let z=0;z<dims[2];z++)for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++){
 const px=x*.1-12.5,py=y*.1-18,pz=z*.1-10
 const r=px*px/(11.5**2)+py*py/(16.5**2)+pz*pz/(9.2**2)
 values[x+y*dims[0]+z*dims[0]*dims[1]]=r>=.84&&r<=1&&!(pz>5&&px*px+py*py<1.44)?2000:r<.84?300:0
}
const data=gzipSync(NVImage.createNiftiArray(dims,[.1,.1,.1],[.1,0,0,-12.5,0,.1,0,-18,0,0,.1,-10,0,0,0,1],512,new Uint8Array(values.buffer)),{level:1})
const ct=await createAsset('Native-CT.nii.gz','ct','native-frame',data)
ct.modality='ct'
const mriValues=new Uint8Array(values.length)
for(let z=0;z<dims[2];z++)for(let y=0;y<dims[1];y++)for(let x=0;x<dims[0];x++){
 const px=x*.1-12.5,py=y*.1-18,pz=z*.1-10
 const r=px*px/(11.5**2)+py*py/(16.5**2)+pz*pz/(9.2**2)
 mriValues[x+y*dims[0]+z*dims[0]*dims[1]]=r<.8?120:r>1.04&&r<1.2&&px<5?90:0
}
const mriData=gzipSync(NVImage.createNiftiArray(dims,[.1,.1,.1],[.1,0,0,-12.5,0,.1,0,-18,0,0,.1,-10,0,0,0,1],2,mriValues),{level:1})
const mri=await createAsset('MRI.nii.gz','anatomy','native-frame',mriData);mri.modality='mri'
const project=createProject(mri,'Native CT test',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
project.assets.push(ct)
let desktop
try{
 desktop=await electron.launch({executablePath:binary,args:['--desktop-test-profile',profile],timeout:60000})
 const page=await desktop.firstWindow()
 page.setDefaultTimeout(30000)
 const instrument=()=>{
  window.ctWorkerCreations=0;window.meshUploads=[];window.meshMatrices={}
  const WorkerClass=window.Worker
  window.Worker=class extends WorkerClass{
   constructor(url,options){super(url,options);if(String(url).includes('ctSurfaceWorker'))window.ctWorkerCreations++}
  }
  const locations=new WeakMap()
  const getLocation=WebGL2RenderingContext.prototype.getUniformLocation
  WebGL2RenderingContext.prototype.getUniformLocation=function(program,name){const result=getLocation.call(this,program,name);if(result)locations.set(result,name);return result}
  const matrix=WebGL2RenderingContext.prototype.uniformMatrix4fv
  WebGL2RenderingContext.prototype.uniformMatrix4fv=function(location,transpose,value,...rest){if(locations.get(location)==='mvpMtx')window.meshMatrices[this.canvas.getAttribute('aria-label')]=Array.from(value);return matrix.call(this,location,transpose,value,...rest)}
  const upload=WebGL2RenderingContext.prototype.bufferData
  WebGL2RenderingContext.prototype.bufferData=function(target,data,...args){
   if(ArrayBuffer.isView(data)&&data.byteLength>100000&&[this.ARRAY_BUFFER,this.ELEMENT_ARRAY_BUFFER].includes(target)){
    const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength)
    let hash=2166136261
    for(const value of bytes)hash=Math.imul(hash^value,16777619)
    window.meshUploads.push({label:this.canvas.getAttribute('aria-label'),target,length:data.byteLength,hash:hash>>>0})
   }
   return upload.call(this,target,data,...args)
  }
 }
 await page.addInitScript(instrument)
 await page.evaluate(instrument)
 const errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 const choose=page.waitForEvent('filechooser')
 await page.getByRole('button',{name:'Open saved chamber / project…',exact:true}).click()
 await (await choose).setFiles({name:'native-ct.brainana-plan',mimeType:'application/zip',buffer:Buffer.from(await packProject(project,new Map([[ct.id,data],[mri.id,mriData]])))})
 await expect(page.locator('.project-title')).toHaveText(project.name)
 await page.locator('button[data-feature="surface"]').click()
 await page.getByRole('button',{name:'Open surface editor…',exact:true}).click()
 const editor=page.getByRole('dialog',{name:'Planning surface editor'})
 const finalize=editor.getByRole('button',{name:'Finalize surface',exact:true})
 await expect(finalize).toBeEnabled()
 await editor.getByLabel('Bone threshold value',{exact:true}).fill('1054.7315')
 await editor.getByLabel('Bone threshold value',{exact:true}).press('Tab')
 await expect(finalize).toBeEnabled()
 const preview=editor.getByLabel('Live surface preparation preview',{exact:true})
 const coarse=await preview.screenshot()
 const spacing=editor.getByLabel('Surface detail (sample spacing)',{exact:true})
 const native=await spacing.locator('option').evaluateAll(options=>options.find(option=>option.textContent.includes('native voxel spacing')).value)
 await spacing.selectOption(native)
 await expect(finalize).toBeEnabled({timeout:120000})
 const report=await editor.getByText(/^Thresholded bone mesh · /).innerText()
 const triangles=Number(report.match(/· ([\d,]+) triangles/)[1].replaceAll(',',''))
 assert.ok(triangles>2400000)
 assert.ok(!(await preview.screenshot()).equals(coarse),'The detailed mesh is rendered')
 assert.equal(await preview.evaluate(canvas=>canvas.getContext('webgl2').isContextLost()),false)
 assert.equal(await editor.getByText(/Surface update failed/).count(),0)
 await editor.getByLabel('Smoothing passes value',{exact:true}).fill('0')
 await editor.getByLabel('Smoothing passes value',{exact:true}).press('Tab')
 await expect(finalize).toBeEnabled({timeout:120000})
 const unsmoothed=await preview.screenshot()
 await editor.getByLabel('Smoothing passes value',{exact:true}).fill('60')
 await editor.getByLabel('Smoothing passes value',{exact:true}).press('Tab')
 await editor.getByLabel('Maximum smoothing movement (mm) value',{exact:true}).fill('1.05')
 await editor.getByLabel('Maximum smoothing movement (mm) value',{exact:true}).press('Tab')
 await expect(finalize).toBeEnabled({timeout:120000})
 assert.ok(!(await preview.screenshot()).equals(unsmoothed),'Smoothing visibly changes the detailed preview')
 const draftUploads=await page.evaluate(()=>window.meshUploads.filter(item=>item.label==='Live surface preparation preview').slice(-2))
 const workerCount=await page.evaluate(()=>window.ctWorkerCreations)
 const box=await preview.boundingBox()
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5)
 await page.mouse.down();await page.mouse.move(box.x+box.width*.56,box.y+box.height*.53,{steps:4});await page.mouse.up()
 await page.mouse.wheel(0,-120)
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
 const frame=()=>preview.evaluate(canvas=>{
  const gl=canvas.getContext('webgl2'),pixels=new Uint8Array(canvas.width*canvas.height*4)
  gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels)
  let hash=2166136261
  for(const value of pixels)hash=Math.imul(hash^value,16777619)
  return {width:canvas.width,height:canvas.height,hash:hash>>>0}
 })
 const rememberedView=await frame()
 const rememberedMatrix=await page.evaluate(()=>window.meshMatrices['Live surface preparation preview'])
 await editor.getByRole('button',{name:'Close Planning surface editor',exact:true}).click()
 await page.getByRole('button',{name:'Open surface editor…',exact:true}).click()
 await expect(finalize).toBeEnabled()
 await expect.poll(()=>page.evaluate(()=>window.meshMatrices['Live surface preparation preview'])).toEqual(rememberedMatrix)
 assert.deepEqual(await frame(),rememberedView,'Reopening must preserve the rendered view, including rotation and zoom')
 assert.equal(await page.evaluate(()=>window.ctWorkerCreations),workerCount,'Reopening an unchanged draft must not recreate the CT mesh')
 await finalize.click()
 await expect(editor).toHaveCount(0)
 await expect.poll(()=>page.evaluate(()=>window.meshUploads.filter(item=>item.label==='Three-dimensional anatomy and chamber').length)).toBeGreaterThan(0)
 const finalUploads=await page.evaluate(()=>window.meshUploads.filter(item=>item.label==='Three-dimensional anatomy and chamber'))
 for(const draft of draftUploads)assert.ok(finalUploads.some(final=>final.target===draft.target&&final.length===draft.length&&final.hash===draft.hash),'Finalized GPU geometry must be byte-identical to the editor mesh')
 await expect(page.locator('.surface-finalized-notice')).toHaveText(/Surface finalized.*Active for placement/)
 const main3D=page.getByLabel('Three-dimensional anatomy and chamber',{exact:true})
 const setOpacity=async(name,value,measure)=>page.getByLabel(name,{exact:true}).evaluate((input,{value,measure})=>{
  input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}))
  if(!measure)return
  const canvas=document.querySelector('canvas[aria-label="Three-dimensional anatomy and chamber"]')
  const gl=canvas.getContext('webgl2'),pixels=new Uint8Array(canvas.width*canvas.height*4)
  // Read in the same event as drawScene, before Chromium discards the presented drawing buffer.
  gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels)
  if(measure==='baseline'){window.skullBaseline=pixels;return}
  // Allow two intensity levels for 8-bit rounding when MRI attenuates the skull color.
  const before=window.skullBaseline;let bone=0,lost=0
  for(let i=0;i<before.length;i+=4)if(before[i]-before[i+2]>5){bone++;if(pixels[i]-pixels[i+2]+2<(before[i]-before[i+2])*.65)lost++}
  return {bone,lost,fraction:lost/bone}
 },{value,measure})
 await setOpacity('Skull opacity in 3D',1)
 await setOpacity('Brain opacity in 3D',0,'baseline')
 const combined=await setOpacity('Brain opacity in 3D',.3,'compare')
 console.log('Combined MRI/skull coverage',JSON.stringify(combined))
 assert.ok(combined.bone>10000)
 assert.ok(combined.fraction<.005,`MRI 30% must preserve the finalized skull at 100%: ${JSON.stringify(combined)}`)
 await page.getByText('Autosaved locally',{exact:true}).waitFor()
 const savedPath=path.join(profile,'native.brainana-plan')
 await desktop.evaluate(({session},file)=>{session.defaultSession.once('will-download',(_event,item)=>item.setSavePath(file))},savedPath)
 await page.getByRole('button',{name:'Save project',exact:true}).click()
 await expect.poll(async()=>{try{return (await fs.stat(savedPath)).size}catch{return 0}}).toBeGreaterThan(10000)
 const saved=await unpackProject(new Uint8Array(await fs.readFile(savedPath)))
 assert.ok(Math.abs(saved.project.assets.find(asset=>asset.id===ct.id).imageDisplay.skull.spacingMm-.1)<1e-7)
 assert.deepEqual(saved.project.planningSurfaceIds,[ct.id])
 assert.deepEqual(saved.project.assets.find(asset=>asset.id===ct.id).imageDisplay.skull.smoothing,{iterations:60,maximumDisplacementMm:1.05})
 await page.getByRole('button',{name:'Open surface editor…',exact:true}).click()
 await expect(finalize).toBeEnabled({timeout:120000})
 assert.ok(await preview.screenshot())
 assert.equal(await page.evaluate(()=>window.ctWorkerCreations),workerCount,'Reopening the finalized editor must reuse its mesh')
 await expect(editor.getByLabel('Smoothing passes value',{exact:true})).toHaveValue('60')
 await expect(editor.getByLabel('Maximum smoothing movement (mm) value',{exact:true})).toHaveValue('1.05')
 const releasedCanvas=await preview.elementHandle()
 await editor.getByRole('button',{name:'Close Planning surface editor',exact:true}).click()
 await expect.poll(()=>releasedCanvas.evaluate(canvas=>canvas.getContext('webgl2').isContextLost())).toBe(true)
 assert.deepEqual(errors,[])
 // Reproduce a blocked unload after the high-resolution editor has closed.
 await page.evaluate(()=>window.addEventListener('beforeunload',event=>event.preventDefault()))
 const origin=new URL(page.url()).origin
 await desktop.evaluate(({app,dialog})=>{
  globalThis.closePrompts=0;globalThis.closeResponse=0
  dialog.showMessageBoxSync=(_window,options)=>{
   if(options.title!=='Close BrainanaTarget?')throw Error('Unexpected native prompt')
   globalThis.closePrompts++;return globalThis.closeResponse
  }
  setTimeout(()=>app.quit(),0)
 })
 await expect.poll(()=>desktop.evaluate(()=>globalThis.closePrompts)).toBe(1)
 assert.equal(page.isClosed(),false,'Keep working must preserve the window')
 assert.equal((await fetch(origin+'/api/version')).status,200,'Cancelling Quit must keep the local server running')
 const exited=desktop.waitForEvent('close',{timeout:15000})
 await desktop.evaluate(({app})=>{globalThis.closeResponse=1;setTimeout(()=>app.quit(),0)})
 await exited
 desktop=undefined
 console.log(`Editor/final GPU buffer identity, retained draft/final mesh, preserved camera, smoothing controls/persistence, preview GPU release, cancelled Quit recovery and confirmed Quit passed. Packaged native CT rendered and finalized ${triangles.toLocaleString()} triangles; source spacing, portable save and editor reopen passed.`)
}catch(error){console.error(error);throw error}
finally{
 if(desktop){
  const child=desktop.process(),forceClose=setTimeout(()=>child.kill('SIGKILL'),5000)
  try{await desktop.close()}finally{clearTimeout(forceClose)}
 }
 await fs.rm(profile,{recursive:true,force:true})
}
