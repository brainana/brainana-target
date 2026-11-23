import { workerTask, type TaskOptions } from '../workers/task.ts'
import type { IORequest, IOResults } from './ioOperations.ts'
/** Source image buffers are copied into the job, never transferred out of the live project. */
export async function runIO<R extends IORequest>(request: R, options: TaskOptions = {}): Promise<IOResults[R['kind']]> {
  if (options.signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError')
  if (typeof Worker !== 'undefined')
    return workerTask(() => new Worker(new URL('./ioWorker.ts', import.meta.url), { type: 'module' }), request, options)
  const { performIO } = await import('./ioOperations.ts')
  if (options.signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError')
  return await performIO(request, options.progress) as IOResults[R['kind']]
}
export const readProject = (archive: Uint8Array, options?: TaskOptions) => runIO({ kind: 'open', archive }, options)
