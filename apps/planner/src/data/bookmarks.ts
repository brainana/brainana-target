import type { Project, Target, Vec3 } from '@brainana/planning-core/model.ts'
import { newId } from '@brainana/planning-core/model.ts'

interface ViewerReport {
  dataset?: { subjectId?: string; scan?: { id?: string } }
  files?: Array<{ path?: string; role?: string }>
  bookmarks?: Array<{ label?: string; readout?: ViewerPoint }>
  current?: { readout?: ViewerPoint | null }
}
interface ViewerPoint { mm?: unknown; atlases?: Array<{ name?: string; label?: string; region?: string }> }

export function viewerCoordinates(input: unknown, project: Project): { targets: Target[]; matches: boolean; frameProblem?: string } {
  if (!input || typeof input !== 'object') throw new Error('Invalid viewer report')
  const report = input as ViewerReport
  const ref = project.assets.find(a => a.id === project.frame.referenceAssetId)
  const subjectMatches = project.provenance.kind === 'brainana' && report.dataset?.subjectId === project.provenance.subject
    && report.dataset?.scan?.id === project.provenance.scan
  const referenceMatches = !!ref?.sourcePath && Array.isArray(report.files)
    && report.files.some(f => f?.path === ref.sourcePath && f.role === 'base volume')
  const frameProblem = !subjectMatches ? 'Viewer report subject/scan does not match this project'
    : !referenceMatches ? 'Viewer report uses a different reference volume' : undefined
  const entries = Array.isArray(report.bookmarks) ? [...report.bookmarks] : []
  if (report.current?.readout?.mm) entries.push({ label: 'Report crosshair', readout: report.current.readout })
  if (!entries.length) throw new Error('No bookmarks found')
  const targets = entries.map((bookmark, i) => {
    const point = bookmark?.readout?.mm
    if (!Array.isArray(point) || point.length !== 3 || !point.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 10000))
      throw new Error(`Invalid coordinate for point ${i + 1}`)
    const region = Array.isArray(bookmark.readout?.atlases) && bookmark.readout.atlases.find(a => typeof a?.name === 'string' && (typeof a.region === 'string' || typeof a.label === 'string'))
    return {
      id: newId(), name: typeof bookmark.label === 'string' && bookmark.label.trim() ? bookmark.label.trim().slice(0, 120) : `Point ${i + 1}`,
      point: [...point] as Vec3, frameId: project.frame.id, color: '#f4c877',
      atlas: region ? { name: region.name!, label: typeof region.region === 'string' ? region.region : region.label! } : null,
    }
  })
  return { targets, matches: !frameProblem, frameProblem }
}

export function importBookmarks(input: unknown, project: Project): Target[] {
  const result = viewerCoordinates(input, project)
  if (result.frameProblem) throw new Error(result.frameProblem)
  return result.targets
}
