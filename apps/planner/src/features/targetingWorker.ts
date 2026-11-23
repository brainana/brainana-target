import { refitChamberAt, type MountingSurface } from '@brainana/planning-core/placement-adjustment.ts'
import {searchDirect,applyDirect} from '@brainana/planning-core/direct-placement.ts'
import { searchTarget, applyCandidate,type Candidate,type SearchOptions,type SearchResult } from '@brainana/planning-core/optimization.ts'
import type {Project,Vec3} from '@brainana/planning-core/model.ts'
export interface PlacementRequest {project:Project;electrode:string;target:string;options:SearchOptions;candidate?:Candidate}
export interface RefitRequest { project: Project; chamberId: string; point: Vec3; normal: Vec3; surface: MountingSurface }
export type PlacementResponse=import('../workers/task.ts').TaskMessage<Project|SearchResult>
self.onmessage=(event:MessageEvent<PlacementRequest | RefitRequest>)=>{
 try{
  const request = event.data
  if ('chamberId' in request) {
   self.postMessage({kind:'result', value:refitChamberAt(request.project, request.chamberId, request.point, request.normal, request.surface)})
   return
  }
  const {project,electrode,target,options,candidate}=request
  if(candidate){(project.electrodes.find(e=>e.id===electrode)?.direct?applyDirect:applyCandidate)(project,electrode,target,candidate,options);self.postMessage({kind:'result',value:project})}else self.postMessage({kind:'result',value:(project.electrodes.find(e=>e.id===electrode)?.direct?searchDirect:searchTarget)(project,electrode,target,options)})}
 catch(error){self.postMessage({kind:'error',message:error instanceof Error?error.message:String(error)})}
}
