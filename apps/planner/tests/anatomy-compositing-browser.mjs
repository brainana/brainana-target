import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'
const server=await createServer({configFile:'apps/planner/vite.config.ts',server:{port:0,host:'127.0.0.1'}})
let browser
try{
 await server.listen()
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--ignore-gpu-blocklist']})
 const page=await browser.newPage({viewport:{width:800,height:600}})
 page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')console.log(m.text())})
 page.on('pageerror',e=>console.error(e))
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/anatomy-compositing.fixture.html`)
 await page.waitForFunction(()=>window.comparison,{timeout:90000})
 const result=await page.evaluate(()=>window.comparison)
 console.log(JSON.stringify(result))
 for(const row of result.results)assert.ok(row.missingFraction<.005,`Surface coverage changed at opacity ${row.opacity}`)
 for(const row of result.combined.filter(row=>row.opacity<1))assert.ok(row.obscuredFraction<.005,`Transparent MRI obscures skull at opacity ${row.opacity}`)
 assert.ok(result.combined.find(row=>row.opacity===.3).outsideVolume>100,'The MRI remains visible around the skull')
 assert.ok(result.combined.find(row=>row.opacity===1).obscuredFraction>.05,'Opaque scalp must cover bone behind it')
 assert.ok(result.hardwareResults.find(row=>row.opacity===0).green>100)
 assert.ok(result.hardwareResults.find(row=>row.opacity===.3).green>100,'Transparent MRI must retain visible hardware')
 assert.equal(result.hardwareResults.find(row=>row.opacity===1).green,0,'Opaque MRI must hide enclosed hardware')
 assert.equal(result.antialias,false)
 assert.equal(result.errors,0)
}finally{await browser?.close();await server.close()}
