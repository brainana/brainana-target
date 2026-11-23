import type {Electrode,AvoidRegion,Project} from './model.ts'
import {add,axes,scale} from './geometry.ts'
export const connectorPresets=[
 {id:'cereport-128',label:'Blackrock CerePort 128 — overall envelope',shape:'cylinder' as const,width:19,depth:19,height:16.5,neckDiameter:12,sources:['https://blackrockneurotech.com/products/utah-array/']},
 {id:'cereport-256',label:'Blackrock CerePort 256 — overall envelope',shape:'cylinder' as const,width:19,depth:19,height:16.5,neckDiameter:10.7,sources:['https://blackrockneurotech.com/products/utah-array/']},
 {id:'blackrock-omnetics',label:'Blackrock Omnetics — overall envelope',shape:'box' as const,width:37,depth:7,height:9,sources:['https://blackrockneurotech.com/products/utah-array/']},
]
export function connectorAvoidance(p:Project):AvoidRegion[]{return p.electrodes.flatMap(e=>{
 const c=e.connector;if(!c||c.unplaced)return[]
 return [{id:`connector:${e.id}`,name:`${e.name} skull connector`,frameId:p.frame.id,center:add(c.pose.origin,scale(axes(c.pose)[2],c.height/2)),points:[c.pose.origin,add(c.pose.origin,scale(axes(c.pose)[2],c.height))],radius:c.shape==='cylinder'?c.width/2:Math.hypot(c.width,c.depth)/2,constraint:'hard' as const}]
})}
export function connectorPreset(id:string,origin:[number,number,number]):NonNullable<Electrode['connector']>|null{
 const preset=connectorPresets.find(p=>p.id===id)
 return preset?{...preset,presetId:preset.id,pose:{origin:[...origin],angles:[0,0,0]},unplaced:true}:null
}
