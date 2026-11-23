import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {chromium,expect} from '@playwright/test'
import {NVImage} from '@niivue/niivue'
import {unpackProject} from '../src/data/archive.ts'

const browser=await chromium.launch({
 ...(process.env.PLANNER_HEADLESS_SHELL?{}:{channel:'chrome'}),
 headless:true,
 args:['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist'],
})
const url=process.env.PLANNER_TEST_URL||'http://127.0.0.1:5183',errors=[]
const page=await browser.newPage({viewport:{width:1500,height:1000}})
const tab=(name,p=page)=>p.locator(`button[data-feature="${name}"]`)
const click=(name,p=page)=>p.getByRole('button',{name,exact:true}).click()
const label=(name,p=page)=>p.getByLabel(name,{exact:true})
const set=async(name,value,p=page)=>{await label(name,p).fill(value);await label(name,p).press('Tab')}
const open=async(p,label,archive)=>{const choose=p.waitForEvent('filechooser');await click(label,p);await (await choose).setFiles(archive)}
const start=async p=>{p.on('pageerror',e=>errors.push(e.message));await p.goto(url)}
const save=async()=>{
 const pending=page.waitForEvent('download');await click('Save project')
 const bytes=await readFile(await (await pending).path())
 return {bytes,bundle:await unpackProject(new Uint8Array(bytes))}
}
try{
 await start(page);await click('Try the macaque demo')
 await expect(page.locator('.welcome')).toBeHidden({timeout:45000})
 await tab('targets').click();await click('Add target at crosshair')
 await tab('chamber').click()
 await label('Bore / inner diameter (mm)').fill('10')
 await label('Wall thickness (mm)').fill('2')
 await label('Chamber height (mm)').fill('8')
 await label('Define a guide grid').check()
 await label('Grid tilt relative to chamber (°)').fill('30')
 await click('Save chamber specifications')
 let saved=await save()
 assert.equal(saved.bundle.project.chambers[0].placementState,'unplaced')
 assert.equal(saved.bundle.project.grids[0].tiltAngle,30)
 await tab('positioning').click()
 await page.getByText('Measured chamber position and surface fit — advanced',{exact:true}).click()
 await expect(page.getByRole('button',{name:'Move chamber in 3D',exact:true})).toBeDisabled()
 await set('R (mm)','4')
 await click('Use these measurements for placement')
 await expect(page.getByRole('button',{name:'Move chamber in 3D',exact:true})).toBeEnabled()
 await set('Depth from grid plane (mm)','35.125')
 await expect(page.getByText('Autosaved locally',{exact:true})).toBeVisible()
 saved=await save()
 assert.equal(saved.bundle.project.targets.length,1)
 assert.equal(saved.bundle.project.chambers[0].pose.origin[0],4)
 assert.equal(saved.bundle.project.chambers[0].placementState,undefined)
 assert.equal(saved.bundle.project.electrodes[0].depth,35.125)
 const restored=await browser.newPage({viewport:{width:1500,height:1000}})
 await start(restored)
 await open(restored,'Open saved chamber / project…',{name:'demo.brainana-plan',mimeType:'application/zip',buffer:saved.bytes})
 await expect(restored.locator('.welcome')).toBeHidden({timeout:45000})
 await tab('positioning',restored).click()
 await expect(label('Depth from grid plane (mm)',restored)).toHaveValue('35.125')
 await expect(restored.getByText('Autosaved locally',{exact:true})).toBeVisible()
 await restored.reload()
 await click('Resume previous autosave',restored)
 await expect(restored.locator('.welcome')).toBeHidden({timeout:45000})
 await tab('positioning',restored).click()
 await expect(label('Depth from grid plane (mm)',restored)).toHaveValue('35.125')
 const fresh=await browser.newPage()
 await start(fresh)
 const phantom=NVImage.createNiftiArray([32,32,32],[1,1,1],undefined,2,Uint8Array.from({length:32**3},(_,i)=>i%256))
 await open(fresh,'Load reference MRI…',{name:'phantom.nii',mimeType:'application/octet-stream',buffer:Buffer.from(phantom)})
 await expect(fresh.locator('.project-title')).toHaveText('phantom')
 await tab('targets',fresh).click();await click('Add target at crosshair',fresh)
 assert.deepEqual(errors,[])
 console.log('Planner browser: demo, unplaced and measured chamber, grid tilt, insertion editing, portable save/reopen, autosave restore, and standalone NIfTI import passed.')
}catch(error){console.error('Browser errors:',errors);throw error}finally{await browser.close()}
