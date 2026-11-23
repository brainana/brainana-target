import type {Project} from '@brainana/planning-core/model.ts'
import {measureDistance,resolvePoint,referenceKey} from '@brainana/planning-core/measurements.ts'
export function measurementRows(project:Project):Array<Array<string|number>> {
 const asset=project.assets.find(a=>a.id===project.frame.referenceAssetId)
 return [['id','name','from','to','from_R_mm','from_A_mm','from_S_mm','to_R_mm','to_A_mm','to_S_mm','axes','axis_x','axis_y','axis_z','distance_mm','offset_x_mm','offset_y_mm','offset_z_mm','status','from_reference','to_reference','axes_reference','reference_image','reference_sha256'],...(project.measurements??[]).map(m=>{
  const value=measureDistance(project,m),from=resolvePoint(project,m.from),to=resolvePoint(project,m.to)
  return [m.id,m.name,from?.name??'Unavailable',to?.name??'Unavailable',...(from?.point??['','','']),...(to?.point??['','','']),value?.axes.name??'Unavailable',...(value?.axes.labels??['','','']),value?.distanceMm??'',...(value?.offsetsMm??['','','']),value?'Available':'Reference unavailable',referenceKey(m.from),referenceKey(m.to),referenceKey(m.axes),asset?.name??'',asset?.sha256??'']
 })]
}
export const measurementCsv=(project:Project):string=>measurementRows(project).map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n')
