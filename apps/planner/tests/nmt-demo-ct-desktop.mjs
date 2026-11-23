import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {_electron as electron,expect} from '@playwright/test'
import {unpackProject} from '../src/data/archive.ts'
const binary=process.env.PLANNER_DESKTOP_BINARY
if(!binary)throw new Error('Set PLANNER_DESKTOP_BINARY')
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'brainana-demo-ct-'))
let desktop
try{
 desktop=await electron.launch({executablePath:binary,args:['--desktop-test-profile',profile],timeout:60000})
 await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1700,1050))
 const page=await desktop.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.getByRole('button',{name:'Try the macaque demo',exact:true}).click()
 await page.locator('.welcome').waitFor({state:'hidden',timeout:60000})
 const imageSelect=page.getByLabel('Anatomical image',{exact:true}),ctName='MEBRAINS CT estimate (warped to NMT2Sym).nii.gz'
 const option=imageSelect.getByRole('option',{name:'CT · '+ctName,exact:true});await expect(option).toHaveCount(1)
 const ctId=await option.getAttribute('value');assert.ok(ctId)
 await expect(page.getByLabel('Blend other MRI and CT images',{exact:true})).toBeChecked()
 await expect(page.locator('.asset-derivation')).toContainText('population CT estimate')
 const canvas=page.getByLabel('Cardinal anatomy slices',{exact:true})
 const blended=await canvas.screenshot()
 await page.getByRole('button',{name:'Image layers',exact:true}).click()
 const layers=page.getByRole('dialog',{name:'Image layers'}),toggle=layers.getByLabel('Show '+ctName,{exact:true})
 await expect(toggle).toBeChecked();await toggle.uncheck()
 await expect.poll(async()=>!(await canvas.screenshot()).equals(blended)).toBe(true)
 await toggle.check();await layers.getByRole('button',{name:'Close Image layers',exact:true}).click()
 await imageSelect.selectOption(ctId);await expect(imageSelect).toHaveValue(ctId)
 await page.getByLabel('Blend other MRI and CT images',{exact:true}).uncheck()
 await expect(page.getByLabel('Blend other MRI and CT images',{exact:true})).not.toBeChecked()
 if(process.env.PLANNER_DEMO_CT_SCREENSHOT)await page.screenshot({path:process.env.PLANNER_DEMO_CT_SCREENSHOT})
 await page.locator('button[data-feature="surface"]').click()
 await page.getByRole('button',{name:'Open surface editor…',exact:true}).click()
 const editor=page.getByRole('dialog',{name:'Planning surface editor',exact:true})
 await expect(editor.getByLabel('Planning source',{exact:true})).toHaveValue(ctId)
 await expect(editor.locator('.asset-derivation')).toContainText('does not independently validate skull anatomy')
 await expect(editor.getByRole('button',{name:'Finalize surface',exact:true})).toBeEnabled({timeout:30000})
 await expect(editor.locator('.surface-preview-footer')).not.toContainText('Bone reaches')
 if(process.env.PLANNER_DEMO_CT_SURFACE_SCREENSHOT)await editor.screenshot({path:process.env.PLANNER_DEMO_CT_SURFACE_SCREENSHOT})
 const topCrop=editor.getByLabel('S crop maximum (mm) value',{exact:true})
 await topCrop.fill('41.875');await topCrop.dispatchEvent('change')
 await expect(editor.locator('.surface-preview-footer')).toContainText('Bone reaches the selected crop',{timeout:30000})
 await expect(editor.locator('.surface-preview-footer')).toContainText('S maximum (41.88 mm)')
 await editor.getByRole('button',{name:'Reset crop',exact:true}).click()
 await expect(editor.getByRole('button',{name:'Finalize surface',exact:true})).toBeEnabled({timeout:30000})
 await expect(editor.locator('.surface-preview-footer')).not.toContainText('Bone reaches')
 const close=editor.getByRole('button',{name:'Close Planning surface editor',exact:true});await close.click()
 const saved=path.join(profile,'demo-with-ct.brainana-plan')
 await desktop.evaluate(({session},saved)=>session.defaultSession.once('will-download',(_event,item)=>item.setSavePath(saved)),saved)
 await page.getByRole('button',{name:'Save project',exact:true}).click()
 await expect.poll(async()=>{try{return(await fs.stat(saved)).size}catch{return 0}},{timeout:30000}).toBeGreaterThan(100)
 const bundle=await unpackProject(new Uint8Array(await fs.readFile(saved))),ct=bundle.project.assets.find(a=>a.id===ctId)
 assert.equal(ct.role,'ct');assert.equal(ct.modality,'ct');assert.ok(bundle.bytes.get(ctId)?.length>1e6);assert.match(ct.derivation.description,/population CT estimate/);assert.deepEqual(bundle.project.planningSurfaceIds,[])
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open project',exact:true}).click();await(await chooser).setFiles(saved)
 await page.locator('button[data-feature="images"]').click()
 await expect(imageSelect.getByRole('option',{name:'CT · '+ctName,exact:true})).toHaveCount(1)
 await expect(page.locator('.asset-derivation')).toContainText('population CT estimate')
 assert.deepEqual(errors,[])
 console.log('Packaged NMT demo: expanded aligned CT, default slice blending, CT-only viewing, live CT surface preview, crown crop warnings/reset, derivation/source labels and portable save/reopen passed; no renderer errors.')
}finally{
 if(desktop){const proc=desktop.process(),timer=setTimeout(()=>proc.kill('SIGKILL'),5000);try{await desktop.close()}finally{clearTimeout(timer)}}
 await fs.rm(profile,{recursive:true,force:true})
}
