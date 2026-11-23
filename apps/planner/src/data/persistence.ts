import { validateProject } from '@brainana/planning-core/validation.ts'
import type { ProjectBundle } from './archive.ts'
import { verifyAssets } from './assets.ts'
export interface ProjectPersistence {
  save(bundle: ProjectBundle): Promise<void>
  clear(): Promise<void>
  load(): Promise<ProjectBundle | null>
}
/** One transaction replaces project and payloads together; a partial autosave is never restored. */
export class IndexedDbPersistence implements ProjectPersistence {
  #db: Promise<IDBDatabase>
  constructor() {
    this.#db = new Promise((resolve, reject) => {
      const req = indexedDB.open('brainana-planner-v1', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('workspace')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
    })
  }
  async save(bundle: ProjectBundle): Promise<void> {
    const db = await this.#db
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('workspace', 'readwrite')
      tx.objectStore('workspace').put(bundle, 'current')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('Autosave aborted'))
    })
  }
  async clear(): Promise<void> {
    const db = await this.#db
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('workspace', 'readwrite')
      tx.objectStore('workspace').delete('current')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Could not clear saved workspace'))
      tx.onabort = () => reject(tx.error ?? new Error('Could not clear saved workspace'))
    })
  }
  async load(): Promise<ProjectBundle | null> {
    const db = await this.#db
    const bundle = await new Promise<ProjectBundle | undefined>((resolve, reject) => {
      const req = db.transaction('workspace').objectStore('workspace').get('current')
      req.onsuccess = () => resolve(req.result as ProjectBundle | undefined)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
    })
    if (!bundle) return null
    const project = validateProject(bundle.project)
    if (!(bundle.bytes instanceof Map)) throw new Error('Autosave asset storage is invalid')
    await verifyAssets(project.assets, bundle.bytes)
    return { project, bytes: bundle.bytes }
  }
}
/** Serialize writes even if an older save is slower. A failed write does not poison the queue. */
export class SaveQueue {
  #tail: Promise<void> = Promise.resolve()
  private readonly persistence: ProjectPersistence
  constructor(persistence: ProjectPersistence) {
    this.persistence = persistence
  }
  clear(): Promise<void> {
    const next = this.#tail.catch(() => {}).then(() => this.persistence.clear())
    this.#tail = next
    return next
  }
  save(bundle: ProjectBundle): Promise<void> {
    const snapshot = structuredClone(bundle)
    const next = this.#tail.catch(() => {}).then(() => this.persistence.save(snapshot))
    this.#tail = next
    return next
  }
}
