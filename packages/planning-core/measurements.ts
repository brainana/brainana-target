import type { Pose, Project, Vec3 } from './model.ts'
import { add, axes, dot, gridPose, localToWorld, scale, sub, trajectory } from './geometry.ts'
import { electrodeAssembly } from './electrode-frame.ts'
import { armKinematics } from './stereotaxSetup.ts'
import {calibratedTool} from './armCalibration.ts'

export type PointReference =
 | {kind:'point';name:string;point:Vec3}
 | {kind:'landmark'|'target'|'chamber-center'|'grid-origin'|'headpost-base'|'electrode-entry'|'electrode-tip';id:string}
 | {kind:'frame-zero'|'ear-left'|'ear-right'|'ear-midpoint'}
 | {kind:'arm-tip'|'tool-tip';id:string}
export type MeasurementAxes = {kind:'image'} | {kind:'frame'} | {kind:'chamber'|'grid'|'arm';id:string}
export interface DistanceMeasurement {
 id:string;name:string;from:PointReference;to:PointReference;axes:MeasurementAxes;visible:boolean;color:string
}
export interface ResolvedPoint {name:string;point:Vec3}
export const referenceKey=(reference:PointReference|MeasurementAxes):string=>JSON.stringify(reference)
export const armReferenceId=(arm:NonNullable<Project['stereotax']>['arms'][number],index:number):string=>arm.id??`legacy-arm-${index}`
/** Assign identities before saving references, so removing an arm cannot retarget another arm. */
export function identifyArms(project:Project):void {
 const used=new Set(project.stereotax?.arms.flatMap(arm=>arm.id?[arm.id]:[]))
 project.stereotax?.arms.forEach((arm,index)=>{
  if(arm.id)return
  const base=armReferenceId(arm,index);let id=base,n=1
  while(used.has(id))id=base+'-'+n++
  arm.id=id;used.add(id)
 })
}
export function resolvePoint(project:Project,reference:PointReference):ResolvedPoint|null {
 const fixed=(name:string,point:Vec3):ResolvedPoint=>({name,point:[...point]})
 switch(reference.kind){
  case 'point':return fixed(reference.name,reference.point)
  case 'landmark':case 'target':{
   const item=(reference.kind==='landmark'?project.landmarks:project.targets)?.find(item=>item.id===reference.id)
   return item?fixed(item.name,item.point):null
  }
  case 'headpost-base':{
   const post=project.headposts?.find(item=>item.id===reference.id)
   return post?fixed(post.name+' base',post.pose.origin):null
  }
  case 'chamber-center':{
   const c=project.chambers.find(item=>item.id===reference.id&&item.placementState!=='unplaced')
   return c?fixed(c.name+' top center',c.pose.origin):null
  }
  case 'grid-origin':{
   const g=project.grids.find(item=>item.id===reference.id&&item.enabled!==false),c=g&&project.chambers.find(item=>item.id===g.chamberId&&item.placementState!=='unplaced')
   return c&&g?fixed(g.name+' origin',gridPose(c,g).origin):null
  }
  case 'electrode-entry':case 'electrode-tip':{
   const e=project.electrodes.find(item=>item.id===reference.id),assembly=e&&electrodeAssembly(project,e)
   if(!e||!assembly||e.direct?.unplaced||assembly.chamber.placementState==='unplaced')return null
   const path=trajectory(assembly.chamber,assembly.grid,e)
   return fixed(e.name+(reference.kind==='electrode-entry'?' reference entry':' tip'),reference.kind==='electrode-entry'?path.entry:path.tip)
  }
  default:{
   const rig=project.stereotax;if(!rig)return null
   if(reference.kind==='frame-zero')return fixed('Frame zero',rig.pose.origin)
   if(reference.kind==='arm-tip'||reference.kind==='tool-tip'){
    const index=rig.arms.findIndex((arm,i)=>armReferenceId(arm,i)===reference.id)
    if(index<0)return null
    if(reference.kind==='tool-tip'){const tool=calibratedTool(rig,rig.arms[index]);return tool?fixed(`Arm ${index+1} working tip`,tool.point):null}
    return fixed(`Arm ${index+1} holder tip`,armKinematics(rig,rig.arms[index]).worldTip)
   }
   const tip=(side:'left'|'right'):Vec3=>{
    const offset=rig.earBlockOffsets?.[side]
    return localToWorld(rig.pose,[(rig.earTipCenterMm??0)+(side==='left'?-1:1)*rig.earTipSpacingMm/2,offset?.apMm??0,offset?.heightMm??0])
   }
   return reference.kind==='ear-left'?fixed('Left ear tip',tip('left')):reference.kind==='ear-right'?fixed('Right ear tip',tip('right')):fixed('Ear-tip midpoint',scale(add(tip('left'),tip('right')),.5))
  }
 }
}
export function pointReferences(project:Project):Array<{reference:PointReference;name:string}> {
 const references:PointReference[]=[...(project.landmarks??[]).map(p=>({kind:'landmark' as const,id:p.id})),...project.targets.map(p=>({kind:'target' as const,id:p.id})),
  ...(project.stereotax?(['frame-zero','ear-left','ear-right','ear-midpoint'] as const).map(kind=>({kind})):[]),
  ...project.chambers.map(c=>({kind:'chamber-center' as const,id:c.id})),...project.grids.map(g=>({kind:'grid-origin' as const,id:g.id})),
  ...(project.headposts??[]).map(p=>({kind:'headpost-base' as const,id:p.id})),
  ...project.electrodes.flatMap(e=>(['electrode-entry','electrode-tip'] as const).map(kind=>({kind,id:e.id}))),
  ...(project.stereotax?.arms??[]).flatMap((arm,i)=>(['arm-tip','tool-tip'] as const).map(kind=>({kind,id:armReferenceId(arm,i)})))]
 return references.flatMap(reference=>{const resolved=resolvePoint(project,reference);return resolved?[{reference,name:resolved.name}]:[]})
}
export function resolveAxes(project:Project,reference:MeasurementAxes):{name:string;directions:[Vec3,Vec3,Vec3];labels:[string,string,string]}|null {
 const poseAxes=(name:string,pose:Pose,labels:[string,string,string])=>({name,directions:axes(pose),labels})
 if(reference.kind==='image')return poseAxes('Image RAS',{origin:[0,0,0],angles:[0,0,0]},['Right','Front','Up'])
 if(reference.kind==='frame')return project.stereotax?poseAxes('Stereotax frame',project.stereotax.pose,['Frame right','Frame front','Frame up']):null
 if(reference.kind==='chamber'){
  const c=project.chambers.find(c=>c.id===reference.id&&c.placementState!=='unplaced')
  return c?poseAxes(c.name,c.pose,['Chamber X','Chamber Y','Chamber Z']):null
 }
 if(reference.kind==='grid'){
  const g=project.grids.find(g=>g.id===reference.id&&g.enabled!==false),c=g&&project.chambers.find(c=>c.id===g.chamberId&&c.placementState!=='unplaced')
  return c&&g?poseAxes(g.name,gridPose(c,g),['Grid X','Grid Y','Grid Z']):null
 }
 const rig=project.stereotax,index=rig?.arms.findIndex((arm,i)=>armReferenceId(arm,i)===reference.id)??-1
 if(!rig||index<0)return null
 const local=armKinematics(rig,rig.arms[index]).stageAxes
 return {name:`Arm ${index+1} axes`,directions:local.map(direction=>sub(localToWorld(rig.pose,direction),rig.pose.origin)) as [Vec3,Vec3,Vec3],labels:['Arm X','Arm Y','Arm Z']}
}
export function axisReferences(project:Project):Array<{reference:MeasurementAxes;name:string}> {
 const refs:MeasurementAxes[]=[{kind:'image'},...(project.stereotax?[{kind:'frame' as const}]:[]),...project.chambers.map(c=>({kind:'chamber' as const,id:c.id})),...project.grids.map(g=>({kind:'grid' as const,id:g.id})),...(project.stereotax?.arms??[]).map((arm,i)=>({kind:'arm' as const,id:armReferenceId(arm,i)}))]
 return refs.flatMap(reference=>{const resolved=resolveAxes(project,reference);return resolved?[{reference,name:resolved.name}]:[]})
}
export function measureDistance(project:Project,measurement:DistanceMeasurement){
 const from=resolvePoint(project,measurement.from),to=resolvePoint(project,measurement.to),basis=resolveAxes(project,measurement.axes)
 if(!from||!to||!basis)return null
 const delta=sub(to.point,from.point)
 return {from,to,axes:basis,distanceMm:Math.hypot(...delta),offsetsMm:basis.directions.map(axis=>dot(delta,axis)) as Vec3}
}
