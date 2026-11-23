import {targetRegionApproach,targetTolerance,targetFocus} from './target-region.ts'
import { minimumTargetInsertion,gridCompatibility } from './hardware.ts'
import { aimGridPose, fitElectrode,gridHoleClearance,gridHoles } from './geometry.ts'
import { clearance, settings } from './optimization.ts'
import { targetsForElectrode } from './electrode-frame.ts'
import type { Project } from './model.ts'

/** Shared target commands keep panel actions atomic and independent of the renderer. */
export function fitTarget(d: Project, electrodeId: string, targetId: string, aim = false): void {
  const e = d.electrodes.find((x) => x.id === electrodeId)!
  let g = d.grids.find((x) => x.id === e.gridId)!
  if(!gridCompatibility(e).available)g={...g,enabled:false}
  const c = d.chambers.find((x) => x.id === g.chamberId)!
  const target = targetsForElectrode(d, e).find(x => x.id === targetId)
  if (!target) throw new Error('Assign this target to the chamber before fitting it.')
  if (aim && settings(d).mode === 'existing')
    throw new Error('Existing chamber mode keeps the chamber pose fixed. Search its grid holes instead.')
  const pose = aim ? aimGridPose(c.pose,g, targetFocus(target)) : c.pose
  const fit=target.region?gridHoles(c,g).map(hole=>({hole,...targetRegionApproach({...c,pose},g,hole,target,e)})).filter(f=>gridHoleClearance({...c,pose},g,e,f.hole,f.depth)>=-1e-8).sort((a,b)=>a.miss-b.miss||a.depth-b.depth)[0]:fitElectrode({ ...c, pose }, g, e, target.point)
  if(!fit||!Number.isFinite(fit.miss))throw new Error('No reachable guide path enters the valid target region.')
  if (fit.depth < minimumTargetInsertion(e))
    throw new Error(
      'The probe tip would remain inside the guide tube. Retract or shorten the tube, or revise the placement.',
    )
  if (fit.miss > targetTolerance(target,settings(d).maxMiss) + 1e-8)
    throw new Error(
      'The nearest hole exceeds the allowed target miss. Run the constrained search or revise placement.',
    )
  const chamber = { ...c, pose }
  if (
    d.electrodes.some(
      (other) =>
        other.gridId === g.id &&
        clearance(d, chamber, g, other.id === e.id ? { ...other, hole: fit.hole, depth: fit.depth } : other) <
          settings(d).margin - 1e-8,
    )
  )
    throw new Error(
      'The path from the current chamber origin crosses a marked avoidance region. Aiming only rotates the chamber. Use Find chamber placements around restrictions to search other origins (or Find trajectories through existing chamber in existing mode).',
    )
  if(gridHoleClearance({...c,pose},g,e,fit.hole,fit.depth)<-1e-8)throw new Error('This guide hole intersects the chamber wall. Choose a usable hole or revise the grid angle.')
  c.pose = pose
  e.hole = fit.hole
  e.depth = fit.depth
  e.targetId = target.id
}
