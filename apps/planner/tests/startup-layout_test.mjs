import assert from 'node:assert/strict'
// Keep the real NiiVue getters: the startup regression was hidden by GL mocks.
globalThis.window = {devicePixelRatio:1,addEventListener(){},location:{protocol:'http:'}}
const {NiiVuePlanningScene}=await import('../src/render/scene.ts')
const scene=new NiiVuePlanningScene({}, {})
assert.throws(()=>scene.slices.gl,/unable to get WebGL context/)
assert.equal(scene.attached,false)
for(const mode of ['cardinal','row','column','axial','coronal','sagittal']) {
  assert.doesNotThrow(()=>scene.setSliceLayout(mode),'Layout selection must be safe before canvas attachment')
}
// A failed attachment must leave layout controls safe to initialize/retry.
scene.slices.attachToCanvas=async()=>{throw Error('Canvas unavailable')}
scene.render.attachToCanvas=async()=>{}
await assert.rejects(scene.attach(),/Canvas unavailable/)
assert.equal(scene.attached,false)
assert.doesNotThrow(()=>scene.setSliceLayout('cardinal'))
console.log('Startup layout: real NiiVue context getter, all pre-attach layouts, and failed attachment passed.')
