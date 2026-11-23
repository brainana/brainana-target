import { refitChamberTrajectories } from './placement-adjustment.ts'
import { targetsForElectrode } from './electrode-frame.ts'
import {connectorAvoidance} from './connectors.ts'
import {targetRegionApproach,targetTolerance,targetFocus} from './target-region.ts'
import {headpostAvoidance} from './headposts.ts'
import {seatedGridHeight,gridFitsChamber} from './geometry.ts'
import {patchDistance} from './surface-patch.ts'
import { currentOpening } from './surface-openings.ts'
import { openingAvoidRegions } from './surface-openings.ts'
import { SurfaceRayIndex } from './surface-rays.ts'
import { fitChamberBase, alignChamberToSurface, type TriangleSurface } from './surface-fit.ts'
import {
  gridCompatibility,
  minimumTargetInsertion,
  maximumInsertion,
  shaftDiameter,
  hardwareFitsBore,
  shankOffsets,
} from './hardware.ts'
import type { AvoidRegion, Chamber, Electrode, Grid, PlanningSettings, Project, Vec3 } from './model.ts'
import {
  add,
  axes,
  aimGridPose,
  gridVector,gridHoleClearance,poseFromAxes,normalize,cross,
  dot,
  gridHoles,
  length,
  scale,
  sub,
  electrodePaths,
  holeLocal,
  localToWorld,
  trajectoryAxes,
  guideTubePath,
} from './geometry.ts'

export function activeAvoidRegions(p: Project) {
  const ids = p.planning?.avoidRegionIds
  const selected = ids === undefined ? p.avoidRegions ?? [] : (p.avoidRegions ?? []).filter(r => ids.includes(r.id))
  return [...selected.filter(r=>(r.constraint??'hard')==='hard'),...openingAvoidRegions(p),...headpostAvoidance(p),...connectorAvoidance(p)]
}
export function softAvoidRegions(p:Project):AvoidRegion[]{
  const ids=p.planning?.avoidRegionIds
  return [...(p.avoidRegions??[]).filter(r=>r.constraint==='soft'&&(ids===undefined||ids.includes(r.id))),...openingAvoidRegions(p,'soft')]
}
export function settings(p: Project): PlanningSettings {
  return p.planning ?? { mode: 'new', seed: null, searchRadius: 10, searchStep: 2, maxMiss: 0.5, margin: 1 }
}
/** Exact closest distance between finite segments, including parallel/degenerate cases. */
export function segmentDistance(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const u = sub(b, a),
    v = sub(d, c),
    w = sub(a, c)
  const aa = dot(u, u),
    bb = dot(u, v),
    cc = dot(v, v),
    dd = dot(u, w),
    ee = dot(v, w)
  const clamp = (n: number): number => Math.max(0, Math.min(1, n))
  let s = 0,
    t = 0
  if (aa < 1e-12) t = cc > 1e-12 ? clamp(ee / cc) : 0
  else if (cc < 1e-12) s = clamp(-dd / aa)
  else {
    const denominator = aa * cc - bb * bb
    s = denominator > 1e-12 ? clamp((bb * ee - cc * dd) / denominator) : 0
    t = (bb * s + ee) / cc
    if (t < 0) {
      t = 0
      s = clamp(-dd / aa)
    } else if (t > 1) {
      t = 1
      s = clamp((bb - dd) / aa)
    }
  }
  return length(sub(add(a, scale(u, s)), add(c, scale(v, t))))
}
/** Distance to a sphere or continuous 3D brush stroke, including shaft radius. */
export function regionClearance(entry: Vec3, tip: Vec3, diameter: number, region: AvoidRegion): number {
  if(region.drawingMode==='surface'&&region.surfacePatch){
    return patchDistance(region.surfacePatch,entry,tip)-diameter/2
  }
  const points = region.points ?? [region.center]
  let gap = Infinity
  for (let i = 0; i < points.length; i++)
    gap = Math.min(gap, segmentDistance(entry, tip, points[i], points[Math.min(i + 1, points.length - 1)]))
  for(const stamp of region.stamps??[])gap=Math.min(gap,segmentDistance(entry,tip,stamp,stamp))
  return gap - region.radius - diameter / 2
}
export function clearance(p: Project, c: Chamber, g: Grid, e: Electrode, regions=activeAvoidRegions(p),report?:(region:AvoidRegion,gap:number,index:number)=>void): number {
  let gap = Infinity
  const paths=electrodePaths(c,g,e,false),tube=guideTubePath(c,g,e)
  for(const [index,region] of regions.entries()){
    let regional=Infinity
    for(const path of paths)regional=Math.min(regional,regionClearance(path.entry,path.tip,shaftDiameter(e),region))
    if(tube)regional=Math.min(regional,regionClearance(tube.start,tube.end,e.guideTube!.outerDiameter,region))
    report?.(region,regional,index);gap=Math.min(gap,regional)
  }
  return gap
}
export function softConflicts(p:Project,c:Chamber,g:Grid,e:Electrode,includeChamber=true):Array<{id:string;name:string;clearance:number}>{
  return softAvoidRegions(p).map(r=>{
      let gap=clearance(p,c,g,e,[r])
      if(includeChamber){
        const wallDepth=c.baseFit?Math.max(c.height,...c.baseFit.innerDepths,...c.baseFit.outerDepths):c.height
        gap=Math.min(gap,regionClearance(c.pose.origin,add(c.pose.origin,scale(axes(c.pose)[2],-wallDepth)),2*(c.innerRadius+c.wallThickness),r))
      }
      for(const other of p.electrodes)if(other.id!==e.id&&!other.direct&&other.gridId===g.id)gap=Math.min(gap,clearance(p,c,g,other,[r]))
      return {id:r.id,name:r.name,clearance:gap}
    }).filter(r=>r.clearance<settings(p).margin-1e-8)
}
export interface Candidate {
  linkedFits?: Array<{ id: string; hole: [number, number]; depth: number }>
  /** Chamber-axis intersection with the finalized mounting surface. */
  surfaceCenter?: Vec3
  openingOverlap?: boolean
  gridConfiguration?: Pick<Grid,'tiltAngle'|'tiltAzimuth'|'minimumThickness'|'seatHeight'|'seating'>
  softViolations?: Array<{id:string;name:string;clearance:number}>
  softPenalty?: number
  baseFit?: Chamber['baseFit']
  pose: Chamber['pose']
  hole: [number, number]
  depth: number
  miss: number
  clearance: number
  displacement: number
}
export interface RejectionDetails {
  bestTargetMissMm?:number
  avoidance?:Array<{id:string;name:string;bestClearance:number;count:number}>
  otherObjects?:Array<{id:string;name:string}>
}
export interface SearchResult {
  rejectionDetails?:RejectionDetails

  /** Supported local fit blocked only by hard avoidance; never an applicable candidate. */
  manualConflict?: {candidate:Candidate;conflicts:Array<{id:string;name:string;clearance:number}>}
  candidates: Candidate[]
  tested: number
  rejectedDepth: number
  rejectedMiss: number
  supportReason?: string
  rejectedSupport: number
  rejectedFootprint: number
  rejectedWall:number
  rejectedAvoidance: number
  rejectedOtherElectrodes: number
  radiusUsed: number
  minimumRequiredDepth: number
  maximumRequiredDepth: number
  usableLength: number
  minimumAllowedDepth: number
}
export interface SearchOptions {
  /** Complete anatomical surface vertices in RAS. Exterior support planes are conservative. */
  supportSource?: 'skull' | 'brain'
  supportAssetIds?: string[]
  supportSurfaces?: TriangleSurface[]
  surface?: ArrayLike<number>
  accessPoint?: Vec3
  manualPreference?: 'grid'|'vertical'|'surface'
  maximumLocalGridTilt?: number
  expand?: boolean
  refitDependents?: boolean
}
export function recordAvoidanceFailure(result:SearchResult,conflicts:Array<{id:string;name:string;clearance:number}>):void {
 const evidence=(result.rejectionDetails??={}).avoidance??=[]
 for(const conflict of conflicts){
  const saved=evidence.find(v=>v.id===conflict.id)
  if(saved){saved.count++;saved.bestClearance=Math.max(saved.bestClearance,conflict.clearance)}
  else evidence.push({id:conflict.id,name:conflict.name,bestClearance:conflict.clearance,count:1})
 }
}
function recordOtherFailure(result:SearchResult,objects:Array<{id:string;name:string}>):void {
 const evidence=(result.rejectionDetails??={}).otherObjects??=[]
 for(const object of objects)if(!evidence.some(v=>v.id===object.id))evidence.push({id:object.id,name:object.name})
}
/** Bounded discrete search. Never moves hardware; callers review and apply candidates explicitly. */
export function searchTarget(
  p: Project,
  electrodeId: string,
  targetId: string,
  options: SearchOptions = {},
): SearchResult {
  const e = p.electrodes.find((x) => x.id === electrodeId)
  const selectedTarget = p.targets.find((x) => x.id === targetId)
  const target=selectedTarget?{...selectedTarget,point:targetFocus(selectedTarget)}:undefined
  if (!e || !target) throw new Error('Choose an electrode and target first.')
  if (!targetsForElectrode(p, e).some(t => t.id === targetId)) throw new Error('Assign this target to the chamber before calculating placement.')
  let g = p.grids.find((x) => x.id === e.gridId)!
  const c = p.chambers.find((x) => x.id === g.chamberId)!
  if(!gridCompatibility(e).available)g={...g,enabled:false}
  const config = settings(p)
  if(config.mode==='new'&&g.enabled!==false&&g.seating!=='manual')g={...g,seatHeight:seatedGridHeight(c,g)}
  const result: SearchResult = {
    radiusUsed: config.searchRadius,
    minimumRequiredDepth: Infinity,
    maximumRequiredDepth: -Infinity,
    usableLength: maximumInsertion(e),
    minimumAllowedDepth: minimumTargetInsertion(e),
    candidates: [],
    tested: 0,
    rejectedDepth: 0,
    rejectedMiss: 0,
    rejectedSupport: 0,
    rejectedFootprint: 0,
    rejectedWall:0,
    rejectedAvoidance: 0,
    rejectedOtherElectrodes: 0,
  }
  const support = options.supportSurfaces?.length && config.mode === 'new' ? new SurfaceRayIndex(options.supportSurfaces) : null
  const supportIndex=support
  const fixedChambers = p.chambers.filter(item => item.id !== c.id && item.placementState !== 'unplaced').map(item => {
    const depth = item.baseFit ? Math.max(...item.baseFit.innerDepths, ...item.baseFit.outerDepths) : item.height
    return { item, end: add(item.pose.origin, scale(axes(item.pose)[2], -depth)), radius: item.innerRadius + item.wallThickness }
  })
  const shared = p.electrodes.filter(other => other.id !== e.id && other.gridId === g.id && other.targetId)
  const regions = activeAvoidRegions(p),softRegions=softAvoidRegions(p)
  const minimum = minimumTargetInsertion(e)
  const evaluate = (pose: Chamber['pose'], hole: [number, number], displacement: number): void => {
    result.tested++
    const chamber = { ...c, pose }
    if (config.mode === 'new') delete chamber.baseFit
    const approach = targetRegionApproach(chamber, g, hole, target, e)
    result.minimumRequiredDepth = Math.min(result.minimumRequiredDepth, approach.depth)
    result.maximumRequiredDepth = Math.max(result.maximumRequiredDepth, approach.depth)
    if (approach.depth < minimum || approach.depth > maximumInsertion(e)) {
      result.rejectedDepth++
      return
    }
    if (!g.tiltAngle && !hardwareFitsBore(e, holeLocal(g, hole,c), c.innerRadius)) {
      result.rejectedFootprint++
      return
    }
    if (approach.miss > targetTolerance(target,config.maxMiss) + 1e-8) {
      result.rejectedMiss++
      const evidence=result.rejectionDetails??={}
      evidence.bestTargetMissMm=Math.min(evidence.bestTargetMissMm??Infinity,approach.miss)
      return
    }
    let baseFit: Chamber['baseFit']
    if(support){
      try {
        const profile=fitChamberBase(chamber,options.supportSurfaces!,options.supportSource??'skull',options.supportAssetIds??[],.5,support)
        if(options.supportAssetIds?.length)baseFit=profile
      } catch (error) {result.supportReason ??= String(error).replace(/^Error: /,'');result.rejectedSupport++;return}
    }
    const fitted = { ...e, hole, depth: approach.depth }
    const supported={...chamber,...(baseFit?{baseFit}:{})}
    if(config.mode==='new'&&g.enabled!==false&&!gridFitsChamber(supported,g)){result.rejectedWall++;return}
    if(gridHoleClearance(supported,g,fitted,hole,approach.depth)<-1e-8){result.rejectedWall++;return}
    const regionGaps:number[]=[]
    let gap = clearance(p,chamber,g,fitted,regions,(_region,gap,index)=>{regionGaps[index]=gap})
    if ((options.surface || options.accessPoint) && config.mode === 'new') {
      const wallDepth = baseFit ? Math.max(c.height,...baseFit.innerDepths,...baseFit.outerDepths) : c.height
      const base = add(pose.origin, scale(axes(pose)[2], -wallDepth))
      for(const [index,region] of regions.entries()){
        regionGaps[index]=Math.min(regionGaps[index],regionClearance(pose.origin,base,2*(c.innerRadius+c.wallThickness),region))
        gap=Math.min(gap,regionGaps[index])
      }
    }
    const depth = baseFit ? Math.max(c.height, ...baseFit.innerDepths, ...baseFit.outerDepths) : c.height
    const bottom = add(pose.origin, scale(axes(pose)[2], -depth))
    const obstacle=fixedChambers.find(({ item, end, radius }) =>
      (config.mode === 'new' && segmentDistance(pose.origin, bottom, item.pose.origin, end) < c.innerRadius + c.wallThickness + radius - 1e-8)
      || electrodePaths(chamber, g, fitted, false).some(path =>
        segmentDistance(path.entry, path.tip, item.pose.origin, end) < radius + shaftDiameter(fitted)/2 - 1e-8))
    if(obstacle){
      recordOtherFailure(result,[obstacle.item])
      result.rejectedOtherElectrodes++
      return
    }
    let linkedFits: Candidate['linkedFits']
    if (gap >= config.margin - 1e-8 && shared.length && !options.refitDependents) {
      const fitProject = {
        ...p, chambers: p.chambers.map(item => item.id === c.id ? { ...supported, placementState: undefined } : item),
        grids: p.grids.map(item => item.id === g.id ? g : item),
        electrodes: p.electrodes.map(other => other.id === e.id ? { ...fitted, targetId } : { ...other }),
      }
      try {
        refitChamberTrajectories(fitProject, c.id, e.id)
        linkedFits = shared.map(other => {
          const fitted = fitProject.electrodes.find(item => item.id === other.id)!
          return { id: fitted.id, hole: fitted.hole, depth: fitted.depth }
        })
      } catch {
        result.rejectedOtherElectrodes++
        recordOtherFailure(result,shared)
        return
      }
    }
    const softViolations=softConflicts(p,{...chamber,baseFit},g,fitted,!!(options.surface||options.accessPoint)&&config.mode==='new')
    const inward = scale(axes(pose)[2], -1)
    const centerDepth = support?.distance(pose.origin, inward, Infinity, true)
    const surfaceCenter = centerDepth !== undefined && Number.isFinite(centerDepth) ? add(pose.origin, scale(inward, centerDepth)) : undefined
    const wallDepth=baseFit?Math.max(c.height,...baseFit.innerDepths,...baseFit.outerDepths):c.height
    const openingOverlap=(p.surfaceOpenings??[]).some(o=>{
      if(!currentOpening(p,o))return false
      const delta=sub(o.center,pose.origin),basis=axes(pose),x=dot(delta,basis[0]),y=dot(delta,basis[1]),z=dot(delta,basis[2])
      return Math.hypot(x,y)<=c.innerRadius+c.wallThickness+o.radius && z<=o.radius && z>=-wallDepth-o.radius
    })
    const candidate:Candidate={
      ...(linkedFits ? { linkedFits } : {}),
      ...(g.tiltAngle||g.minimumThickness||g.seatHeight||g.angleSearch?{gridConfiguration:{seating:g.seating??'flush',tiltAngle:g.tiltAngle??0,tiltAzimuth:g.tiltAzimuth??0,minimumThickness:g.minimumThickness??0,seatHeight:g.seatHeight??0}}:{}),
      ...(openingOverlap?{openingOverlap:true}:{}),
      ...(surfaceCenter ? { surfaceCenter } : {}),
      ...(softRegions.length?{softViolations,softPenalty:softViolations.reduce((sum,r)=>sum+config.margin-r.clearance,0)}:{}),
      ...(baseFit ? {baseFit} : {}),
      pose,
      hole,
      depth: approach.depth,
      miss: approach.miss,
      clearance: gap,
      displacement,
    }
    if(gap<config.margin-1e-8){
      result.rejectedAvoidance++
      {
        const conflicts=regions.flatMap((r,index)=>regionGaps[index]<config.margin-1e-8?[{id:r.id,name:r.name,clearance:regionGaps[index]}]:[])
        recordAvoidanceFailure(result,conflicts)
        if(options.accessPoint&&surfaceCenter&&length(sub(surfaceCenter,options.accessPoint))<=Math.max(.5,config.searchStep/2)&&(!result.manualConflict||conflicts.length<result.manualConflict.conflicts.length||conflicts.length===result.manualConflict.conflicts.length&&candidate.depth<result.manualConflict.candidate.depth))result.manualConflict={candidate,conflicts}
      }
      return
    }
    result.candidates.push(candidate)
  }
  if(options.accessPoint){
    if(config.mode!=='new'||!support||!options.supportSurfaces?.length)throw new Error('Click-to-fit requires a movable chamber and a finalized planning surface.')
    const point=options.accessPoint
    if(!point.every(Number.isFinite))throw new Error('Choose a point on the planning surface.')
    const radial=normalize(sub(point,target.point)),original=g,maxTilt=options.maximumLocalGridTilt??30
    if(!Number.isFinite(maxTilt)||maxTilt<0||maxTilt>60)throw new Error('Choose a maximum grid tilt between 0 and 60 degrees.')
    const aligned=alignChamberToSurface({...c,pose:{...c.pose,origin:add(point,scale(radial,.1))}},options.supportSurfaces)
    const normal=axes(aligned.pose)[2],directions:Vec3[]=[radial,normal,[0,0,1]]
    // Sweep from direct target access toward the local skull normal, then around it.
    for(let i=1;i<8;i++)directions.push(normalize(add(scale(radial,1-i/8),scale(normal,i/8))))
    const [u,v]=trajectoryAxes(normal)
    for(const angle of [10,20,30])for(let i=0;i<12;i++){const a=i*Math.PI/6,t=angle*Math.PI/180;directions.push(normalize(add(scale(normal,Math.cos(t)),scale(add(scale(u,Math.cos(a)),scale(v,Math.sin(a))),Math.sin(t)))))}
    for(const axis of directions)for(const lift of [0,c.innerRadius+c.wallThickness]){
      if(dot(axis,radial)<=0)continue
      const pose=poseFromAxes(add(point,scale(axis,c.height+1+lift)),trajectoryAxes(axis))
      if(!options.refitDependents&&c.mounting&&c.mounting!=='custom'){
        try{
          const sample=fitChamberBase({...c,mounting:'custom',pose},options.supportSurfaces,options.supportSource??'skull',options.supportAssetIds??[],.5,support)
          const depths=[...sample.innerDepths,...sample.outerDepths]
          const shift=c.mounting==='cut'?c.height-Math.max(...depths):c.height+.5-Math.min(...depths)
          pose.origin=add(pose.origin,scale(axis,shift))
        }catch{continue}
      }
      g={...original};delete g.angleSearch
      if(options.refitDependents){
        const span=length(sub(pose.origin,point)),shank=shankOffsets(e)[e.hardware?.selectedShank??0]
        const holes=gridHoles(c,g).map(hole=>({hole,miss:targetRegionApproach({...c,pose},g,hole,target,e).miss}))
          .sort((a,b)=>a.miss-b.miss).slice(0,4).map(item=>item.hole)
        for(const hole of holes){
          const trial=structuredClone(pose)
          for(let iteration=0;iteration<12;iteration++){
            const offset=sub(localToWorld(trial,add(holeLocal(g,hole,c),gridVector(g,shank))),trial.origin)
            trial.angles=aimGridPose(trial,g,sub(target.point,offset)).angles
            trial.origin=add(point,scale(axes(trial)[2],span))
          }
          if(c.mounting&&c.mounting!=='custom'){
            const outward=axes(trial)[2]
            try{
              const sample=fitChamberBase({...c,mounting:'custom',pose:trial},options.supportSurfaces,options.supportSource??'skull',options.supportAssetIds??[],.5,support)
              const depths=[...sample.innerDepths,...sample.outerDepths]
              const shift=c.mounting==='cut'?c.height-Math.max(...depths):c.height+.5-Math.min(...depths)
              trial.origin=add(trial.origin,scale(outward,shift))
            }catch{continue}
          }
          const before=result.candidates.length
          evaluate(trial,hole,0)
          if (result.candidates.length > before) {
            const center = result.candidates.at(-1)?.surfaceCenter
            if (!center || length(sub(center, point)) > .5) {
              result.candidates.pop()
              result.rejectedSupport++
            }
          }
        }
        continue
      }
      if(gridCompatibility(e).available&&g.enabled!==false&&maxTilt>0){
        g.minimumThickness=((g.minimumThickness??0)>0?g.minimumThickness!:2)
        let low=0,high=maxTilt,required=Infinity
        for(let iteration=0;iteration<45;iteration++){
          g.tiltAngle=(low+high)/2
          g.seating='flush';g.seatHeight=seatedGridHeight(c,g)
          const entry=localToWorld(pose,holeLocal(g,[0,0],c)),outward=normalize(sub(entry,target.point)),basis=axes(pose),x=dot(outward,basis[0]),y=dot(outward,basis[1]),z=dot(outward,basis[2])
          required=Math.atan2(Math.hypot(x,y),z)*180/Math.PI
          g.tiltAzimuth=Math.atan2(-y,-x)*180/Math.PI
          if(required>g.tiltAngle)low=g.tiltAngle;else high=g.tiltAngle
        }
        if(required>maxTilt+1e-7||Math.abs(required-g.tiltAngle!)>1e-6)continue
      }else{
        // With a fixed guide design, aim its channels while preserving the chosen centre line.
        for(let iteration=0;iteration<20;iteration++){
          const offset=sub(localToWorld(pose,add(holeLocal(g,[0,0],c),gridVector(g,shankOffsets(e)[e.hardware?.selectedShank??0]))),pose.origin)
          const aim=aimGridPose(pose,g,sub(target.point,offset));pose.angles=aim.angles
        }
      }
      const before=result.candidates.length
      evaluate(pose,[0,0],0)
      // A fit must stay at the clicked location, rather than silently jumping to another surface.
      if (result.candidates.length > before) {
        const center = result.candidates.at(-1)?.surfaceCenter
        if (!center || length(sub(center, point)) > Math.max(.5, config.searchStep / 2)) {
          result.candidates.pop()
          result.rejectedSupport++
        }
      }
    }
    g=original
    const angleScore=(candidate:Candidate)=>{
      if(options.manualPreference==='vertical')return Math.acos(Math.max(-1,Math.min(1,axes(candidate.pose)[2][2])))
      if(options.manualPreference==='surface')return Math.acos(Math.max(-1,Math.min(1,dot(axes(candidate.pose)[2],normal))))
      return candidate.gridConfiguration?.tiltAngle??original.tiltAngle??0
    }
    result.candidates.sort((a,b)=>(a.softViolations?.length??0)-(b.softViolations?.length??0)||(a.softPenalty??0)-(b.softPenalty??0)||angleScore(a)-angleScore(b)||a.depth-b.depth)
    return result
  }
  if (config.mode === 'existing') {
    const original=g,variants:Grid[]=[g]
    if(g.enabled!==false&&g.angleSearch&&gridCompatibility(e).available){
      const {maximum,step,azimuthStep}=g.angleSearch
      const angles=[0];for(let angle=step;angle<=maximum+1e-8;angle+=step)angles.push(angle)
      if(!angles.includes(maximum))angles.push(maximum)
      for(const tiltAngle of angles)for(let tiltAzimuth=0;tiltAzimuth<360;tiltAzimuth+=azimuthStep){if(!tiltAngle&&tiltAzimuth)continue;variants.push({...g,tiltAngle,tiltAzimuth,minimumThickness:((g.minimumThickness??0)>0?g.minimumThickness!:2)})}
      if(variants.length*g.count*g.count>200000)throw new Error('Grid-angle search exceeds 200,000 hole/orientation tests. Increase angle steps or reduce the grid count.')
    }
    const seen=new Set<string>()
    for(const variant of variants){g=variant;const key=JSON.stringify([g.tiltAngle??0,g.tiltAzimuth??0,g.minimumThickness??0,g.seatHeight??0]);if(seen.has(key))continue;seen.add(key);for(const hole of gridCompatibility(e).available?gridHoles(c,g):[e.hole])evaluate(c.pose,hole,0)}
    g=original
    // Minimize target miss, then maximize clearance. Deterministic tie-break by hole order.
    result.candidates.sort(
      (a, b) => (a.softViolations?.length??0)-(b.softViolations?.length??0)||(a.softPenalty??0)-(b.softPenalty??0)||a.miss - b.miss || (a.clearance === b.clearance ? 0 : b.clearance - a.clearance),
    )
  } else {
    if (!config.seed && !options.surface)
      throw new Error('Mark a preferred grid origin at the crosshair before searching for a new chamber.')
    let seed = config.seed ?? c.pose.origin
    if (!config.seed && options.surface) {
      let top = target.point[2]
      for (let i = 2; i < options.surface.length; i += 3) top = Math.max(top, options.surface[i])
      seed = [target.point[0], target.point[1], top + c.height + 1]
    }
    if (length(sub(seed, target.point)) < 1e-8) {
      if (options.surface) seed = add(target.point, [0, 0, 1])
      else throw new Error('The preferred grid origin must differ from the target.')
    }
    const [u, v] = trajectoryAxes(sub(seed, target.point))
    const visited = new Set<string>()
    const candidatePose=(guess:Vec3,roll=0):Chamber['pose']=>{
      const direction=scale(sub(guess,target.point),1/length(sub(guess,target.point)))
      const pose=aimGridPose({...c.pose,origin:guess},g,target.point)
      if(roll){const angle=roll*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);pose.angles=poseFromAxes(pose.origin,axes(pose).map(v=>add(add(scale(v,cos),scale(cross(direction,v),sin)),scale(direction,dot(direction,v)*(1-cos)))) as [Vec3,Vec3,Vec3]).angles}
      const offset=sub(localToWorld(pose,add(holeLocal(g,[0,0],c),gridVector(g,shankOffsets(e)[e.hardware?.selectedShank??0]))),pose.origin)
      let distance=length(sub(guess,target.point))
      if(options.surface){const chamberAxis=axes(pose)[2];let support=-Infinity
        if(options.supportSurfaces?.length&&supportIndex)support=supportIndex.maximumProjection(target.point,chamberAxis)
        else for(let i=0;i<options.surface.length;i+=3)support=Math.max(support,(options.surface[i]-target.point[0])*chamberAxis[0]+(options.surface[i+1]-target.point[1])*chamberAxis[1]+(options.surface[i+2]-target.point[2])*chamberAxis[2])
        distance=(Math.max(0,support)+c.height+1+dot(offset,chamberAxis))/dot(direction,chamberAxis)
      }
      pose.origin=sub(add(target.point,scale(direction,distance)),offset)
      if(supportIndex&&options.supportSurfaces&&c.mounting&&c.mounting!=='custom'){
        for(let iteration=0;iteration<12;iteration++){
          try{
            const sample=fitChamberBase({...c,mounting:'custom',pose},options.supportSurfaces,options.supportSource??'skull',options.supportAssetIds??[],.5,supportIndex)
            const depths=[...sample.innerDepths,...sample.outerDepths],shift=c.mounting==='cut'?c.height-Math.max(...depths)-.0001:c.height+.5001-Math.min(...depths)
            if(Math.abs(shift)<.00001)break
            distance+=shift/dot(direction,axes(pose)[2])
            pose.origin=sub(add(target.point,scale(direction,distance)),offset)
          }catch{break}
        }
      }
      return pose
    }
    if (options.expand && options.surface) {
      // Cover the entire exterior envelope, including entry directions behind the seed.
      // The usable shaft length, not a relocation radius, determines reachability.
      let extent = 0
      for (let i = 0; i < options.surface.length; i += 3)
        extent = Math.max(
          extent,
          Math.hypot(
            options.surface[i] - target.point[0],
            options.surface[i + 1] - target.point[1],
            options.surface[i + 2] - target.point[2],
          ),
        )
      const samples = Math.max(
        32,
        Math.ceil(4 * Math.PI * (Math.min(extent, maximumInsertion(e)) / config.searchStep) ** 2),
      )
      result.radiusUsed = maximumInsertion(e)
      const attempt = (direction: Vec3): void => {
        const pose = candidatePose(add(target.point, direction))
        const before=result.candidates.length
        evaluate(pose, [0, 0], length(sub(pose.origin, seed)))
        if(result.candidates.length===before&&g.tiltAngle&&support)for(let roll=45;roll<360;roll+=45){const alternate=candidatePose(add(target.point,direction),roll);evaluate(alternate,[0,0],length(sub(alternate.origin,seed)))}
      }
      attempt(scale(sub(seed, target.point), 1 / length(sub(seed, target.point))))
      for (let i = 0; i < samples; i++) {
        const z = 1 - (2 * (i + 0.5)) / samples
        const r = Math.sqrt(1 - z * z)
        const angle = i * Math.PI * (3 - Math.sqrt(5))
        attempt([r * Math.cos(angle), r * Math.sin(angle), z])
      }
      if(options.supportSurfaces?.length){
        const cells=new Set<string>()
        for(const mesh of options.supportSurfaces)for(let i=0;i<mesh.pts.length;i+=3){
          const point:Vec3=[mesh.pts[i],mesh.pts[i+1],mesh.pts[i+2]],delta=sub(point,target.point)
          if(length(delta)>maximumInsertion(e)||length(delta)<1e-6)continue
          const key=point.map(v=>Math.floor(v/(config.searchStep/Math.sqrt(3)))).join(',')
          if(cells.has(key))continue;cells.add(key)
          attempt(normalize(delta))
        }
      }
    } else {
      let radius = config.searchRadius
      const targetBlocked = activeAvoidRegions(p).some(
        (r) =>
          !target.region&&regionClearance(target.point, target.point, e.diameter, r) + config.maxMiss < config.margin - 1e-8,
      )
      do {
        result.radiusUsed = radius
        const n = Math.floor(radius / config.searchStep)
        for (let y = -n; y <= n; y++)
          for (let x = -n; x <= n; x++) {
            const distance = Math.hypot(x, y) * config.searchStep
            const key = `${x},${y}`
            if (distance > radius + 1e-8 || visited.has(key)) continue
            visited.add(key)
            const pose=candidatePose(add(seed,add(scale(u,x*config.searchStep),scale(v,y*config.searchStep))))
            evaluate(pose, [0, 0], length(sub(pose.origin, seed)))
          }
        if (!options.expand || result.candidates.length || radius >= 50 || targetBlocked) break
        radius = Math.min(50, Math.max(radius + 10, radius * 2))
      } while (radius <= 50)
    }
    // Honor an explicit access preference; otherwise prefer short insertion rather than an artificial superior seed.
    result.candidates.sort(
      (a, b) =>
        (a.softViolations?.length??0)-(b.softViolations?.length??0)||(a.softPenalty??0)-(b.softPenalty??0)||(config.seed ? a.displacement - b.displacement : a.depth - b.depth) || (a.clearance === b.clearance ? 0 : b.clearance - a.clearance),
    )
  }
  return result
}
export function applyCandidate(
  p: Project,
  electrodeId: string,
  targetId: string,
  candidate: Candidate,
  options: SearchOptions = {},
): void {
  // Recompute to reject stale candidates after changes to hardware, targets or constraints.
  const match = searchTarget(p, electrodeId, targetId, options).candidates.find(
    (x) => JSON.stringify(x) === JSON.stringify(candidate),
  )
  if (!match) throw new Error('This candidate is no longer valid. Run the search again.')
  const e = p.electrodes.find((x) => x.id === electrodeId)!
  const g = p.grids.find((x) => x.id === e.gridId)!
  const c = p.chambers.find((x) => x.id === g.chamberId)!
  if(match.gridConfiguration)Object.assign(g,match.gridConfiguration)
  if (settings(p).mode === 'new') delete c.baseFit
  if(match.baseFit)c.baseFit=structuredClone(match.baseFit)
  c.pose = structuredClone(match.pose)
  delete c.placementState
  e.hole = [...match.hole]
  e.depth = match.depth
  e.targetId = targetId
  for (const fit of match.linkedFits ?? []) {
    const linked = p.electrodes.find(item => item.id === fit.id)!
    linked.hole = [...fit.hole]
    linked.depth = fit.depth
  }
}
