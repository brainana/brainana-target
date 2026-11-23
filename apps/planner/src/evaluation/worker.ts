import {fitMask,type MaskSource} from './geometry.ts'
import {unzipSync} from 'fflate'
import {readNmtEntries,nmtEntryKind} from './nmt.ts'

export type EvaluationRequest={kind:'mask';source:MaskSource}|{kind:'nmt';bytes:Uint8Array}
self.onmessage=(e:MessageEvent<EvaluationRequest>)=>{
 try{
  if(e.data.kind==='mask'){
   const value=fitMask(e.data.source)
   self.postMessage({kind:'result',value},{transfer:[value.mesh.pts.buffer,value.mesh.tris.buffer]})
  }else{
   let size=0
   const entries=unzipSync(e.data.bytes,{filter:entry=>{
    if(!nmtEntryKind(entry.name))return false
    size+=entry.originalSize
    if(size>256*1024*1024)throw new Error('NMT imaging data exceed the 256 MB import limit.')
    return true
   }})
   const value=readNmtEntries(entries)
   self.postMessage({kind:'result',value})
  }
 }catch(error){self.postMessage({kind:'error',message:error instanceof Error?error.message:String(error)})}
}
