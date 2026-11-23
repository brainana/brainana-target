import type {AvoidRegion} from '@brainana/planning-core/model.ts'
const ids=new WeakMap<object,number>();let sequence=0
export const geometryIdentity=(object:object|undefined)=>{if(!object)return 0;let id=ids.get(object);if(!id){id=++sequence;ids.set(object,id)}return id}
/** Domain snapshots are immutable. Compare geometry references, never serialize a mesh per frame. */
export function avoidanceKey(regions:AvoidRegion[]):string{
 return JSON.stringify(regions.map(r=>[r.id,r.name,r.constraint,r.center,r.radius,r.drawingMode,r.surfacePatch?undefined:r.points,r.surfacePatch?undefined:r.stamps,geometryIdentity(r.surfacePatch)]))
}
