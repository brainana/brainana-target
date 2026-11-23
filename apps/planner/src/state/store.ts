import {projectSnapshot} from './projectSnapshot.ts'
import {identifyArms} from '@brainana/planning-core/measurements.ts'
import type { Project } from '@brainana/planning-core/model.ts'
import { validateProject } from '@brainana/planning-core/validation.ts'
export type ProjectListener = (project: Project | null) => void
/** Transactional edits. History contains domain state, never GPU resources or image bytes. */
export class ProjectStore {
  #project: Project | null = null
  #past: Project[] = []
  #future: Project[] = []
  #listeners = new Set<ProjectListener>()
  #editGroup: string | null = null
  get project(): Project | null {
    return this.#project ? projectSnapshot(this.#project) : null
  }
  get canUndo(): boolean {
    return this.#past.length > 0
  }
  get canRedo(): boolean {
    return this.#future.length > 0
  }
  subscribe(listener: ProjectListener): () => void {
    this.#listeners.add(listener)
    listener(this.project)
    return () => this.#listeners.delete(listener)
  }
  #emit(): void {
    for (const listener of this.#listeners) listener(this.project)
  }
  clear(): void {
    this.#project = null
    this.#past = []
    this.#future = []
    this.#editGroup = null
    this.#emit()
  }
  replace(project: Project): void {
    this.#project = projectSnapshot(validateProject(project,false))
    identifyArms(this.#project)
    this.#past = []
    this.#future = []
    this.#editGroup = null
    this.#emit()
  }
  edit(change: (draft: Project) => void, group: string | null = null): void {
    if (!this.#project) return
    const next = projectSnapshot(this.#project)
    change(next)
    next.updatedAt = new Date().toISOString()
    const checked = validateProject(next,false) // rejected edits cannot corrupt history or current state
    if (!group || group !== this.#editGroup) this.#past.push(this.#project)
    this.#editGroup = group
    if (this.#past.length > 80) this.#past.shift()
    this.#project = projectSnapshot(checked)
    this.#future = []
    this.#emit()
  }
  endGroup(): void {
    this.#editGroup = null
  }
  undo(): void {
    this.#editGroup = null
    const p = this.#past.pop()
    if (p && this.#project) {
      this.#future.push(this.#project)
      this.#project = p
      this.#emit()
    }
  }
  redo(): void {
    this.#editGroup = null
    const p = this.#future.pop()
    if (p && this.#project) {
      this.#past.push(this.#project)
      this.#project = p
      this.#emit()
    }
  }
}
