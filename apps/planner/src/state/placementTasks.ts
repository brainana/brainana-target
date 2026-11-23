import type { Project } from '@brainana/planning-core/model.ts'
import { placementInputs } from './placementPreview.ts'
interface PlacementTask {
  signal: AbortSignal
  current: (project: Project | null) => boolean
  finish: () => void
  cancel: () => void
}
const tasks = new WeakMap<object, PlacementTask>()
/** Only the latest request for unchanged planning geometry may publish a result. */
export function beginPlacementTask(owner: object, project: Project): PlacementTask {
  cancelPlacementTask(owner)
  const controller = new AbortController(), key = placementInputs(project)
  const task: PlacementTask = {
    signal: controller.signal,
    current: current => tasks.get(owner) === task && !controller.signal.aborted && !!current && placementInputs(current) === key,
    finish: () => { if (tasks.get(owner) === task) tasks.delete(owner) },
    cancel: () => { controller.abort(); task.finish() },
  }
  tasks.set(owner, task)
  return task
}
export function cancelPlacementTask(owner: object): void { tasks.get(owner)?.cancel() }
export function invalidatePlacementTask(owner: object, project: Project | null): void {
  const task = tasks.get(owner)
  if (task && !task.current(project)) task.cancel()
}
