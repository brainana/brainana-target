import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {_electron as electron,expect} from '@playwright/test'
const binary=process.env.PLANNER_DESKTOP_BINARY,project=process.env.PLANNER_REACH_PROJECT
if(!binary||!project)throw Error('Set PLANNER_DESKTOP_BINARY and PLANNER_REACH_PROJECT to an unplaced Plexon 50/25 mm regression project')
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'brainana-feedback-'))
let desktop
try{
 desktop=await electron.launch({executablePath:binary,args:['--desktop-test-profile',profile],timeout:60000})
 await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1700,1050))
 const page=await desktop.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open saved chamber / project…',exact:true}).click();await(await chooser).setFiles(project)
 await expect(page.locator('.project-title')).not.toHaveText('No project loaded')
 await page.locator('button[data-feature="positioning"]').click()
 await page.getByLabel('Maximum alternative grid tilt (°)',{exact:true}).fill('20');await page.getByLabel('Maximum alternative grid tilt (°)',{exact:true}).press('Tab')
 await page.getByRole('button',{name:'Top',exact:true}).click()
 await page.getByRole('button',{name:'Choose skull location to fit',exact:true}).click()
 await page.getByLabel('Three-dimensional anatomy and chamber',{exact:true}).click()
 const feedback=page.locator('.placement-failure-panel')
 await expect(feedback).toBeVisible({timeout:30000})
 await expect(feedback).toContainText('Total physical shaft length50.00 mm')
 await expect(feedback).toContainText('Reserved above insertion plane25.00 mm')
 await expect(feedback).toContainText('Usable shaft length25.00 mm')
 await expect(feedback).toContainText('Counts identify the first failed check')
 await feedback.getByRole('button',{name:'Review reinforcement / reserved length',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Configure electrode hardware',exact:true}),reinforcement=dialog.getByLabel('Reinforcement tube length (mm)',{exact:true})
 await expect(reinforcement).toBeVisible();await expect(reinforcement).toBeFocused();await expect(reinforcement).toHaveValue('25')
 await reinforcement.fill('20');await reinforcement.press('Tab')
 await dialog.getByRole('button',{name:'Cancel configuration',exact:true}).click()
 await expect(feedback).toContainText('Usable shaft length25.00 mm')
 await feedback.getByRole('button',{name:'Review electrode length',exact:true}).click()
 await expect(dialog.getByLabel('Tip to connector length (mm)',{exact:true})).toBeFocused()
 await dialog.getByRole('button',{name:'Cancel configuration',exact:true}).click()
 if(process.env.PLANNER_FEEDBACK_SCREENSHOT)await page.screenshot({path:process.env.PLANNER_FEEDBACK_SCREENSHOT})
 await feedback.getByRole('button',{name:'Review chamber height',exact:true}).click()
 await expect(page.locator('button[data-feature="chamber"]')).toHaveClass(/active/)
 await expect(page.getByLabel('Chamber height (mm)',{exact:true})).toBeFocused();await expect(page.getByLabel('Chamber height (mm)',{exact:true})).toHaveValue('6')
 assert.deepEqual(errors,[])
 console.log('Packaged placement feedback: real project failure, total/reserved/usable explanation, exact electrode/reinforcement and chamber control jumps, draft Cancel preserving reach, and no renderer errors passed.')
}finally{
 if(desktop){const proc=desktop.process(),timer=setTimeout(()=>proc.kill('SIGKILL'),5000);try{await desktop.close()}finally{clearTimeout(timer)}}
 await fs.rm(profile,{recursive:true,force:true})
}
