/** Browser File/Blob and WebCrypto snapshot their input; avoid a redundant JS-side copy first. */
export function bytesView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes)
}
