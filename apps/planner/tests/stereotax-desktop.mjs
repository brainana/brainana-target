import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { NVImage } from '@niivue/niivue'
import { createAsset } from '../src/data/assets.ts'
import { createProject } from '@brainana/planning-core/model.ts'
import { packProject, unpackProject } from '../src/data/archive.ts'
const binary=process.env.PLANNER_DESKTOP_BINARY
if(!binary)throw new Error('Set PLANNER_DESKTOP_BINARY to the packaged application.')
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'brainana-stereotax-'))
const data=NVImage.createNiftiArray([32,32,32],[1,1,1],[1,0,0,-16,0,1,0,-16,0,0,1,-16,0,0,0,1],2,Uint8Array.from({length:32**3},(_,i)=>{const x=i%32-16,y=Math.floor(i/32)%32-16,z=Math.floor(i/1024)-16;return x*x+y*y+z*z<100?200:0}))
const asset=await createAsset('Reference-MRI.nii','anatomy','test-frame',data);asset.modality='mri'
const project=createProject(asset,'Stereotax desktop rat',{kind:'standalone',subject:null,scan:null,sourceRoot:null});project.species='rat'
let desktop
try{
 desktop=await electron.launch({executablePath:binary,args:['--desktop-test-profile',profile],timeout:60000})
 await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1600,1000))
 const page=await desktop.firstWindow();page.setDefaultTimeout(18000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 const colorBounds=async canvas=>page.evaluate(async png=>{
  const blob=await(await fetch('data:image/png;base64,'+png)).blob(),bitmap=await createImageBitmap(blob)
  const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height
  const context=c.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close()
  const pixels=context.getImageData(0,0,c.width,c.height).data
  let left=c.width,right=-1,top=c.height,bottom=-1,count=0
  for(let y=4;y<c.height-4;y++)for(let x=4;x<c.width-4;x++){
   if(x<c.width*.2&&y>c.height*.75)continue // orientation cube
   const i=(x+y*c.width)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2]
   if(Math.max(r,g,b)-Math.min(r,g,b)<20||Math.max(r,g,b)<35)continue
   left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++
  }
  return {width:Math.max(0,right-left+1),height:Math.max(0,bottom-top+1),left,right,top,bottom,count,canvasWidth:c.width,canvasHeight:c.height}
 },(await canvas.screenshot()).toString('base64'))
 const checkZoom=async(canvas,fit,buttons=false)=>{
  await fit.click();await page.mouse.move(1,1);const initial=await colorBounds(canvas)
  assert.ok(initial.count>1000,'Frame is visible after Fit')
  console.log('Fit bounds',initial)
  await canvas.screenshot({path:'/tmp/brainana77-fit.png'})
  assert.ok(initial.left>1&&initial.right<initial.canvasWidth-2&&initial.top>1&&initial.bottom<initial.canvasHeight-2,'Fit includes the full frame and plate with a margin')
  const wheel=async(delta,count)=>canvas.evaluate((element,{delta,count})=>{const b=element.getBoundingClientRect();for(let i=0;i<count;i++)element.dispatchEvent(new WheelEvent('wheel',{deltaY:delta,clientX:b.x+b.width/2,clientY:b.y+b.height/2,bubbles:true,cancelable:true}))},{delta,count})
  await wheel(-100,25)
  const small=await colorBounds(canvas);console.log('Zoom-out bounds',small);await canvas.screenshot({path:'/tmp/brainana77-zoom-out.png'})
  assert.ok(small.width<initial.width*.2,`Wheel zoom must pass below the old limit: ${small.width}/${initial.width}`)
  await wheel(100,8)
  assert.ok((await colorBounds(canvas)).width>small.width*1.5,'Reverse scroll zooms in smoothly')
  await fit.click()
  assert.ok(Math.abs((await colorBounds(canvas)).width-initial.width)<3,'Fit restores the complete setup')
  if(buttons){
   for(let i=0;i<14;i++)await page.getByRole('button',{name:'Zoom out 3D',exact:true}).click()
   assert.ok((await colorBounds(canvas)).width<initial.width*.15,'Toolbar zoom also passes below its old limit')
   await fit.click()
  }
  console.log('Full-frame Fit and extended wheel'+(buttons?' / toolbar':'')+' zoom passed')
 }
 const load=async(p,home=false)=>{
  const chooser=page.waitForEvent('filechooser')
  await page.getByRole('button',{name:home?'Open saved chamber / project…':'Open project',exact:true}).click()
  await (await chooser).setFiles({name:'stereotax.brainana-plan',mimeType:'application/zip',buffer:Buffer.from(await packProject(p,new Map([[asset.id,data]])))})
  await expect(page.locator('.project-title')).toHaveText(p.name)
 }
 await load(project,true)
 const scene=page.getByLabel('Three-dimensional anatomy and chamber',{exact:true})
 const rig=page.getByRole('dialog',{name:'Stereotaxic setup'})
 const open=async()=>{await page.getByRole('button',{name:'Stereotaxic setup…',exact:true}).click();await expect(rig).toBeVisible()}
 const close=async()=>{await rig.getByRole('button',{name:'Close Stereotaxic setup',exact:true}).click()}
 const values=async(label)=>rig.getByLabel(label,{exact:true}).locator('option').evaluateAll(options=>options.map(option=>option.value))
 await open()
 await expect(rig.getByLabel('Model',{exact:true})).toHaveValue('kopf-900')
 assert.ok(!(await values('Model')).includes('kopf-1430'))
 assert.deepEqual(await values('Ear-bar model'),['','955','957'])
 await expect(rig.getByLabel('Ear-bar model',{exact:true})).toHaveValue('957')
 await expect(rig.getByLabel('Plate length (mm) value',{exact:true})).toHaveValue('353.06')
 await expect(rig.getByLabel('Ear axis above plate (mm) value',{exact:true})).toHaveValue('53')
 await expect(rig.getByLabel('Manipulator model',{exact:true})).toHaveValue('kopf-960')
 await rig.getByRole('button',{name:'Fit frame',exact:true}).click()
 console.log('Rat default, published dimensions and accessory filtering passed')
 // A nonmodal editor must leave the intended 3D viewer usable, including its header.
 const placement=await rig.evaluate(element=>{const r=element.getBoundingClientRect(),v=document.querySelector('canvas[aria-label="Three-dimensional anatomy and chamber"]').getBoundingClientRect();return {right:r.right,viewerLeft:v.left,scroll:element.scrollWidth,client:element.clientWidth}})
 assert.ok(placement.right<=placement.viewerLeft+8,'The window must sit beside the 3D viewer')
 assert.ok(placement.scroll<=placement.client,'The window must not overflow horizontally')
 await rig.getByLabel('Show all animal sizes',{exact:true}).check()
 assert.ok((await values('Model')).includes('kopf-1430'))
 await rig.getByLabel('Show all animal sizes',{exact:true}).uncheck()
 await rig.getByRole('status').filter({hasText:/Frame preview/}).waitFor()
 const full=await scene.screenshot()
 await rig.getByLabel('Show base plate',{exact:true}).uncheck()
 await expect.poll(async()=>!(await scene.screenshot()).equals(full)).toBe(true)
 await rig.getByLabel('Show base plate',{exact:true}).check()
 await rig.getByText('Individual ear-bar blocks',{exact:true}).click()
 await rig.getByLabel('Left block front/back (mm) value',{exact:true}).fill('4')
 await rig.getByLabel('Left block up/down (mm) value',{exact:true}).fill('2')
 await rig.getByLabel('Ear-tip center left/right (mm) value',{exact:true}).fill('1')
 await rig.getByLabel('Stage X offset (mm) value',{exact:true}).fill('12')
 await rig.getByLabel('Stage Z offset (mm) value',{exact:true}).fill('-10')
 await rig.getByLabel('Tool tilt X from vertical (°) value',{exact:true}).fill('30')
 await expect.poll(async()=>!(await scene.screenshot()).equals(full)).toBe(true)
 await rig.getByLabel('Bite-bar adaptor',{exact:true}).selectOption('920')
 for(const [label,value] of [['Bar length forward from contact (mm)','20'],['Bar width (mm)','8'],['Bar thickness (mm)','3']])await rig.getByLabel(label,{exact:true}).fill(value)
 await rig.getByLabel('Adaptor A/P travel offset (mm) value',{exact:true}).fill('10')
 await rig.getByRole('button',{name:'Use crosshair for bite contact',exact:true}).click()
 // Setting a contact from the crosshair must account for the separate AP travel offset.
 assert.ok(Math.abs(Number(await rig.getByLabel('Contact front/back (mm)',{exact:true}).inputValue())+10)<1)
 await rig.getByRole('button',{name:'Apply frame',exact:true}).click()
 await expect(rig.getByRole('status')).toHaveText('Frame applied.')
 const file=path.join(profile,'saved.brainana-plan')
 await desktop.evaluate(({session},file)=>session.defaultSession.once('will-download',(_event,item)=>item.setSavePath(file)),file)
 await page.getByRole('button',{name:'Save project',exact:true}).click()
 await expect.poll(async()=>{try{return(await fs.stat(file)).size}catch{return 0}}).toBeGreaterThan(1000)
 const saved=await unpackProject(new Uint8Array(await fs.readFile(file)))
 assert.equal(saved.project.stereotax.arms[0].stageXmm,12)
 assert.equal(saved.project.stereotax.arms[0].toolTiltXDeg,30)
 assert.equal(saved.project.stereotax.earBlockOffsets.left.apMm,4)
 assert.equal(saved.project.stereotax.basePlate.earHeightMm,53)
 await rig.locator('.image-tool-content').evaluate(element=>element.scrollTop=0)
 if(process.env.PLANNER_STEREOTAX_SCREENSHOT)await page.screenshot({path:process.env.PLANNER_STEREOTAX_SCREENSHOT})
 await close()
 await checkZoom(scene,page.getByRole('button',{name:'Reset zoom 3D',exact:true}),true)
 await load(saved.project);await open()
 await expect(rig.getByLabel('Stage X offset (mm) value',{exact:true})).toHaveValue('12')
 await expect(rig.getByLabel('Tool tilt X from vertical (°) value',{exact:true})).toHaveValue('30')
 // Switching models selects their included manipulators, without carrying stale stages.
 await rig.getByLabel('Model',{exact:true}).selectOption('kopf-902')
 await expect(rig.getByLabel('Manipulator model',{exact:true})).toHaveCount(2)
 await expect(rig.getByLabel('Stage X offset (mm) value',{exact:true}).first()).toHaveValue('0')
 await close()
 console.log('Live geometry and portable save/reopen passed')
 for(const species of ['mouse','tree-shrew','marmoset','macaque',undefined]){
  const p=structuredClone(project);p.name='Stereotax '+(species??'unspecified');p.species=species
  await load(p);await open()
  const ids=await values('Model')
  if(['mouse','tree-shrew'].includes(species)){assert.ok(ids.includes('kopf-900'));assert.ok(!ids.includes('kopf-1430'))}
  if(species==='macaque'){assert.ok(ids.includes('kopf-1430'));assert.ok(!ids.includes('kopf-900'))}
  if(species==='marmoset')await expect(rig.getByLabel('Model',{exact:true})).toHaveValue('narishige-sr6cht')
  if(species==='mouse'){assert.deepEqual(await values('Ear-bar model'),['','921','922']);assert.ok(!(await values('Bite-bar adaptor')).includes('920'))}
  if(!species){assert.ok(ids.includes('kopf-900'));assert.ok(ids.includes('kopf-1430'))}
  await close();console.log('Species filter passed:',species??'unspecified')
 }
 // Reuse the actual saved planner frame in evaluation and verify the same adjustments.
 await page.getByText('Autosaved locally',{exact:true}).waitFor({timeout:30000})
 await page.getByRole('link',{name:'← Home',exact:true}).click()
 await page.getByRole('link',{name:'Evaluate placement',exact:true}).click()
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open saved plan…',exact:true}).click();await(await chooser).setFiles(file)
 await expect(page.getByRole('status').filter({hasText:'Loaded Stereotax desktop rat'})).toBeVisible()
 await open()
 await expect(rig.getByLabel('Model',{exact:true})).toHaveValue('kopf-900')
 await expect(rig.getByLabel('Stage X offset (mm) value',{exact:true})).toHaveValue('12')
 await expect(rig.getByLabel('Ear axis above plate (mm) value',{exact:true})).toHaveValue('53')
 assert.ok(!(await values('Model')).includes('kopf-1430'))
 await rig.getByLabel('Stage X offset (mm) value',{exact:true}).fill('15')
 await rig.getByRole('button',{name:'Apply frame',exact:true}).click()
 await expect(rig.getByRole('status')).toHaveText('Frame applied.')
 await close();await open()
 await expect(rig.getByLabel('Stage X offset (mm) value',{exact:true})).toHaveValue('15')
 await close()
 const evaluationScene=page.getByLabel('3D anatomy and implants',{exact:true})
 await checkZoom(evaluationScene,evaluationScene.locator('xpath=ancestor::section[contains(@class,"view-pane")]').getByRole('button',{name:'Fit',exact:true}))
 assert.deepEqual(errors,[])
 console.log('Packaged stereotax: species filters, published plate dimensions, live geometry, ear-block offsets, articulated stages, adaptor contact, both workspaces, save/reopen, nonoccluding window and header scrolling passed.')
}finally{
 if(desktop){const proc=desktop.process(),timer=setTimeout(()=>proc.kill('SIGKILL'),5000);try{await desktop.close()}finally{clearTimeout(timer)}}
 await fs.rm(profile,{recursive:true,force:true})
}
