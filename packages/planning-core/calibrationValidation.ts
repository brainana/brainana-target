import type {Project} from './model.ts'
import {cross,dot} from './geometry.ts'
/** Calibration metadata is optional; limits here describe structure and finite numbers, not workload. */
export function validateCalibration(p:Project):void {
 const check=(ok:unknown,message:string):void=>{if(!ok)throw new Error('Invalid project: '+message)}
 const object=(v:unknown):void=>check(!!v&&typeof v==='object'&&!Array.isArray(v),'invalid calibration object')
 const text=(v:unknown):void=>check(typeof v==='string'&&v.length>0,'invalid calibration text')
 const vector=(v:unknown):void=>check(Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)),'invalid calibration coordinates')
 const directions=(v:unknown):void=>check(Array.isArray(v)&&v.length===3&&v.every(n=>n===1||n===-1),'invalid calibration axis directions')
 const date=(v:unknown):void=>check(typeof v==='string'&&Number.isFinite(Date.parse(v)),'invalid calibration timestamp')
 const c=p.frameCalibration
 if(c!==undefined){
  object(c);directions(c.directions);check(Array.isArray(c.pairs),'invalid fiducial pairs')
  const ids=new Set<string>()
  for(const pair of c.pairs){
   object(pair);text(pair.id);text(pair.name);check(!ids.has(pair.id),'duplicate fiducial pair ID');ids.add(pair.id)
   vector(pair.framePoint);check(pair.role==='fit'||pair.role==='check','invalid fiducial role');check(typeof pair.enabled==='boolean','invalid fiducial inclusion')
   object(pair.image);check(['point','landmark','target'].includes(pair.image.kind),'fiducial must be an image point')
   if(pair.image.kind==='point'){text(pair.image.name);vector(pair.image.point)}else text(pair.image.id)
  }
  if(c.result!==undefined){
   const r=c.result;object(r);date(r.fittedAt);text(r.inputSignature);text(r.setupSignature);vector(r.translation)
   check(Array.isArray(r.rotation)&&r.rotation.length===3,'invalid alignment rotation');r.rotation.forEach(vector)
   for(let i=0;i<3;i++)for(let j=0;j<3;j++)check(Math.abs(dot(r.rotation[i],r.rotation[j])-(i===j?1:0))<1e-6,'alignment rotation must preserve distances')
   check(Math.abs(dot(cross(r.rotation[0],r.rotation[1]),r.rotation[2])-1)<1e-6,'alignment cannot reflect anatomy')
  }
 }
 for(const arm of p.stereotax?.arms??[]){
  const t=arm.toolCalibration;if(t===undefined)continue
  object(t);text(t.name);vector(t.tipOffsetMm);vector(t.zeroReadingsMm);vector(t.zeroStageMm);directions(t.directions);text(t.setupSignature);date(t.calibratedAt)
 }
}
