import { settings } from '@brainana/planning-core/optimization.ts'
import { newId, type Project } from '@brainana/planning-core/model.ts'
import { validateProject } from '@brainana/planning-core/validation.ts'
/** Import dimensions and measured pose only when the anatomical reference matches. */
export function importChamberDefinition(destination:Project,input:unknown):Project {
 let source:Project
 if(input&&typeof input==='object'&&!('schemaVersion' in input)){
  const data=input as Record<string,unknown>
  const reference=destination.assets.find(a=>a.id===destination.frame.referenceAssetId)?.sha256
  if(data.referenceSha256!==reference)throw Error('This coordinate table has no matching reference image checksum. Open the original saved project instead.')
  if(!data.frame||typeof data.frame!=='object'||(data.frame as {convention?:unknown}).convention!=='RAS'||(data.frame as {units?:unknown}).units!=='mm')throw Error('Chamber coordinates must be RAS millimetres.')
  const frameId=(data.frame as {id?:unknown}).id
  const normalized:Record<string,unknown>={...structuredClone(destination),chambers:data.chambers,grids:data.grids,electrodes:[],targets:[],avoidRegions:[],surfaceOpenings:[]}
  if(!Array.isArray(normalized.chambers)||!Array.isArray(normalized.grids))throw Error('This file has no chamber and grid definitions.')
  normalized.chambers=normalized.chambers.map((value:unknown)=>{if(!value||typeof value!=='object'||!('frameId' in value)||value.frameId!==frameId)throw Error('Chamber coordinate frame is inconsistent.');const chamber:Record<string,unknown>={...value,frameId:destination.frame.id};delete chamber.baseFit;delete chamber.targetIds;return chamber})
  source=validateProject(normalized)
 }else source=validateProject(input)

 const reference=(p:Project)=>p.assets.find(a=>a.id===p.frame.referenceAssetId)?.sha256
 if(!reference(source)||reference(source)!==reference(destination)) throw new Error('This chamber uses a different reference image. Open its saved project instead, or enter measurements aligned to the current image. Import does not register coordinates between images.')
 if(source.chambers.length!==1)throw new Error('Choose a file containing exactly one chamber.')
 if(destination.chambers.length)throw new Error('A chamber is already defined. Start a new project or edit its current specifications.')
 const next=structuredClone(destination), chamber=structuredClone(source.chambers[0]),oldId=chamber.id
 chamber.id=newId();chamber.frameId=next.frame.id;delete chamber.baseFit;delete chamber.targetIds
 next.chambers=[chamber]
 next.grids=source.grids.filter(g=>g.chamberId===oldId).map(g=>({...structuredClone(g),id:newId(),chamberId:chamber.id}))
 next.planningIntent='electrode';next.planning={...settings(next),mode:'existing'} as Project['planning']
 return validateProject(next)
}
