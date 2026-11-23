import {surfacePatch} from '@brainana/planning-core/surface-patch.ts'
import {snapAvoidance} from './snapAvoidance.ts'
import type {TriangleSurface} from '@brainana/planning-core/surface-fit.ts'
import type {Vec3} from '@brainana/planning-core/model.ts'
let surfaces:TriangleSurface[]=[]
self.onmessage=(event:MessageEvent<{id:number;surfaces?:TriangleSurface[];points:Vec3[];fill:Vec3[];radius:number;normal:Vec3;projected?:boolean}>)=>{
 const {id,points,fill,radius,normal}=event.data
 try{if(event.data.surfaces)surfaces=event.data.surfaces;const centers=event.data.projected?points:snapAvoidance(points,fill,radius,surfaces,normal);self.postMessage({id,centers,patch:surfacePatch(surfaces,centers,radius)})}catch(error){self.postMessage({id,error:String(error)})}
}
