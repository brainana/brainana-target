export type TaskMessage<T> = { kind: 'result'; value: T } | { kind: 'progress'; label: string } | { kind: 'error'; message: string }
export interface TaskOptions { signal?: AbortSignal; progress?: (label: string) => void }
/** A short-lived job owns its worker, abort listener and output; all exits release them. */
export function workerTask<Request, Result>(create: () => Worker, request: Request, options: TaskOptions = {}): Promise<Result> {
  if (options.signal?.aborted) return Promise.reject(new DOMException('Operation cancelled', 'AbortError'))
  return new Promise((resolve, reject) => {
    const worker = create()
    let settled = false
    const finish = (): boolean => {
      if (settled) return false
      settled = true
      options.signal?.removeEventListener('abort', abort)
      worker.terminate()
      return true
    }
    const fail = (error: Error) => { if (finish()) reject(error) }
    const abort = () => fail(new DOMException('Operation cancelled', 'AbortError'))
    options.signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<TaskMessage<Result>>) => {
      if (settled) return
      const message = event.data
      if (message.kind === 'progress') {
        try { options.progress?.(message.label) } catch(error) { fail(error instanceof Error?error:new Error(String(error))) }
        return
      }
      if (message.kind === 'error') fail(new Error(message.message))
      else if (message.kind==='result') {if(finish())resolve(message.value)}
      else fail(new Error('Invalid background operation result'))
    }
    worker.onerror = event => fail(new Error(event.message || 'Background operation failed'))
    worker.onmessageerror = () => fail(new Error('Could not read the background operation result'))
    try { worker.postMessage(request) }
    catch (error) { fail(error instanceof Error ? error : new Error(String(error))) }
  })
}
