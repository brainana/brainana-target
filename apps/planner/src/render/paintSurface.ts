import type {AvoidRegion,Vec3} from '@brainana/planning-core/model.ts'
import type {TriangleSurface} from '@brainana/planning-core/surface-fit.ts'
import {surfacePatch} from '@brainana/planning-core/surface-patch.ts'
import {snapAvoidance} from './snapAvoidance.ts'
type Result={centers:Vec3[];patch:NonNullable<AvoidRegion['surfacePatch']>}
let worker:Worker|undefined,sequence=0,previous:TriangleSurface[]=[]
const pending=new Map<number,{resolve:(result:Result)=>void;reject:(error:Error)=>void}>()
/** A persistent worker retains the skull, keeping projection and painting off the UI thread. */
export async function paintSurface(surfaces:TriangleSurface[],points:Vec3[],fill:Vec3[],radius:number,normal:Vec3,projected=false):Promise<Result>{
 if(typeof Worker==='undefined'){const centers=projected?points:snapAvoidance(points,fill,radius,surfaces,normal);return {centers,patch:surfacePatch(surfaces,centers,radius)}}
 if(!worker){
  worker=new Worker(new URL('./avoidanceWorker.ts',import.meta.url),{type:'module'})
  worker.onmessage=(event:MessageEvent<({id:number;error:string}|({id:number}&Result))>)=>{const request=pending.get(event.data.id);if(!request)return;pending.delete(event.data.id);if('error' in event.data)request.reject(new Error(event.data.error));else request.resolve(event.data)}
  worker.onerror=event=>{for(const request of pending.values())request.reject(new Error(event.message||'Surface painting failed'));pending.clear();worker?.terminate();worker=undefined;previous=[]}
 }
 const changed=surfaces.length!==previous.length||surfaces.some((s,i)=>s.pts!==previous[i]?.pts||s.tris!==previous[i]?.tris)
 previous=surfaces
 return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});try{worker!.postMessage({id,...(changed?{surfaces}:{}),points,fill,radius,normal,projected})}catch(error){pending.delete(id);reject(error instanceof Error?error:new Error(String(error)));resetSurfacePainter()}})
}
export function resetSurfacePainter():void{
 worker?.terminate();worker=undefined;previous=[]
 for(const request of pending.values())request.reject(new DOMException('Surface painting cancelled','AbortError'))
 pending.clear()
}
