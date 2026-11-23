import { targetsForElectrode } from './electrode-frame.ts'
import type {Project,Chamber,Grid,Electrode} from './model.ts'
import {gridHoleClearance} from './geometry.ts'
import {minimumTargetInsertion,maximumInsertion} from './hardware.ts'
import {targetRegionApproach,targetTolerance} from './target-region.ts'
export function assessHole(p:Project,c:Chamber,g:Grid,e:Electrode,hole:[number,number]){
 const targets=targetsForElectrode(p,e)
 const target=targets.find(t=>t.id===e.targetId)??(targets.length===1?targets[0]:undefined)
 const approach=target?targetRegionApproach(c,g,hole,target,e):{depth:e.depth,miss:Infinity}
 const wallClear=gridHoleClearance(c,g,e,hole,approach.depth)>=-1e-8
 return {...approach,wallClear,hitsTarget:!!target&&wallClear&&approach.depth>=minimumTargetInsertion(e)&&approach.depth<=maximumInsertion(e)&&approach.miss<=targetTolerance(target,p.planning?.maxMiss??.5)+1e-8,target}
}
