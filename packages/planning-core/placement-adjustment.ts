import {
  add, axes, electrodePaths, gridFitsChamber, gridHoleClearance, gridHoles, gridSeatHeight,
  guideTubePath, scale, trajectory,
} from './geometry.ts'
import { gridCompatibility, maximumInsertion, minimumTargetInsertion, shaftDiameter, shankDepth, shankLength } from './hardware.ts'
import type { Chamber, Electrode, Grid, Project, Vec3 } from './model.ts'
import { activeAvoidRegions, clearance, regionClearance, searchTarget, segmentDistance, settings, softAvoidRegions } from './optimization.ts'
import { alignChamberToSurface, chamberBaseEnd, fitChamberBase, type TriangleSurface } from './surface-fit.ts'
import { inTargetRegion, targetRegionApproach, targetTolerance } from './target-region.ts'

const epsilon = 1e-8

export function maximumSeatedTilt(chamber: Chamber, grid: Grid): number {
  const wall = chamber.baseFit ? Math.min(...chamber.baseFit.innerDepths) : chamber.height
  const seat = gridSeatHeight(chamber, grid)
  const available = grid.seating === 'manual' ? (seat < -wall - epsilon ? 0 : -seat) : wall
  return Math.min(89, Math.atan(Math.max(0, available - (grid.minimumThickness ?? 0)) / (2 * chamber.innerRadius)) * 180 / Math.PI)
}

interface Path {
  start: Vec3
  end: Vec3
  radius: number
}

function occupiedPaths(chamber: Chamber, grid: Grid, electrode: Electrode): Path[] {
  const paths = electrodePaths(chamber, grid, electrode, false).map((path, i) => ({
    start: add(path.entry, scale(path.direction, -Math.max(0, shankLength(electrode, i) - shankDepth(electrode, i)))),
    end: path.tip,
    radius: shaftDiameter(electrode) / 2,
  }))
  const tube = guideTubePath(chamber, grid, electrode)
  if (tube) paths.push({ ...tube, radius: electrode.guideTube!.outerDiameter / 2 })
  return paths
}

interface Fit {
  device: Electrode
  paths: Path[]
  gridId: string
  soft: number
  changedHole: boolean
  miss: number
}

function canShare(a: Fit, b: Fit): boolean {
  if (a.gridId === b.gridId && a.device.hole[0] === b.device.hole[0] && a.device.hole[1] === b.device.hole[1]) return false
  return !a.paths.some(x => b.paths.some(y =>
    segmentDistance(x.start, x.end, y.start, y.end) < x.radius + y.radius - epsilon,
  ))
}

/** Refit all linked targets without changing the chamber or the requested guide geometry. */
export function refitChamberTrajectories(project: Project, chamberId: string, fixedElectrodeId?: string): number {
  const chamber = project.chambers.find(item => item.id === chamberId)
  if (!chamber || chamber.placementState === 'unplaced') return 0
  const grids = project.grids.filter(grid => grid.chamberId === chamberId)
  const devices = project.electrodes.filter(e => !e.direct && grids.some(g => g.id === e.gridId))
  const affected = devices.filter(e => e.targetId || e.id === fixedElectrodeId)
  if (grids.some(grid => !gridFitsChamber(chamber, grid)))
    throw new Error('The grid must fit below the chamber lip and above its shortest wall. Reduce the tilt or change the seating.')
  const config = settings(project)
  const hard = activeAvoidRegions(project), soft = softAvoidRegions(project)
  const choices = affected.map(device => {
    const original = grids.find(grid => grid.id === device.gridId)!
    const grid = gridCompatibility(device).available ? original : { ...original, enabled: false }
    const target = project.targets.find(t => t.id === device.targetId)
    const fixed = device.id === fixedElectrodeId
    const holes = fixed ? [device.hole] : gridHoles(chamber, grid)
    const fits: Fit[] = []
    for (const hole of holes) {
      const approach = target && !fixed ? targetRegionApproach(chamber, grid, hole, target, device) : { depth: device.depth, miss: 0 }
      if (approach.depth < minimumTargetInsertion(device) - epsilon || approach.depth > maximumInsertion(device) + epsilon) continue
      if (target && approach.miss > targetTolerance(target, config.maxMiss) + epsilon) continue
      const fitted = { ...device, hole, depth: approach.depth }
      if (fixed && target) {
        const { tip } = trajectory(chamber, grid, fitted)
        if (target.region ? !inTargetRegion(target, tip) : Math.hypot(...tip.map((x, i) => x - target.point[i])) > config.maxMiss + epsilon) continue
      }
      if (gridHoleClearance(chamber, grid, fitted, hole, approach.depth) < -epsilon) continue
      if (clearance(project, chamber, grid, fitted, hard) < config.margin - epsilon) continue
      const softGap = clearance(project, chamber, grid, fitted, soft)
      fits.push({
        device: fitted, paths: occupiedPaths(chamber, grid, fitted), gridId: grid.id,
        soft: Math.max(0, config.margin - softGap), miss: approach.miss,
        changedHole: hole[0] !== device.hole[0] || hole[1] !== device.hole[1],
      })
    }
    if (!fits.length) throw new Error(target
      ? `No usable guide path reaches ${target.name} with ${device.name} at this setting. Check the chamber wall, insertion range, and areas to avoid.`
      : `${device.name} would hit the chamber wall, exceed its insertion range, or cross an area to avoid.`)
    return fits.sort((a, b) => a.soft - b.soft || Number(a.changedHole) - Number(b.changedHole) || a.miss - b.miss || a.device.depth - b.device.depth)
  }).sort((a, b) => a.length - b.length)
  const selected: Fit[] = []
  let remaining = 20000
  function assign(index: number): boolean {
    if (index === choices.length) return true
    for (const fit of choices[index]) {
      if (--remaining < 0) return false
      if (!selected.every(other => canShare(fit, other))) continue
      selected.push(fit)
      if (assign(index + 1)) return true
      selected.pop()
    }
    return false
  }
  if (!assign(0)) throw new Error(remaining < 0
    ? 'The joint hole search reached its limit. Try a smaller angle change or fit the electrodes individually.'
    : 'The linked electrodes would share a guide hole or collide. Try a different angle or mounting point.')
  for (const { device } of selected) {
    const original = project.electrodes.find(e => e.id === device.id)!
    original.hole = [...device.hole]
    original.depth = device.depth
  }
  return selected.length
}

export interface MountingSurface {
  source: 'brain' | 'skull'
  assetIds: string[]
  surfaces: TriangleSurface[]
}

/** Build a complete proposed move at the selected site. The caller reviews it before saving. */
export function refitChamberAt(project: Project, chamberId: string, point: Vec3, normal: Vec3, surface: MountingSurface): Project {
  if (settings(project).mode === 'existing') throw new Error('The implanted chamber has a fixed measured pose.')
  if (!surface.surfaces.length) throw new Error('Finalize a planning surface before choosing a new mounting point.')
  const proposed = structuredClone(project)
  const index = proposed.chambers.findIndex(c => c.id === chamberId)
  const chamber = proposed.chambers[index]
  if (!chamber) throw new Error('Choose a chamber to move.')
  const gridIds = new Set(proposed.grids.filter(g => g.chamberId === chamberId).map(g => g.id))
  const seed = proposed.electrodes.find(e => !e.direct && e.targetId && gridIds.has(e.gridId))
  if (!seed) {
    const aligned = alignChamberToSurface({ ...chamber, pose: { ...chamber.pose, origin: add(point, scale(normal, .1)) } }, surface.surfaces)
    if (chamber.mounting && chamber.mounting !== 'custom') {
      const sample = fitChamberBase({ ...aligned, mounting: 'custom' }, surface.surfaces, surface.source, surface.assetIds)
      const rim = [...sample.innerDepths, ...sample.outerDepths]
      const shift = chamber.mounting === 'cut' ? chamber.height - Math.max(...rim) : chamber.height + .5 - Math.min(...rim)
      aligned.pose.origin = add(aligned.pose.origin, scale(axes(aligned.pose)[2], shift))
    }
    aligned.baseFit = fitChamberBase(aligned, surface.surfaces, surface.source, surface.assetIds)
    proposed.chambers[index] = aligned
    if (activeAvoidRegions(proposed).some(region => regionClearance(aligned.pose.origin, chamberBaseEnd(aligned),
      2 * (aligned.innerRadius + aligned.wallThickness), region) < settings(proposed).margin - epsilon))
      throw new Error('The chamber overlaps an area to avoid at this point.')
    refitChamberTrajectories(proposed, chamberId)
    return proposed
  }
  const result = searchTarget(proposed, seed.id, seed.targetId!, {
    supportSurfaces: surface.surfaces, supportSource: surface.source, supportAssetIds: surface.assetIds,
    accessPoint: point, maximumLocalGridTilt: 0, manualPreference: 'surface', refitDependents: true,
  })
  let reason = result.manualConflict?.conflicts.length
    ? 'The fitted chamber or trajectory would overlap an area to avoid.'
    : result.supportReason ?? 'No tested chamber orientation had both a supported rim and a usable path to the target.'
  for (const candidate of result.candidates) {
    if (!candidate.baseFit) continue
    proposed.chambers[index] = { ...chamber, pose: candidate.pose, baseFit: candidate.baseFit }
    try {
      refitChamberTrajectories(proposed, chamberId)
      return proposed
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error)
    }
  }
  throw new Error(reason)
}
