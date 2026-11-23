import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {_electron as electron,expect} from '@playwright/test'
import {NVImage} from '@niivue/niivue'
import {createProject} from '@brainana/planning-core/model.ts'
import {createStereotax} from '@brainana/planning-core/stereotaxSetup.ts'
import {createAsset} from '../src/data/assets.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
import {unzipSync,strFromU8} from 'fflate'
const binary=process.env.PLANNER_DESKTOP_BINARY
if(!binary)throw new Error('Set PLANNER_DESKTOP_BINARY')
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'brainana-measurements-'))
const values=Uint8Array.from({length:32**3},(_,i)=>Math.hypot(i%32-16,Math.floor(i/32)%32-16,Math.floor(i/1024)-16)<11?190:0)
const data=NVImage.createNiftiArray([32,32,32],[1,1,1],[1,0,0,-16,0,1,0,-16,0,0,1,-16,0,0,0,1],2,values)
const asset=await createAsset('Measure-MRI.nii','anatomy','frame',data);asset.modality='mri'
const project=createProject(asset,'Measurement desktop',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
project.species='rat';project.planningIntent='chamber';project.stereotax=createStereotax('rat',[0,0,0])
project.chambers=[{id:'c',name:'Chamber 1',frameId:'frame',pose:{origin:[4,2,10],angles:[0,0,0]},innerRadius:4,wallThickness:1,height:8}]
project.landmarks=[{id:'a',name:'Fiducial A',frameId:'frame',point:[0,0,0]},{id:'b',name:'Fiducial B',frameId:'frame',point:[3,4,12]}]
let desktop
try{
 desktop=await electron.launch({executablePath:binary,args:['--desktop-test-profile',profile],timeout:60000})
 await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1600,1000))
 const page=await desktop.firstWindow();page.setDefaultTimeout(15000)
 const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.log('Page error:',error.message)})
 page.on('console',message=>{if(message.type()==='error')console.log('Console:',message.text())})
 const open=async(payload,home=false)=>{
  const chooser=page.waitForEvent('filechooser')
  await page.getByRole('button',{name:home?'Open saved chamber / project…':'Open project',exact:true}).click()
  await(await chooser).setFiles({name:'measurement.brainana-plan',mimeType:'application/zip',buffer:Buffer.from(payload)})
  await expect(page.locator('.project-title')).toHaveText(project.name)
 }
 const download=async(name,click)=>{
  const file=path.join(profile,name)
  await desktop.evaluate(({session},file)=>session.defaultSession.once('will-download',(_event,item)=>item.setSavePath(file)),file)
  await click();await expect.poll(async()=>{try{return(await fs.stat(file)).size}catch{return 0}},{timeout:30000}).toBeGreaterThan(100)
  return file
 }
 await open(await packProject(project,new Map([[asset.id,data]])),true)
 await page.locator('button[data-feature="stereotax"]').click()
 const panel=page.locator('.measurement-panel')
 await expect(panel).toBeVisible()
 const choose=async(from,to,axes='image')=>{
  await panel.getByLabel('Measure from',{exact:true}).selectOption(JSON.stringify(from))
  await panel.getByLabel('Measure to',{exact:true}).selectOption(JSON.stringify(to))
  await panel.getByLabel('Measurement axes',{exact:true}).selectOption(JSON.stringify({kind:axes}))
 }
 await choose({kind:'landmark',id:'a'},{kind:'landmark',id:'b'})
 await expect(panel.locator('.measurement-readout')).toContainText('13.00 mm')
 await expect(panel.locator('.measurement-readout')).toContainText('+3.00 mm')
 await panel.getByRole('textbox',{name:'Measurement name',exact:true}).fill('Fiducial span')
 await panel.getByRole('button',{name:'Save measurement',exact:true}).click()
 const span=panel.locator('.measurement-card').filter({hasText:'Fiducial span'})
 await expect(span).toContainText('13.00 mm')
 await choose({kind:'ear-midpoint'},{kind:'chamber-center',id:'c'},'frame')
 await panel.getByRole('textbox',{name:'Measurement name',exact:true}).first().fill('Ear midpoint to chamber')
 await panel.getByRole('button',{name:'Save measurement',exact:true}).click()
 const ear=panel.locator('.measurement-card').filter({hasText:'Ear midpoint to chamber'})
 await expect(ear).toContainText('10.95 mm')
 const ruler=page.getByLabel('3D measurement rulers',{exact:true}),sliceRuler=page.getByLabel('Slice measurement rulers',{exact:true})
 await expect(ruler).toBeVisible();await expect(sliceRuler).toBeVisible()
 for(const [overlay,source] of [[ruler,page.getByLabel('Three-dimensional anatomy and chamber',{exact:true})],[sliceRuler,page.getByLabel('Cardinal anatomy slices',{exact:true})]]){
  const a=await overlay.boundingBox(),b=await source.boundingBox()
  for(const key of ['x','y','width','height'])assert.ok(Math.abs(a[key]-b[key])<2,`Ruler canvas must coincide with its viewer: ${key}`)
 }
 await expect.poll(()=>ruler.evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data).filter((v,i)=>i%4===3&&v>0).length)).toBeGreaterThan(50)
 const shown=await ruler.evaluate(c=>c.toDataURL()),projected=await sliceRuler.evaluate(c=>c.toDataURL())
 await span.getByLabel('Show ruler Fiducial span',{exact:true}).uncheck()
 await expect.poll(()=>ruler.evaluate(c=>c.toDataURL())).not.toBe(shown)
 await expect.poll(()=>sliceRuler.evaluate(c=>c.toDataURL())).not.toBe(projected)
 await span.getByLabel('Show ruler Fiducial span',{exact:true}).check()
 const b=panel.locator('.reference-point-card').filter({has:page.getByText('Fiducial B',{exact:true})})
 await b.getByText('Edit Fiducial B',{exact:true}).click()
 await b.getByLabel('R coordinate (mm)',{exact:true}).fill('7')
 await page.keyboard.press('Tab')
 await expect(span).toContainText('14.46 mm')
 await page.getByRole('button',{name:'Undo',exact:true}).click()
 await expect(span).toContainText('13.00 mm')
 await b.getByText('Edit Fiducial B',{exact:true}).click()
 await b.getByRole('button',{name:'Remove Fiducial B',exact:true}).click()
 await expect(span).toContainText('Reference unavailable')
 await page.getByRole('button',{name:'Undo',exact:true}).click()
 await expect(span).toContainText('13.00 mm')
 console.log('Planner: named anchors, linked measurements, signed offsets, visible rulers, landmark edits, unavailable references and Undo passed')
 await panel.getByRole('button',{name:'Configure stereotax…',exact:true}).click()
 const rig=page.getByRole('dialog',{name:'Stereotaxic setup'})
 await rig.getByLabel('R (mm)',{exact:true}).fill('10')
 await expect(ear).toContainText('11.83 mm')
 await expect(span).toContainText('13.00 mm')
 await rig.getByRole('button',{name:'Close Stereotaxic setup',exact:true}).click()
 await expect(ear).toContainText('10.95 mm')
 await panel.getByRole('button',{name:'Configure stereotax…',exact:true}).click()
 await rig.getByLabel('R (mm)',{exact:true}).fill('10')
 await rig.getByRole('button',{name:'Apply frame',exact:true}).click()
 await expect(rig.getByRole('status')).toHaveText('Frame applied.')
 await rig.getByRole('button',{name:'Close Stereotaxic setup',exact:true}).click()
 await expect(ear).toContainText('11.83 mm')
 const csv=await download('measurements.csv',()=>panel.getByRole('button',{name:'Export measurements CSV',exact:true}).click())
 assert.match(await fs.readFile(csv,'utf8'),/Fiducial span/)
 const savedPath=await download('saved.brainana-plan',()=>page.getByRole('button',{name:'Save project',exact:true}).click())
 const savedBytes=await fs.readFile(savedPath),saved=await unpackProject(new Uint8Array(savedBytes))
 assert.equal(saved.project.measurements.length,2);assert.equal(saved.project.stereotax.pose.origin[0],10)
 assert.ok(unzipSync(savedBytes)['measurements.csv'])
 await page.locator('button[data-feature="review"]').click()
 await expect(page.locator('.measurement-summary-panel')).toContainText('11.83 mm')
 const report=await download('report.html',()=>page.getByRole('button',{name:'Export HTML report',exact:true}).click())
 assert.match(await fs.readFile(report,'utf8'),/Saved measurements/)
 await page.locator('button[data-feature="stereotax"]').click()
 await page.locator('.inspector').evaluate(element=>element.scrollTop=0)
 await page.getByRole('button',{name:'Reset zoom 3D',exact:true}).click()
 if(process.env.PLANNER_MEASUREMENT_SCREENSHOT)await page.screenshot({path:process.env.PLANNER_MEASUREMENT_SCREENSHOT})
 await open(savedBytes)
 await page.locator('button[data-feature="stereotax"]').click()
 await expect(page.locator('.measurement-card')).toHaveCount(2)
 await expect(ear).toContainText('11.83 mm')
 console.log('Planner: live frame preview/revert/apply, CSV/report/portable exports and reopen passed')
 await page.getByText('Autosaved locally',{exact:true}).waitFor({timeout:30000})
 await page.getByRole('link',{name:'← Home',exact:true}).click()
 await page.getByRole('link',{name:'Evaluate placement',exact:true}).click()
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open saved plan…',exact:true}).click();await(await chooser).setFiles(savedPath)
 await expect(page.getByRole('status').filter({hasText:'Loaded '+project.name})).toBeVisible()
 const evalTab=page.getByRole('navigation',{name:'Evaluation sections'}).getByRole('button',{name:'Stereotax',exact:true})
 await evalTab.click()
 await expect(panel.locator('.measurement-card')).toHaveCount(2)
 await expect(ear).toContainText('11.83 mm')
 await choose({kind:'landmark',id:'a'},{kind:'landmark',id:'b'})
 await panel.getByRole('textbox',{name:'Measurement name',exact:true}).first().fill('Evaluation copy')
 await panel.getByRole('button',{name:'Save measurement',exact:true}).click()
 await expect(panel.locator('.measurement-card')).toHaveCount(3)
 const evalSaved=await download('evaluation.brainana-plan',()=>panel.getByRole('button',{name:'Save project with measurements',exact:true}).click())
 assert.equal((await unpackProject(new Uint8Array(await fs.readFile(evalSaved)))).project.measurements.length,3)
 await page.getByRole('navigation',{name:'Evaluation sections'}).getByRole('button',{name:'Data',exact:true}).click()
 const reopen=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open saved plan…',exact:true}).click();await(await reopen).setFiles(evalSaved)
 await expect(page.getByRole('status').filter({hasText:'Loaded '+project.name})).toBeVisible()
 await evalTab.click();await expect(panel.locator('.measurement-card')).toHaveCount(3)
 await page.getByLabel('3D anatomy and implants',{exact:true}).locator('xpath=ancestor::section[contains(@class,"view-pane")]').getByRole('button',{name:'Fit',exact:true}).click()
 if(process.env.PLANNER_MEASUREMENT_EVALUATION_SCREENSHOT)await page.screenshot({path:process.env.PLANNER_MEASUREMENT_EVALUATION_SCREENSHOT})
 console.log('Evaluation: shared measurements, working-copy edits, portable save and reopen passed')
 // Standalone evaluation requires only an MRI, with no CT or pre-existing plan.
 await page.getByRole('link',{name:'← Home',exact:true}).click()
 await page.getByRole('link',{name:'Evaluate placement',exact:true}).click()
 const reference=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Load MRI…',exact:true}).click();await(await reference).setFiles({name:'Standalone.nii',mimeType:'application/octet-stream',buffer:Buffer.from(data)})
 await expect(page.getByRole('button',{name:'Stereotaxic setup…',exact:true})).toBeEnabled()
 await evalTab.click()
 await panel.getByLabel('Reference point name',{exact:true}).fill('Standalone fiducial')
 await panel.getByRole('button',{name:'Add named point at crosshair',exact:true}).click()
 await expect(panel.locator('.reference-point-card')).toContainText('Standalone fiducial')
 const standalone=await download('standalone.brainana-plan',()=>panel.getByRole('button',{name:'Save project with measurements',exact:true}).click())
 const standaloneProject=(await unpackProject(new Uint8Array(await fs.readFile(standalone)))).project
 assert.equal(standaloneProject.landmarks[0].name,'Standalone fiducial')
 assert.equal(standaloneProject.assets.length,1)
 assert.deepEqual(errors,[])
 console.log('MRI-only evaluation: named references and portable reference/measurement saving passed; no renderer errors')
}finally{
 if(desktop){const proc=desktop.process(),timer=setTimeout(()=>proc.kill('SIGKILL'),5000);try{await desktop.close()}finally{clearTimeout(timer)}}
 await fs.rm(profile,{recursive:true,force:true})
}
