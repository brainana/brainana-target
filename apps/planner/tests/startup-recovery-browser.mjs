import {chromium,expect} from '@playwright/test'
import {spawn} from 'node:child_process'
const server=spawn(process.execPath,['apps/planner/server.mjs','--port','0','--token','local-startup-test'],{stdio:['ignore','pipe','inherit']})
let browser
try{
 const url=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Test server start timed out')),7000)
  server.once('error',error=>{clearTimeout(timer);reject(error)})
  server.once('exit',code=>{clearTimeout(timer);reject(new Error('Test server exited: '+code))})
  server.stdout.on('data',d=>{const m=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0])}})
 })
 browser=await chromium.launch({channel:'chrome',headless:true})
 const page=await browser.newPage()
 const blockBundle=route=>route.abort()
 await page.route('**/assets/*.js',blockBundle)
 await page.goto(url)
 await expect(page.getByRole('heading',{name:'Plan targeting',exact:true})).toBeVisible()
 await expect(page.getByRole('link',{name:'Evaluate placement'})).toBeVisible()
 await expect(page.getByRole('alert')).toContainText('The workspace could not start')
 await page.unroute('**/assets/*.js',blockBundle)
 await page.route('**/assets/main-*.js',blockBundle)
 await page.reload()
 await expect(page.getByRole('alert')).toContainText('The workspace could not start')
 await expect(page.getByRole('link',{name:'Evaluate placement'})).toBeVisible()
 console.log('Home remains visible with the entry script blocked; navigation shows recovery with the entry or planning chunk blocked.')
}finally{await browser?.close();server.kill()}
