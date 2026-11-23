import { findIntersections, type IntersectionSurface } from '../render/intersections.ts'

self.onmessage = (event: MessageEvent<IntersectionSurface[]>) => {
  try { self.postMessage({ kind: 'result', value: findIntersections(event.data) }) }
  catch (error) { self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : String(error) }) }
}
