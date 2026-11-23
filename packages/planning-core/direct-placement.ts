import type {Project,Vec3,AvoidRegion} from './model.ts'
import {electrodeAssembly} from './electrode-frame.ts'
import {add,sub,length,scale,normalize,poseFromAxes,trajectoryAxes,electrodePaths} from './geometry.ts'
import {maximumInsertion,minimumTargetInsertion,shankLength,shaftDiameter} from './hardware.ts'
import {targetFocus,targetTolerance,inTargetRegion} from './target-region.ts'
import {settings,activeAvoidRegions,softAvoidRegions,regionClearance,recordAvoidanceFailure,type Candidate,type SearchOptions,type SearchResult} from './optimization.ts'
export const floatingArray=(e:Project['electrodes'][number]):boolean=>['utah','micro-fma'].includes(e.hardware?.presetId??'')
/** Fit an electrode independently of a chamber. Skull entry and floating-array base are distinct. */
export function searchDirect(p:Project,id:string,targetId:string,options:SearchOptions):SearchResult{
 const e=p.electrodes.find(e=>e.id===id),target=p.targets.find(t=>t.id===targetId)
 if(!e?.direct||!target)throw new Error('Choose a direct-entry electrode and a target.')
 const config=settings(p),focus=targetFocus(target),max=maximumInsertion(e),min=minimumTargetInsertion(e)
 const result:SearchResult={candidates:[],tested:0,rejectedDepth:0,rejectedMiss:0,rejectedSupport:0,rejectedFootprint:0,rejectedWall:0,rejectedAvoidance:0,rejectedOtherElectrodes:0,radiusUsed:0,minimumRequiredDepth:Infinity,maximumRequiredDepth:0,usableLength:max,minimumAllowedDepth:min}
 const points:Vec3[]=[],seen=new Set<string>(),step=Math.max(.25,config.searchStep)
 if(options.accessPoint)points.push(options.accessPoint)
 else{
  if(e.direct.preferredEntry)points.push(e.direct.preferredEntry)
  const vertices=options.surface
  if(!vertices?.length)throw new Error('Finalize a planning surface to choose skull entry locations, or use Manual and the crosshair.')
  for(let i=0;i<vertices.length;i+=3){const q:Vec3=[vertices[i],vertices[i+1],vertices[i+2]],key=q.map(v=>Math.floor(v/step)).join(',');if(!seen.has(key)){seen.add(key);points.push(q)}}
 }
 const hard=activeAvoidRegions(p),soft=softAvoidRegions(p)
 for(const entry of points){
  result.tested++
  const distance=length(sub(entry,focus));if(distance<1e-6){result.rejectedDepth++;continue}
  const outward=normalize(sub(entry,focus)),depth=floatingArray(e)?Math.min(distance,shankLength(e,e.hardware?.selectedShank??0)):distance
  result.minimumRequiredDepth=Math.min(result.minimumRequiredDepth,depth);result.maximumRequiredDepth=Math.max(result.maximumRequiredDepth,depth)
  if(depth<min-1e-8||depth>max+1e-8){result.rejectedDepth++;continue}
  let origin=floatingArray(e)?add(focus,scale(outward,depth)):entry
  const device=structuredClone(e);device.depth=depth;device.direct!.pose=poseFromAxes(origin,trajectoryAxes(outward))
  // A selected needle can be offset from the array centre; aim that actual needle.
  let assembly=electrodeAssembly(p,device)!
  for(let i=0;i<3;i++){const tip=electrodePaths(assembly.chamber,assembly.grid,device,false)[device.hardware?.selectedShank??0].tip;origin=sub(origin,sub(tip,focus));device.direct!.pose.origin=origin;assembly=electrodeAssembly(p,device)!}
  const t=electrodePaths(assembly.chamber,assembly.grid,device,false)[device.hardware?.selectedShank??0],miss=length(sub(t.tip,focus))
  if(target.region?!inTargetRegion(target,t.tip):miss>targetTolerance(target,config.maxMiss)+1e-8){result.rejectedMiss++;continue}
  const paths=electrodePaths(assembly.chamber,assembly.grid,device,false)
  const gapFor=(r:AvoidRegion):number=>Math.min(regionClearance(entry,t.tip,shaftDiameter(device),r),...paths.map(path=>regionClearance(path.entry,path.tip,shaftDiameter(device),r)))
  const conflicts=hard.map(r=>({id:r.id,name:r.name,clearance:gapFor(r)})).filter(r=>r.clearance<config.margin-1e-8)
  const softViolations=soft.map(r=>({id:r.id,name:r.name,clearance:gapFor(r)})).filter(r=>r.clearance<config.margin-1e-8)
  const candidate:Candidate={pose:device.direct!.pose,hole:[0,0],depth,miss,clearance:Math.min(Infinity,...hard.map(gapFor)),displacement:e.direct.preferredEntry?length(sub(entry,e.direct.preferredEntry)):distance,surfaceCenter:[...entry],softViolations,softPenalty:softViolations.reduce((sum,r)=>sum+config.margin-r.clearance,0)}
  if(conflicts.length){recordAvoidanceFailure(result,conflicts);result.rejectedAvoidance++;if(options.accessPoint)result.manualConflict={candidate,conflicts};continue}
  result.candidates.push(candidate)
 }
 result.candidates.sort((a,b)=>(a.softPenalty??0)-(b.softPenalty??0)||a.displacement-b.displacement||a.depth-b.depth)
 // Retain spatial diversity; there is no chamber-rim or ordinary-grid check in this workflow.
 result.candidates=result.candidates.slice(0,500)
 return result
}
export function applyDirect(p:Project,id:string,target:string,candidate:Candidate,options:SearchOptions):void{
 const valid=searchDirect(p,id,target,{...options,accessPoint:candidate.surfaceCenter}).candidates.find(c=>JSON.stringify(c)===JSON.stringify(candidate))
 if(!valid)throw new Error('This entry no longer meets the current requirements. Recompute the placement.')
 const e=p.electrodes.find(e=>e.id===id)!
 e.direct!.pose=structuredClone(valid.pose);e.direct!.unplaced=false;e.direct!.preferredEntry=[...valid.surfaceCenter!];e.depth=valid.depth;e.targetId=target
}
