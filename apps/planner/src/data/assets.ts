import {bytesView} from './buffers.ts'
import type { Asset } from '@brainana/planning-core/model.ts'
import { newId } from '@brainana/planning-core/model.ts'
export type AssetBytes = Map<string, Uint8Array>
export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytesView(bytes))
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join('')
}
export async function createAsset(
  name: string,
  role: Asset['role'],
  frameId: string,
  bytes: Uint8Array,
  sourcePath: string | null = null,
): Promise<Asset> {
  return { id: newId(), name, role, frameId, sha256: await hashBytes(bytes), sourcePath }
}
export async function verifyAssets(assets: Asset[], bytes: AssetBytes): Promise<void> {
  for (const asset of assets) {
    const data = bytes.get(asset.id)
    if (!data) throw new Error(`Missing image/model: ${asset.name}`)
    if ((await hashBytes(data)) !== asset.sha256)
      throw new Error(`Image/model checksum mismatch: ${asset.name}`)
  }
}
