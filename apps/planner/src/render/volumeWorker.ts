import type { VolumeSampler } from './volume.ts'
export interface WorkerVolume {
  dims: number[]
  values: ArrayLike<number>
  matrix: ArrayLike<number>
  slope: number
  intercept: number
}
type Response<Result> = { error: string } | { result: Result } | { progress: string }
interface Session { worker: Worker; pending: boolean; abort?: () => void }
/** One worker per editor source. Reuse pixels between completed updates; cancel in-flight work. */
export function volumeWorker<Request extends object, Result>(create: () => Worker, fallback: (volume: VolumeSampler, request: Request) => Result, label: string) {
  const sessions = new WeakMap<VolumeSampler, Session>()
  const dispose = (volume: VolumeSampler): void => {
    const session = sessions.get(volume)
    if (!session) return
    session.abort?.()
    session.worker.terminate()
    sessions.delete(volume)
  }
  const build = async (volume: VolumeSampler, request: Request, signal?: AbortSignal, additionalSource?: () => object): Promise<Result> => {
    if (signal?.aborted) throw new DOMException('Surface update cancelled', 'AbortError')
    const done = typeof document==='undefined'?Object.assign(()=>{},{update:(_label:string)=>{}}):(await import('../ui/activity.ts')).beginActivity(label)
    try {
      if(signal?.aborted)throw new DOMException('Surface update cancelled','AbortError')
      if (typeof Worker === 'undefined') return fallback(volume, request)
      if (sessions.get(volume)?.pending) dispose(volume)
      let session = sessions.get(volume)
      const source: WorkerVolume | undefined = session ? undefined : {
        dims: volume.dims, values: volume.values, matrix: volume.worldToVoxel,
        slope: volume.slope, intercept: volume.intercept,
      }
      if (!session) { session = { worker: create(), pending: false }; sessions.set(volume, session) }
      const active = session
      active.pending = true
      return await new Promise<Result>((resolve, reject) => {
        const finish = (terminate: boolean) => {
          signal?.removeEventListener('abort', abort)
          active.pending = false
          active.abort = undefined
          if (terminate) { active.worker.terminate(); sessions.delete(volume) }
        }
        const abort = () => { finish(true); reject(new DOMException('Surface update cancelled', 'AbortError')) }
        active.abort = abort
        signal?.addEventListener('abort', abort, { once: true })
        active.worker.onmessage = (event: MessageEvent<Response<Result>>) => {
          if ('progress' in event.data) { done.update(event.data.progress); return }
          finish(false)
          if ('error' in event.data) reject(Error(event.data.error))
          else resolve(event.data.result)
        }
        active.worker.onerror = event => { finish(true); reject(Error(event.message || 'Surface worker failed')) }
        try { active.worker.postMessage({ source, ...(source?additionalSource?.():undefined), ...request }) }
        catch (error) { finish(true); reject(error instanceof Error ? error : Error(String(error))) }
      })
    } finally { done() }
  }
  return { build, dispose }
}
