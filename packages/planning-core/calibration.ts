import {customFrameFields,frameDimensions} from './stereotax.ts'
import type {Pose,Project,Vec3} from './model.ts'
import type {PointReference} from './measurements.ts'
import {resolvePoint} from './measurements.ts'
import {add,cross,dot,poseFromAxes,scale,sub} from './geometry.ts'

export type Directions=[1|-1,1|-1,1|-1]
export type FiducialReference=Extract<PointReference,{kind:'point'}>|{kind:'landmark'|'target';id:string}
export interface FiducialPair {
 id:string;name:string;image:FiducialReference;framePoint:Vec3;role:'fit'|'check';enabled:boolean
}
/** Rows of a proper rotation, mapping image RAS into frame right/front/up. No scale. */
export interface RigidAlignment {rotation:[Vec3,Vec3,Vec3];translation:Vec3}
export interface AlignmentResult extends RigidAlignment {fittedAt:string;inputSignature:string;setupSignature:string}
export interface FrameCalibration {directions:Directions;pairs:FiducialPair[];result?:AlignmentResult}
export const defaultCalibration=():FrameCalibration=>({directions:[1,1,1],pairs:[]})
export const transformPoint=(transform:RigidAlignment,point:Vec3):Vec3=>transform.rotation.map((row,i)=>dot(row,point)+transform.translation[i]) as Vec3
export const inversePoint=(transform:RigidAlignment,point:Vec3):Vec3=>[0,1,2].map(i=>transform.rotation.reduce((sum,row,j)=>sum+row[i]*(point[j]-transform.translation[j]),0)) as Vec3
export const frameReadings=(transform:RigidAlignment,point:Vec3,directions:Directions):Vec3=>transformPoint(transform,point).map((n,i)=>n*directions[i]) as Vec3
export function framePose(transform:RigidAlignment):Pose {
 return poseFromAxes(inversePoint(transform,[0,0,0]),transform.rotation)
}
/** Reject numerical degeneracy; poor but solvable geometry is reported, not silently discarded. */
function spread(points:Vec3[]):number {
 const origin=points[0];let baseline:Vec3=[0,0,0],span=0
 for(const p of points){const v=sub(p,origin),n=Math.hypot(...v);if(n>span){baseline=v;span=n}}
 if(span===0)throw new Error('Fiducials coincide. Choose at least three distinct, noncollinear points.')
 const height=points.reduce((best,p)=>Math.max(best,Math.hypot(...cross(baseline,sub(p,origin)))/span),0)
 if(height<=span*1e-10)throw new Error('Fiducials are collinear. Spread the fit points across the anatomy.')
 return height/span
}
export function rigidFit(image:Vec3[],frame:Vec3[]):RigidAlignment {
 if(image.length!==frame.length||image.length<3)throw new Error('At least three matching fit points are required.')
 if([...image,...frame].some(v=>v.length!==3||!v.every(Number.isFinite)))throw new Error('All fiducial coordinates must be finite millimetre values.')
 spread(image);spread(frame)
 const center=(points:Vec3[]):Vec3=>points.reduce((sum,p)=>add(sum,scale(p,1/points.length)),[0,0,0] as Vec3)
 const a=center(image),b=center(frame),s=Array.from({length:3},()=>[0,0,0])
 for(let k=0;k<image.length;k++){const x=sub(image[k],a),y=sub(frame[k],b);for(let i=0;i<3;i++)for(let j=0;j<3;j++)s[i][j]+=x[i]*y[j]}
 const trace=s[0][0]+s[1][1]+s[2][2],z=[s[1][2]-s[2][1],s[2][0]-s[0][2],s[0][1]-s[1][0]]
 const n=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>i===0?(j===0?trace:z[j-1]):j===0?z[i-1]:s[i-1][j-1]+s[j-1][i-1]-(i===j?trace:0)))
 const eigen=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>i===j?1:0) as number[])
 // Symmetric Jacobi diagonalization selects the largest algebraic eigenvalue, including 180° rotations.
 for(let iteration=0;iteration<100;iteration++){
  let p=0,q=1
  for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)if(Math.abs(n[i][j])>Math.abs(n[p][q])){p=i;q=j}
  if(Math.abs(n[p][q])<=Math.max(...n.map(row=>Math.max(...row.map(Math.abs))))*1e-14)break
  const angle=.5*Math.atan2(2*n[p][q],n[q][q]-n[p][p]),c=Math.cos(angle),s=Math.sin(angle),app=n[p][p],aqq=n[q][q],apq=n[p][q]
  n[p][p]=c*c*app-2*s*c*apq+s*s*aqq;n[q][q]=s*s*app+2*s*c*apq+c*c*aqq;n[p][q]=n[q][p]=0
  for(let k=0;k<4;k++){
   if(k!==p&&k!==q){const kp=n[k][p],kq=n[k][q];n[k][p]=n[p][k]=c*kp-s*kq;n[k][q]=n[q][k]=s*kp+c*kq}
   const vp=eigen[k][p],vq=eigen[k][q];eigen[k][p]=c*vp-s*vq;eigen[k][q]=s*vp+c*vq
  }
 }
 const index=n.reduce((best,row,i)=>row[i]>n[best][best]?i:best,0),[w,x,y,zq]=eigen.map(row=>row[index])
 const rotation:[Vec3,Vec3,Vec3]=[[1-2*(y*y+zq*zq),2*(x*y-zq*w),2*(x*zq+y*w)],[2*(x*y+zq*w),1-2*(x*x+zq*zq),2*(y*zq-x*w)],[2*(x*zq-y*w),2*(y*zq+x*w),1-2*(x*x+y*y)]]
 const translation=sub(b,rotation.map(row=>dot(row,a)) as Vec3)
 if(![...rotation.flat(),...translation].every(Number.isFinite))throw new Error('Alignment could not be computed at this numerical scale. Check the coordinate values and units.')
 return {rotation,translation}
}
const canonical=(point:Vec3,directions:Directions):Vec3=>point.map((n,i)=>n*directions[i]) as Vec3
export function alignmentInputSignature(p:Project):string {
 const c=p.frameCalibration??defaultCalibration()
 return JSON.stringify({frame:p.frame,sha256:p.assets.find(a=>a.id===p.frame.referenceAssetId)?.sha256,directions:c.directions,
  fit:c.pairs.filter(v=>v.enabled&&v.role==='fit').map(v=>[v.id,resolvePoint(p,v.image)?.point??null,v.framePoint]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))})
}
export function alignmentSetupSignature(p:Project):string {
 const r=p.stereotax
 return JSON.stringify({offset:p.display.setupOffsetMm??[0,0,0],rig:r?{preset:r.preset,dimensions:customFrameFields.map(([,key])=>frameDimensions(r)[key]),pose:r.pose,earTipSpacingMm:r.earTipSpacingMm,earTipCenterMm:r.earTipCenterMm??0,earBarId:r.earBarId,earBlockOffsets:['left','right'].map(side=>{const offset=r.earBlockOffsets?.[side as 'left'|'right'];return [offset?.apMm??0,offset?.heightMm??0]})}:null})
}
export function alignmentStatus(p:Project):'missing'|'current'|'changed' {
 const r=p.frameCalibration?.result
 return !r?'missing':r.inputSignature===alignmentInputSignature(p)&&r.setupSignature===alignmentSetupSignature(p)?'current':'changed'
}
export function calculateAlignment(p:Project):AlignmentResult {
 const c=p.frameCalibration??defaultCalibration(),pairs=c.pairs.filter(v=>v.enabled&&v.role==='fit'),image:Vec3[]=[],frame:Vec3[]=[]
 const used=new Set<string>()
 for(const pair of pairs){
  const resolved=resolvePoint(p,pair.image)
  if(!resolved)throw new Error(`Image point for ${pair.name} is unavailable. Restore it or disable the pair.`)
  const key=JSON.stringify(resolved.point)
  if(used.has(key))throw new Error('A fit point is repeated. Each correspondence must use a distinct image point.')
  used.add(key);image.push(resolved.point);frame.push(canonical(pair.framePoint,c.directions))
 }
 return {...rigidFit(image,frame),fittedAt:new Date().toISOString(),inputSignature:alignmentInputSignature(p),setupSignature:alignmentSetupSignature(p)}
}
export function applyAlignment(p:Project,result:AlignmentResult):void {
 if(result.inputSignature!==alignmentInputSignature(p)||result.setupSignature!==alignmentSetupSignature(p))throw new Error('Alignment inputs or frame setup changed. Calculate again before applying.')
 if(p.stereotax)p.stereotax.pose=framePose(result)
 const c=p.frameCalibration??=defaultCalibration();c.result={...structuredClone(result),setupSignature:alignmentSetupSignature(p)}
}
export function calibrationResiduals(p:Project,transform:RigidAlignment|undefined=p.frameCalibration?.result){
 const c=p.frameCalibration
 if(!c||!transform)return []
 return c.pairs.filter(v=>v.enabled).map(pair=>{
  const image=resolvePoint(p,pair.image),predicted=image?frameReadings(transform,image.point,c.directions):null
  const delta=predicted?sub(predicted,pair.framePoint):null
  return {pair,image:image?.point??null,predicted,delta,errorMm:delta?Math.hypot(...delta):null}
 })
}
export function calibrationGeometryWarning(p:Project):string|null {
 const pairs=p.frameCalibration?.pairs.filter(v=>v.enabled&&v.role==='fit')??[]
 try{
  const points=pairs.map(v=>resolvePoint(p,v.image)?.point).filter((v):v is Vec3=>!!v)
  return points.length>=3&&spread(points)<.01?'Fit points are nearly collinear. A wider distribution will constrain rotation better.':null
 }catch{return null}
}
