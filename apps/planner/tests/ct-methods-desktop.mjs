import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { NVImage } from '@niivue/niivue'
import { createAsset } from '../src/data/assets.ts'
import { createProject } from '@brainana/planning-core/model.ts'
import { packProject, unpackProject } from '../src/data/archive.ts'

const binary = process.env.PLANNER_DESKTOP_BINARY
if (!binary) throw new Error('Set PLANNER_DESKTOP_BINARY to the packaged application.')
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'brainana-ct-methods-'))
const dims = [32,32,32], values = new Float32Array(32**3)
for (let z=0;z<32;z++) for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
  const r = Math.hypot((x-16)*.5,(y-16)*.5,(z-16)*.5)
  values[x+y*32+z*1024] = r>4&&r<5 ? 1000 : r<6.5 ? 100 : 0
}
const data = NVImage.createNiftiArray(dims,[.5,.5,.5],[.5,0,0,-8,0,.5,0,-8,0,0,.5,-8,0,0,0,1],16,new Uint8Array(values.buffer))
const mri = await createAsset('Reference-MRI.nii','anatomy','test-frame',data)
mri.modality = 'mri'
const ct = await createAsset('Aligned-CT.nii','ct','test-frame',data)
ct.modality = 'ct'
const project = createProject(mri,'CT method regression',{kind:'standalone',subject:null,scan:null,sourceRoot:null})
project.assets.push(ct)
const bytes = new Map([[mri.id,data],[ct.id,data]])
let desktop
try {
  desktop = await electron.launch({ executablePath: binary, args: ['--desktop-test-profile', profile], timeout: 60000 })
  console.log('Desktop process launched')
  desktop.process().stderr.on('data', text => { if (process.env.PLANNER_RENDER_DEBUG) process.stderr.write(text) })
  const page = await desktop.firstWindow()
  console.log('Desktop window ready')
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('console', message => { if (process.env.PLANNER_RENDER_DEBUG && ['error','warning'].includes(message.type())) console.log(message.text()) })
  page.on('pageerror', error => errors.push(error.message))
  const openProject = async (payload, home=false) => {
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button',{name:home?'Open saved chamber / project…':'Open project',exact:true}).click()
    await (await chooser).setFiles({name:'ct-methods.brainana-plan',mimeType:'application/zip',buffer:Buffer.from(payload)})
    await expect(page.locator('.project-title')).toHaveText(project.name)
    await expect(page.locator('.welcome')).toBeHidden()
  }
  await openProject(await packProject(project,bytes),true)
  console.log('CT and MRI fixture opened')
  await page.locator('button[data-feature="surface"]').click()
  await page.getByRole('button',{name:'Open surface editor…',exact:true}).click()
  const editor = page.getByRole('dialog',{name:'Planning surface editor'})
  const source = editor.getByLabel('Planning source',{exact:true})
  await expect(source).toHaveValue(ct.id)
  await expect(source.locator('option:checked')).toHaveText('CT bone threshold · Aligned-CT.nii')
  console.log('Surface editor opened')
  const method = editor.getByLabel('CT surface method',{exact:true})
  await expect(method).toHaveValue('smooth')
  const finalize = editor.getByRole('button',{name:'Finalize surface',exact:true})
  await expect(finalize).toBeEnabled({timeout:30000})
  const threshold = editor.getByLabel('Bone threshold value',{exact:true})
  const canvas = editor.getByLabel('CT surface review Axial · R/A',{exact:true})
  console.log('Initial mesh ready')
  await threshold.fill('120')
  await threshold.press('Tab')
  await expect(finalize).toBeEnabled()
  const low = await canvas.screenshot()
  await threshold.fill('500')
  await threshold.press('Tab')
  await expect(finalize).toBeEnabled()
  await expect.poll(async () => !(await canvas.screenshot()).equals(low)).toBe(true)
  const overlay = editor.getByLabel('Highlight voxels above bone threshold',{exact:true})
  const filled = await canvas.screenshot()
  await overlay.uncheck()
  assert.ok(!(await canvas.screenshot()).equals(filled))
  await overlay.check()
  console.log('Threshold and voxel highlight updates passed')
  await editor.locator('.surface-editor-controls').evaluate(element => { element.scrollTop=element.scrollHeight })
  await expect(source).toBeInViewport()
  await source.selectOption('mri:'+mri.id)
  await expect(editor.getByLabel('Bone threshold value',{exact:true})).toHaveCount(0)
  await expect(editor.getByRole('button',{name:'Load brain mask…',exact:true})).toBeVisible()
  console.log('MRI tools selected')
  await source.selectOption(ct.id)
  await expect(method).toHaveValue('smooth')
  await expect(threshold).toHaveValue('500')
  await expect(finalize).toBeEnabled()
  await method.selectOption('outer')
  await expect(editor.getByRole('button',{name:'Set inner reference from crosshair',exact:true})).toBeVisible()
  await expect(finalize).toBeEnabled()
  await method.selectOption('smooth')
  await expect(editor.getByRole('button',{name:'Set inner reference from crosshair',exact:true})).toHaveCount(0)
  await expect(finalize).toBeEnabled()
  console.log('Finalizing CT mesh')
  await finalize.click()
  await expect(editor).toHaveCount(0)
  await expect(page.locator('.surface-finalized-notice')).toHaveText(/Surface finalized.*Active for placement/)
  const savedPath=path.join(profile,'ct-methods.brainana-plan')
  await desktop.evaluate(({session},file)=>{
    session.defaultSession.once('will-download',(_event,item)=>{item.setSavePath(file)})
  },savedPath)
  await page.getByRole('button',{name:'Save project',exact:true}).click()
  await expect.poll(async()=>{try{return (await fs.stat(savedPath)).size}catch{return 0}}).toBeGreaterThan(10000)
  const archived = new Uint8Array(await fs.readFile(savedPath))
  const saved = await unpackProject(archived)
  assert.equal(saved.project.assets.find(a=>a.id===ct.id).imageDisplay.skull.representation,'smooth')
  assert.equal(saved.project.assets.find(a=>a.id===ct.id).imageDisplay.skull.threshold,500)
  assert.deepEqual(saved.project.planningSurfaceIds,[ct.id])
  console.log('Direct mesh portable recipe saved')
  await openProject(archived)
  await page.locator('button[data-feature="surface"]').click()
  await page.getByRole('button',{name:'Open surface editor…',exact:true}).click()
  await expect(method).toHaveValue('smooth')
  await expect(finalize).toBeEnabled()
  await method.selectOption('outer')
  await expect(finalize).toBeEnabled()
  await finalize.click()
  await page.getByRole('button',{name:'Open surface editor…',exact:true}).click()
  await expect(method).toHaveValue('outer')
  await expect(finalize).toBeEnabled()
  await page.getByText('Autosaved locally', { exact: true }).waitFor({ timeout: 30000 })
  assert.deepEqual(errors,[])
  if (process.env.PLANNER_CT_SCREENSHOT) await page.screenshot({path:process.env.PLANNER_CT_SCREENSHOT})
  console.log('Packaged CT editor: CT/MRI isolation, visible source picker, threshold changes, voxel highlights, both mesh methods, finalization and saved recipe reopen passed.')
} catch (error) {
  console.error(error)
  throw error
} finally {
  if (desktop) {
    const child = desktop.process()
    const forceClose = setTimeout(() => child.kill('SIGKILL'), 5000)
    try { await desktop.close() } finally { clearTimeout(forceClose) }
  }
  await fs.rm(profile,{recursive:true,force:true})
}
