import { performIO, type IORequest } from './ioOperations.ts'
self.onmessage = async (event: MessageEvent<IORequest>) => {
  try {
    const value = await performIO(event.data, label => self.postMessage({ kind: 'progress', label }))
    const buffers = new Set<ArrayBuffer>()
    if (value instanceof Uint8Array && value.buffer instanceof ArrayBuffer) buffers.add(value.buffer)
    else if (typeof value === 'object' && 'bytes' in value)
      for (const bytes of value.bytes.values()) if (bytes.buffer instanceof ArrayBuffer) buffers.add(bytes.buffer)
    self.postMessage({ kind: 'result', value }, {transfer:[...buffers]})
  } catch (error) { self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : String(error) }) }
}
