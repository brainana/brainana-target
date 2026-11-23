import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
/** Serve the built frontend through browser routing; no listener or network permission is required. */
export async function serveOffline(page) {
  const root=fileURLToPath(new URL('../dist/',import.meta.url))
  await page.route('http://127.0.0.1:5183/**',async route=>{
    const url=new URL(route.request().url())
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:{app:'BrainanaTarget',version:'test',unbound:true,capabilities:{},sources:[],runtimeMetadata:{}}})
    const name=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)))
    if(!name.startsWith(root))return route.abort()
    try {const body=await fs.readFile(name);const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.wasm':'application/wasm'}[path.extname(name)]??'application/octet-stream';await route.fulfill({body,contentType:mime})} catch {await route.fulfill({status:404,body:'Not found'})}
  })
}
