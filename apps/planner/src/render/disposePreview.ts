import type { Niivue } from '@niivue/niivue'
const disposed = new WeakSet<Niivue>()
/** NiiVue cleanup removes listeners; temporary viewers must also release their GPU context. */
export function disposePreview(viewer: Niivue | null): void {
  if (!viewer || disposed.has(viewer)) return
  disposed.add(viewer)
  viewer.cleanup()
  // cleanup() only removes listeners. Drop CPU mesh/image references as well as the GPU context.
  viewer.meshes = []
  viewer.volumes = []
  viewer.drawBitmap = null
  try { viewer.gl.getExtension('WEBGL_lose_context')?.loseContext() }
  catch { /* Failed/unfinished canvas attachment has no context to release. */ }
}
