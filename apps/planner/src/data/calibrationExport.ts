import type {Project} from '@brainana/planning-core/model.ts'
import {alignmentStatus,calibrationResiduals,frameReadings} from '@brainana/planning-core/calibration.ts'
import {calibratedTool,toolStatus} from '@brainana/planning-core/armCalibration.ts'
import {resolvePoint} from '@brainana/planning-core/measurements.ts'
export function calibrationRows(p:Project):Array<Array<string|number>> {
 const header=['kind','name','role','status','image_R_mm','image_A_mm','image_S_mm','measured_X_mm','measured_Y_mm','measured_Z_mm','calibrated_X_mm','calibrated_Y_mm','calibrated_Z_mm','mismatch_mm','tip_offset_X_mm','tip_offset_Y_mm','tip_offset_Z_mm','slide_X_mm','slide_Y_mm','slide_Z_mm','positive_X','positive_Y','positive_Z','reference_sha256','recorded_at','frame_alignment_status','slide_positive_X','slide_positive_Y','slide_positive_Z','zero_reading_X_mm','zero_reading_Y_mm','zero_reading_Z_mm','zero_stage_X_mm','zero_stage_Y_mm','zero_stage_Z_mm']
 const rows:Array<Array<string|number>>=[header],c=p.frameCalibration,state=alignmentStatus(p),sha=p.assets.find(a=>a.id===p.frame.referenceAssetId)?.sha256??''
 const add=(values:Record<string,string|number>)=>rows.push(header.map(key=>values[key]??''))
 const coordinates=(prefix:string,numbers:number[]|undefined|null)=>Object.fromEntries((numbers??[]).map((n,i)=>[prefix+['X_mm','Y_mm','Z_mm'][i],n]))
 const image=(numbers:number[]|undefined|null)=>Object.fromEntries((numbers??[]).map((n,i)=>['image_'+['R_mm','A_mm','S_mm'][i],n]))
 const positives=c?.directions.map((d,i)=>[['right','left'],['front','back'],['up','down']][i][d===1?0:1])
 const common={frame_alignment_status:state,reference_sha256:sha,positive_X:positives?.[0]??'',positive_Y:positives?.[1]??'',positive_Z:positives?.[2]??'',recorded_at:c?.result?.fittedAt??''}
 const residualById=new Map((state==='current'?calibrationResiduals(p):[]).map(v=>[v.pair.id,v]))
 for(const pair of c?.pairs??[]){
  const point=resolvePoint(p,pair.image),residual=residualById.get(pair.id)
  add({...common,kind:'fiducial',name:pair.name,role:pair.role,status:!pair.enabled?'disabled':!point?'image point unavailable':state,...image(point?.point),...coordinates('measured_',pair.framePoint),...coordinates('calibrated_',residual?.predicted),mismatch_mm:residual?.errorMm??''})
 }
 if(c)for(const point of [...p.targets,...p.landmarks??[]])add({...common,kind:'point',name:point.name,status:state,...image(point.point),...coordinates('calibrated_',state==='current'?frameReadings(c.result!,point.point,c.directions):null)})
 for(const [i,arm] of (p.stereotax?.arms??[]).entries()){
  const tool=p.stereotax&&calibratedTool(p.stereotax,arm),t=arm.toolCalibration;if(!t)continue
  add({...common,kind:'tool',name:`Arm ${i+1}: ${t.name}`,status:toolStatus(p.stereotax!,arm),recorded_at:t.calibratedAt,slide_positive_X:t.directions[0],slide_positive_Y:t.directions[1],slide_positive_Z:t.directions[2],...coordinates('zero_reading_',t.zeroReadingsMm),...coordinates('zero_stage_',t.zeroStageMm),...image(tool?.point),...coordinates('tip_offset_',t.tipOffsetMm),...coordinates('slide_',tool?.readings),...coordinates('calibrated_',tool&&state==='current'?frameReadings(c!.result!,tool.point,c!.directions):null)})
 }
 return rows
}
export const calibrationCsv=(p:Project)=>calibrationRows(p).map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')
export function calibrationReport(p:Project):string {
 if(!p.frameCalibration&&!p.stereotax?.arms.some(a=>a.toolCalibration))return ''
 const escape=(v:unknown)=>String(v).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]!))
 const rows=calibrationRows(p),state=alignmentStatus(p)
 return `<h2>Frame alignment and tool calibration</h2><p>Alignment: ${state}. Calibrated coordinates are included only for a current alignment. Image coordinates are RAS millimetres. Frame directions: ${escape(p.frameCalibration?.directions.map((d,i)=>[['right','left'],['front','back'],['up','down']][i][d===1?0:1]).join(' / ')??'not defined')}. Fit mismatch does not estimate targeting accuracy. Independent check points are excluded from fitting.</p><table><thead><tr>${['Kind','Name','Role','Status','Image R / A / S (mm)','Measured X / Y / Z (mm)','Calibrated X / Y / Z (mm)','Mismatch (mm)'].map(v=>`<th>${escape(v)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(row=>`<tr>${[row[0],row[1],row[2],row[3],row.slice(4,7).join(' / '),row.slice(7,10).join(' / '),row.slice(10,13).join(' / '),row[13]].map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}
