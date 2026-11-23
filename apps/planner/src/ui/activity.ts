import { h } from '@brainana/ui/dom.ts'
const active=new Map<symbol,string>()
export const activity=h('div',{class:'processing-status',role:'status',ariaLive:'polite',hidden:true})
export type ActivityHandle = (()=>void) & {update:(label:string)=>void}
export function beginActivity(label:string):ActivityHandle {
 const id=Symbol();active.set(id,label)
 const update=()=>{activity.hidden=!active.size;activity.textContent=active.size?[...active.values()].at(-1)!:'';activity.setAttribute('aria-busy',String(!!active.size))}
 update();const done=()=>{active.delete(id);update()};done.update=(label:string)=>{if(active.has(id)){active.set(id,label);update()}};return done
}
export async function withActivity<T>(label:string,task:(progress:(label:string)=>void)=>Promise<T>|T):Promise<T>{
 const done=beginActivity(label)
 try{await new Promise<void>(resolve=>typeof requestAnimationFrame==='function'?requestAnimationFrame(()=>setTimeout(resolve,0)):setTimeout(resolve,0));return await task(done.update)}finally{done()}
}
