import type { Project } from '@brainana/planning-core/model.ts'
import type { TriangleSurface } from '@brainana/planning-core/surface-fit.ts'
import { packProject, unpackProject, type ProjectBundle } from './archive.ts'
import { coordinateCsv, planReport } from './export.ts'
import { geometryBundle } from './geometryExport.ts'
export type IORequest =
  | { kind: 'geometry'; project: Project; surfaces: TriangleSurface[] }
  | { kind: 'project'; bundle: ProjectBundle }
  | { kind: 'open'; archive: Uint8Array }
  | { kind: 'coordinates'; project: Project }
  | { kind: 'report'; project: Project; screenshot: string | null }
export interface IOResults { geometry: Uint8Array; project: Uint8Array; open: ProjectBundle; coordinates: string; report: string }
export async function performIO(request: IORequest, progress: (label: string) => void = () => {}): Promise<IOResults[IORequest['kind']]> {
  switch (request.kind) {
    case 'geometry': return geometryBundle(request.project, request.surfaces, progress)
    case 'project': return packProject(request.bundle.project, request.bundle.bytes, progress)
    case 'open': progress('Reading and checking project files…'); return unpackProject(request.archive)
    case 'coordinates': progress('Writing coordinate table…'); return coordinateCsv(request.project)
    case 'report': progress('Building report and checking placement clearances…'); return planReport(request.project, request.screenshot)
  }
}
