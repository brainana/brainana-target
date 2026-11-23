import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {_electron as electron,expect} from '@playwright/test'
import {NVImage} from '@niivue/niivue'
import {createProject} from '@brainana/planning-core/model.ts'
import {createStereotax} from '@brainana/planning-core/stereotaxSetup.ts'
import {alignmentStatus} from '@brainana/planning-core/calibration.ts'
import {toolStatus} from '@brainana/planning-core/armCalibration.ts'
import {createAsset} from '../src/data/assets.ts'
import {packProject,unpackProject} from '../src/data/archive.ts'
const binary=process.env.PLANNER_DESKTOP_BINARY
if(!binary)throw new Error('Set PLANNER_DESKTOP_BINARY')
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'brainana-calibration-'))
const values=Uint8Array.from({length:32**3},(_,i)=>Math.hypot(i%32-16,Math.floor(i/32)%32-16,Math.floor(i/1024)-16)<11?190:0)
const data=NVImage.createNiftiArray([32,32,32],[1,1,1],[1,0,0,-16,0,1,0,-16,0,0,1,-16,0,0,0,1],2,values)
const asset=await createAsset('Calibration-MRI.nii','anatomy','frame',data);asset.modality='mri'
const project=createProject(asset,'Calibration desktop',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
project.species='rat';project.planningIntent='chamber';project.stereotax=createStereotax('rat',[0,0,0])
project.landmarks=[[0,0,0],[10,0,0],[0,10,0],[1,2,3]].map((point,i)=>({id:'f'+i,name:'Fiducial '+(i+1),frameId:'frame',point}))
project.targets=[{id:'target',name:'Planned target',frameId:'frame',point:[2,3,4],color:'#ff0000',atlas:null}]
let desktop
try{
 desktop=await electron.launch({executablePath:binary,args:['--desktop-test-profile',profile],timeout:60000})
 await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1600,1000))
 const page=await desktop.firstWindow();page.setDefaultTimeout(15000)
 const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.log('Page error:',error.message)})
 const open=async(payload,home=false)=>{
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:home?'Open saved chamber / project…':'Open project',exact:true}).click()
  await(await chooser).setFiles({name:'calibration.brainana-plan',mimeType:'application/zip',buffer:Buffer.from(payload)})
  await expect(page.locator('.project-title')).toHaveText(project.name)
  await page.locator('button[data-feature="stereotax"]').click()
 }
 const download=async(name,click)=>{
  const file=path.join(profile,name);await desktop.evaluate(({session},file)=>session.defaultSession.once('will-download',(_event,item)=>item.setSavePath(file)),file)
  await click();await expect.poll(async()=>{try{return(await fs.stat(file)).size}catch{return 0}},{timeout:30000}).toBeGreaterThan(100);return file
 }
 await open(await packProject(project,new Map([[asset.id,data]])),true)
 const panel=page.locator('.measurement-panel'),alignment=page.locator('.calibration-panel')
 await panel.getByRole('button',{name:'Alignment',exact:true}).click()
 await expect(panel.locator('.measurement-workspace')).toBeHidden()
 await alignment.getByRole('button',{name:'Calculate alignment',exact:true}).click()
 await expect(alignment.getByRole('alert')).toContainText('At least three')
 const frames=[[10,20,30],[10,30,30],[0,20,30],[8,21,34]]
 for(let i=0;i<4;i++){
  await alignment.getByLabel('Image fiducial',{exact:true}).selectOption(JSON.stringify({kind:'landmark',id:'f'+i}))
  await alignment.getByLabel('Fiducial pair name',{exact:true}).fill('Pair '+(i+1))
  for(const [j,axis] of ['X / ML','Y / AP','Z / DV'].entries())await alignment.getByLabel('New fiducial '+axis,{exact:true}).fill(String(frames[i][j]))
  if(i===3)await alignment.getByLabel('New fiducial role',{exact:true}).selectOption('check')
  await alignment.getByRole('button',{name:'Add fiducial pair',exact:true}).click()
 }
 await expect(alignment.locator('.fiducial-pair')).toHaveCount(4)
 await alignment.getByRole('button',{name:'Calculate alignment',exact:true}).click()
 await expect(alignment.locator('.calibration-residuals')).toContainText('0.000 mm (3 points)')
 await expect(alignment.locator('.calibration-residuals')).toContainText('1.000 mm (1 point)')
 await expect(alignment.getByRole('button',{name:'Apply alignment',exact:true})).toBeEnabled()
 await alignment.getByRole('button',{name:'Apply alignment',exact:true}).click()
 await expect(alignment.locator('.calibration-status')).toContainText('Applied alignment is current')
 await expect(alignment.locator('.calibrated-coordinates')).toContainText('7.000 / 22.000 / 34.000 mm')
 await alignment.locator('.fiducial-pair').filter({hasText:'Pair 4'}).getByText('Edit / locate point',{exact:true}).click()
 await alignment.getByLabel('Pair 4 Z / DV',{exact:true}).fill('35');await alignment.getByLabel('Pair 4 Z / DV',{exact:true}).press('Tab')
 await expect(alignment.locator('.calibration-status')).toContainText('Applied alignment is current')
 await expect(alignment.locator('.calibration-residuals')).toContainText('2.000 mm (1 point)')
 // Editing a fit point invalidates calibrated readouts; Undo restores the original alignment.
 await alignment.locator('.fiducial-pair').filter({hasText:'Pair 1'}).getByText('Edit / locate point',{exact:true}).click()
 await alignment.getByLabel('Pair 1 X / ML',{exact:true}).fill('11');await alignment.getByLabel('Pair 1 X / ML',{exact:true}).press('Tab')
 await expect(alignment.locator('.calibration-status')).toContainText('Alignment needs checking')
 await expect(alignment.locator('.calibrated-coordinates')).toContainText('Apply a current alignment first')
 await page.getByRole('button',{name:'Undo',exact:true}).click()
 await expect(alignment.locator('.calibration-status')).toContainText('Applied alignment is current')
 const bounds=await alignment.boundingBox();assert.ok(bounds.width>200&&bounds.width<700)
 const overflow=await alignment.evaluate(el=>el.scrollWidth>el.clientWidth+2);assert.equal(overflow,false,'Alignment fields must stay inside the sidebar')
 await alignment.locator('.calibrated-coordinates').scrollIntoViewIfNeeded()
 if(process.env.PLANNER_CALIBRATION_SCREENSHOT)await page.screenshot({path:process.env.PLANNER_CALIBRATION_SCREENSHOT})
 await panel.getByRole('button',{name:'Tools',exact:true}).click()
 const tools=page.locator('.tool-calibration-panel')
 await tools.getByText('Set tool offset and zero',{exact:true}).click()
 await tools.getByLabel('Arm 1 tip offset Z / DV',{exact:true}).fill('-15')
 await tools.getByLabel('Arm 1 current reading X / ML',{exact:true}).fill('10')
 await tools.getByLabel('Arm 1 current reading Y / AP',{exact:true}).fill('20')
 await tools.getByLabel('Arm 1 current reading Z / DV',{exact:true}).fill('30')
 await tools.getByLabel('Arm 1 positive Z / DV',{exact:true}).selectOption('-1')
 await tools.getByRole('button',{name:'Record tool and readings',exact:true}).click()
 await expect(tools.locator('.tool-readout').first()).toContainText('10.000 / 20.000 / 30.000 mm')
 // Model slide changes preserve calibration and update recorded instrument readings live.
 await panel.getByRole('button',{name:'Configure stereotax…',exact:true}).click()
 const rigDialog=page.getByRole('dialog',{name:'Stereotaxic setup',exact:true})
 await rigDialog.getByLabel('Stage Z offset (mm) value',{exact:true}).first().fill('2')
 await expect(tools.locator('.tool-readout').first()).toContainText('10.000 / 20.000 / 28.000 mm')
 await rigDialog.getByRole('button',{name:'Apply frame',exact:true}).click()
 await rigDialog.getByRole('button',{name:'Close Stereotaxic setup',exact:true}).click()
 await expect(tools.getByLabel('Arm 1 current reading Z / DV',{exact:true})).toHaveValue('28')
 await panel.getByRole('button',{name:'Configure stereotax…',exact:true}).click()
 await rigDialog.getByLabel('Tool tilt X from vertical (°) value',{exact:true}).first().fill('12')
 await expect(tools.locator('.tool-readout').first()).toContainText('Tool setup changed')
 await rigDialog.getByRole('button',{name:'Close Stereotaxic setup',exact:true}).click()
 await expect(tools.locator('.tool-readout').first()).toContainText('10.000 / 20.000 / 28.000 mm')
 await panel.getByRole('button',{name:'Measurements',exact:true}).click()
 await expect(panel.getByLabel('Measure from',{exact:true})).toContainText('Arm 1 working tip')
 const saved=await download('calibrated.brainana-plan',()=>page.getByRole('button',{name:'Save project',exact:true}).click())
 const bytes=new Uint8Array(await fs.readFile(saved)),savedProject=(await unpackProject(bytes)).project
 assert.equal(alignmentStatus(savedProject),'current');assert.equal(toolStatus(savedProject.stereotax,savedProject.stereotax.arms[0]),'current')
 assert.deepEqual(savedProject.targets,project.targets,'Applying a frame alignment must not move anatomy/implant points')
 assert.deepEqual(savedProject.stereotax.arms[0].toolCalibration.tipOffsetMm,[0,0,-15])
 await open(bytes)
 await panel.getByRole('button',{name:'Alignment',exact:true}).click()
 await expect(alignment.locator('.calibrated-coordinates')).toContainText('7.000 / 22.000 / 34.000 mm')
 const csv=await download('calibration.csv',()=>alignment.getByRole('button',{name:'Export calibration CSV',exact:true}).click());assert.match(await fs.readFile(csv,'utf8'),/"current"/)
 console.log('Planner: UI pairing, rigid alignment, independent checks, stale readout suppression/Undo, tool offsets/zeros, coordinate CSV and save/reopen passed')
 await page.getByText('Autosaved locally',{exact:true}).waitFor({timeout:30000})
 await page.getByRole('link',{name:'← Home',exact:true}).click();await page.getByRole('link',{name:'Evaluate placement',exact:true}).click()
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open saved plan…',exact:true}).click();await(await chooser).setFiles(saved)
 await expect(page.getByRole('status').filter({hasText:'Loaded '+project.name})).toBeVisible()
 await page.getByRole('navigation',{name:'Evaluation sections'}).getByRole('button',{name:'Stereotax',exact:true}).click()
 await panel.getByRole('button',{name:'Alignment',exact:true}).click()
 await expect(alignment.locator('.calibrated-coordinates')).toContainText('7.000 / 22.000 / 34.000 mm')
 await alignment.locator('.fiducial-pair').filter({hasText:'Pair 4'}).getByText('Edit / locate point',{exact:true}).click()
 await alignment.getByLabel('Pair 4 Z / DV',{exact:true}).fill('36');await alignment.getByLabel('Pair 4 Z / DV',{exact:true}).press('Tab')
 await expect(alignment.locator('.calibration-residuals')).toContainText('3.000 mm (1 point)')
 const evalFile=await download('evaluation-calibrated.brainana-plan',()=>panel.getByRole('button',{name:'Save project with measurements',exact:true}).click())
 const ep=(await unpackProject(new Uint8Array(await fs.readFile(evalFile)))).project;assert.equal(alignmentStatus(ep),'current');assert.equal(ep.frameCalibration.pairs[3].framePoint[2],36)
 assert.deepEqual(errors,[])
 console.log('Evaluation: shared MRI-only alignment, independent checks and portable calibration save passed; no renderer errors')
}finally{
 if(desktop){const proc=desktop.process(),timer=setTimeout(()=>proc.kill('SIGKILL'),5000);try{await desktop.close()}finally{clearTimeout(timer)}}
 await fs.rm(profile,{recursive:true,force:true})
}
