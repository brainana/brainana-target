import type { Project } from '@brainana/planning-core/model.ts'
import type { TriangleSurface } from '@brainana/planning-core/surface-fit.ts'
import type { AssetBytes } from '../data/assets.ts'
import { runIO } from '../data/ioTasks.ts'
import type { IORequest } from '../data/ioOperations.ts'
import { withActivity } from '../ui/activity.ts'
interface ExportContext {
  project: () => Project | null
  bytes: () => AssetBytes
  surfaces: () => TriangleSurface[]
  preview: () => boolean
  screenshot: () => string
  download: (name: string, data: Uint8Array | string, type?: string) => void
  status: (message: string) => void
}
type ExportKind = Exclude<IORequest['kind'], 'open'>
export const safeProjectName = (name: string): string => name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) || 'brainana-plan'
/** Capture a coherent saved plan once; later edits cannot change an in-flight export. */
export function projectExports(context: ExportContext) {
  const jobs = new Map<ExportKind, { controller: AbortController; promise: Promise<void> }>()
  const start = async (kind: ExportKind): Promise<void> => {
    const existing = jobs.get(kind)
    if (existing) return existing.promise
    const project = context.project()
    if (!project) return
    if (kind === 'report' && context.preview()) throw new Error('Apply or cancel the placement preview before exporting a report, so the 3D picture and exported coordinates describe the same placement.')
    const name = safeProjectName(project.name)
    const payloads=kind==='project'?context.bytes():undefined
    const request: IORequest = kind === 'project' ? { kind, bundle: { project, bytes: new Map(project.assets.map(asset=>[asset.id,payloads!.get(asset.id)!])) } }
      : kind === 'geometry' ? { kind, project, surfaces: context.surfaces() }
      : kind === 'report' ? { kind, project, screenshot: context.screenshot() }
      : { kind, project }
    const title = kind === 'project' ? 'Packing portable project…' : kind === 'geometry' ? 'Exporting dimensions and mesh files…' : kind === 'report' ? 'Preparing planning report…' : 'Exporting coordinate table…'
    const controller = new AbortController()
    const promise = withActivity(title, async progress => {
      const result = await runIO(request, { signal: controller.signal, progress })
      if (controller.signal.aborted) return
      if (kind === 'project') context.download(`${name}.brainana-plan`, result as Uint8Array)
      else if (kind === 'geometry') context.download(`${name}-geometry.zip`, result as Uint8Array)
      else context.download(`${name}-${kind === 'report' ? 'report.html' : 'coordinates.csv'}`, result as string, kind === 'report' ? 'text/html' : 'text/csv')
      context.status(kind === 'project' ? 'Portable project downloaded' : kind === 'geometry' ? 'Dimensions and mesh files downloaded' : kind === 'report' ? 'Planning report downloaded' : 'Coordinate table downloaded')
    }).finally(() => { if (jobs.get(kind)?.controller === controller) jobs.delete(kind) })
    jobs.set(kind, { controller, promise })
    return promise
  }
  return {
    save: () => start('project'), geometry: () => start('geometry'), coordinates: () => start('coordinates'), report: () => start('report'),
    cancel: () => { for (const job of jobs.values()) job.controller.abort(); jobs.clear() },
  }
}
