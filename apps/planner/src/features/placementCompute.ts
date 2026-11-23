import { refitChamberAt } from '@brainana/planning-core/placement-adjustment.ts'
import type { RefitRequest } from './targetingWorker.ts'
import {searchDirect,applyDirect} from '@brainana/planning-core/direct-placement.ts'
import {workerTask} from '../workers/task.ts'
import { searchTarget, applyCandidate, type Candidate, type SearchOptions, type SearchResult } from '@brainana/planning-core/optimization.ts'
import type { Project } from '@brainana/planning-core/model.ts'
import { withActivity } from '../ui/activity.ts'

export function placementCompute(project: Project, electrode: string, target: string, options: SearchOptions, candidate?: Candidate, signal?: AbortSignal): Promise<SearchResult | Project> {
  if (signal?.aborted) return Promise.reject(new DOMException('Placement cancelled', 'AbortError'))
  if (typeof Worker === 'undefined') {
    try {
      if (candidate) { (project.electrodes.find(e=>e.id===electrode)?.direct?applyDirect:applyCandidate)(project, electrode, target, candidate, options); return Promise.resolve(project) }
      return Promise.resolve((project.electrodes.find(e=>e.id===electrode)?.direct?searchDirect:searchTarget)(project, electrode, target, options))
    } catch (error) { return Promise.reject(error instanceof Error ? error : new Error(String(error))) }
  }
  const label = candidate ? 'Validating and applying placement…' : options.accessPoint ? 'Fitting chamber and grid at chosen skull location…' : 'Computing feasible placement areas…'
  return withActivity(label, progress => workerTask(
    () => new Worker(new URL('./targetingWorker.ts', import.meta.url), { type: 'module' }),
    { project, electrode, target, options, candidate }, { signal, progress },
  ))
}


export function computeChamberMove(request: RefitRequest, signal: AbortSignal): Promise<Project> {
  return withActivity('Refitting chamber and electrode trajectories…', progress => {
    if (signal.aborted) throw new DOMException('Placement cancelled', 'AbortError')
    if (typeof Worker === 'undefined') return refitChamberAt(request.project, request.chamberId, request.point, request.normal, request.surface)
    return workerTask(() => new Worker(new URL('./targetingWorker.ts', import.meta.url), { type: 'module' }),
      request, { signal, progress })
  })
}
