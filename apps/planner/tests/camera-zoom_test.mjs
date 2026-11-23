import assert from 'node:assert/strict'
import {Niivue} from '@niivue/niivue'
import {installRenderZoom,zoomRender,panCamera} from '../src/render/camera.ts'
globalThis.window={devicePixelRatio:1}
const viewer=new Niivue();viewer.drawScene=()=>{}
for(let i=0;i<30;i++)viewer.sliceScroll3D(-1)
assert.equal(viewer.scene.volScaleMultiplier,.5,'Reproduce the native zoom-out floor')
installRenderZoom(viewer)
for(let i=0;i<60;i++)viewer.sliceScroll3D(-1)
assert.ok(viewer.scene.volScaleMultiplier<.001,'Scroll continues below the old floor')
const before=viewer.scene.volScaleMultiplier
zoomRender(viewer,.8);assert.equal(viewer.scene.volScaleMultiplier,before*.8)
viewer.sliceScroll3D(1);assert.equal(viewer.scene.volScaleMultiplier,before*.8*1.1,'Zoom-in is relative, without snapping to a floor')
for(const factor of [0,-1,NaN,Infinity]){const old=viewer.scene.volScaleMultiplier;zoomRender(viewer,factor);assert.equal(viewer.scene.volScaleMultiplier,old)}
viewer.volumes=[{}];viewer.uiData.activeClipPlaneIndex=0;viewer.scene.clipPlaneDepthAziElevs[0][0]=0
let depth=null;viewer.setClipPlane=value=>{depth=value[0]}
const scale=viewer.scene.volScaleMultiplier
viewer.sliceScroll3D(1)
assert.equal(depth,.025);assert.equal(viewer.scene.volScaleMultiplier,scale,'Native clip-plane adjustment is retained')
const camera={pivot3D:[0,0,0],furthestFromPivot:100,scene:{volScaleMultiplier:1}}
const normalPan=panCamera(camera,1,0)[0];camera.scene.volScaleMultiplier=.0001
assert.ok(Math.abs(panCamera(camera,1,0)[0]*.0001-normalPan)<1e-9,'Panning keeps its screen-relative speed at wide zoom')
console.log('Reproduced native 50% floor; extended wheel/button zoom, relative reverse zoom, finite positive scale and native clip scrolling passed.')
