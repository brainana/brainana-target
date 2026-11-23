import {minimumInsertion} from './hardware.ts'
import type { Project, Electrode, Chamber, Grid, Vec3 } from './model.ts'
import { newId } from './model.ts'
/** An insertion reference frame. Direct entry has no stored or rendered chamber/grid. */
export function electrodeAssembly(project: Project, electrode: Electrode): { chamber: Chamber; grid: Grid } | null {
  if (electrode.direct) {
    const chamber: Chamber = { id: `entry:${electrode.id}`, name: 'Skull entry', frameId: project.frame.id, pose: electrode.direct.pose, innerRadius: 100, wallThickness: 0, height: 0, ...(electrode.direct.unplaced ? { placementState: 'unplaced' as const } : {}) }
    return { chamber, grid: { id: '', name: 'Direct entry', chamberId: chamber.id, enabled: false, spacing: 1, count: 1, rotation: 0 } }
  }
  const grid = project.grids.find(g => g.id === electrode.gridId), chamber = project.chambers.find(c => c.id === grid?.chamberId)
  return grid && chamber ? { grid, chamber } : null
}
export function setDirectEntry(electrode: Electrode, point: Vec3 = [0, 0, 0]): void {
  electrode.direct ??= { pose: { origin: [...point], angles: [0, 0, 0] }, unplaced: true }
  electrode.gridId = ''; electrode.hole = [0, 0]; delete electrode.guideTube
}
export function addDirectElectrode(project: Project, point: Vec3 = [0, 0, 0]): Electrode {
  const e: Electrode = { id: newId(), name: `Electrode ${project.electrodes.length + 1}`, gridId: '', hole: [0, 0], depth: 0, length: 150, diameter: .3, contactCount: 1, contactSpacing: 1, contactLength: .05, color: '#67d9d1', targetId: null }
  e.depth=minimumInsertion(e)
  setDirectEntry(e, point); project.electrodes.push(e); return e
}
export const directPlanning = (p: Project | null): boolean => p?.planningIntent === 'direct' || p?.planningIntent === 'headpost-direct'

export function targetsForElectrode(project: Project, electrode: Electrode): Project['targets'] {
  const ids = electrodeAssembly(project, electrode)?.chamber.targetIds
  return ids?.length ? project.targets.filter(target => ids.includes(target.id)) : project.targets
}
