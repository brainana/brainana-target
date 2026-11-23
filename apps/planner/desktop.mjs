import { runDesktop } from '@brainana/core-desktop/main.mjs'
import { viewerManifestProvider } from '@brainana/brainana-data/manifest.mjs'
import { app, dialog } from 'electron'
import { APP_VERSION, BUILD_ID } from '@brainana/core-server/version.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

app.setName('BrainanaTarget')
const profileFlag = process.argv.indexOf('--desktop-test-profile')
if (profileFlag >= 0 && process.argv[profileFlag + 1]) app.setPath('userData', path.resolve(process.argv[profileFlag + 1]))
app.setAboutPanelOptions({ applicationName: 'BrainanaTarget', applicationVersion: APP_VERSION, copyright: 'Brainana' })

// A local navigation or renderer failure must be visible even when the web UI cannot paint.
app.on('browser-window-created', (_event, window) => {
  window.webContents.on('will-prevent-unload', event => {
    const response = dialog.showMessageBoxSync(window, {
      type: 'question', title: 'Close BrainanaTarget?',
      message: 'Work is still running or changes have not finished saving.',
      detail: 'Keep working to wait for completion, or close now. Changes that have not been saved may be lost.',
      buttons: ['Keep working', 'Close now'], defaultId: 0, cancelId: 0,
    })
    // In Electron, preventing this event explicitly allows the requested close/reload.
    if (response === 1) event.preventDefault()
  })
  let reporting=false
  const recover=async(message,detail)=>{
    if(reporting||window.isDestroyed())return
    reporting=true
    window.show()
    try{
      const {response}=await dialog.showMessageBox(window,{
        type:'error',title:'BrainanaTarget',message,detail,
        buttons:['Reload app','Quit'],defaultId:0,cancelId:1,
      })
      if(window.isDestroyed())return
      if(response===0)window.webContents.reloadIgnoringCache()
      else app.quit()
    }finally{reporting=false}
  }
  window.webContents.on('did-fail-load',(_event,code,description,_url,mainFrame)=>{
    if(mainFrame&&code!==-3)void recover('BrainanaTarget could not load its local page.',description).catch(console.error)
  })
  window.webContents.on('render-process-gone',(_event,details)=>{
    if(details.reason!=='clean-exit')void recover('The BrainanaTarget window stopped responding.',`Renderer: ${details.reason}. Reloading does not erase your saved projects.`).catch(console.error)
  })
})

runDesktop({
  manifestProvider: viewerManifestProvider,
  appLabel: 'BrainanaTarget',
  cacheApp: 'BrainanaTarget',
  appIcon: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : fileURLToPath(new URL('./build/icon.png', import.meta.url)),
  cacheRoot: path.join(app.getPath('userData'), 'cache'),
  appVersion: { version: APP_VERSION, buildId: BUILD_ID },
  distRoot: fileURLToPath(new URL('./dist/', import.meta.url)),
  preferredPort: 5183,
  runtimeMetadata: {
    demoDatasetRoot: app.isPackaged ? path.join(process.resourcesPath, 'demo_viewer') : fileURLToPath(new URL('../../datasets/demo_viewer/', import.meta.url)),
  },
}).catch((error) => {
  console.error('BrainanaTarget launch failed:', error)
  process.exitCode = 1
})
