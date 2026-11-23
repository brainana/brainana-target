import type {Project} from '@brainana/planning-core/model.ts'
const immutableVoxelRegions=new WeakSet<object>()
type VoxelRegion=Extract<NonNullable<Project['targets'][number]['region']>,{kind:'voxels'}>
function voxels(region:VoxelRegion):VoxelRegion{
 if(immutableVoxelRegions.has(region))return region
 const copy=Object.freeze({...region,centers:Object.freeze(region.centers.map(v=>Object.freeze([...v]))) as unknown as VoxelRegion['centers'],axes:Object.freeze(region.axes.map(v=>Object.freeze([...v]))) as unknown as VoxelRegion['axes']});immutableVoxelRegions.add(copy);return copy
}
type Patch={pts:number[];tris:number[]}
/** Large polygon buffers are immutable values. Share those; copy editable metadata. */
function mesh(p:Patch):Patch {
 if(Object.isFrozen(p)&&Object.isFrozen(p.pts)&&Object.isFrozen(p.tris))return p
 return Object.freeze({pts:Object.freeze(p.pts.slice()) as unknown as number[],tris:Object.freeze(p.tris.slice()) as unknown as number[]})
}
export function projectSnapshot(p:Project):Project {
 const next:Project=structuredClone({...p,targets:p.targets.map(t=>({...t,region:t.region?.kind==='voxels'?undefined:t.region})),headposts:p.headposts?.map(h=>({...h,mesh:undefined})),avoidRegions:p.avoidRegions?.map(r=>({...r,surfacePatch:undefined})),surfaceOpenings:p.surfaceOpenings?.map(o=>({...o,patch:undefined}))})
 p.targets.forEach((t,i)=>{if(t.region?.kind==='voxels')next.targets[i].region=voxels(t.region);else if(!t.region)delete next.targets[i].region})
 p.headposts?.forEach((h,i)=>{if(h.mesh)next.headposts![i].mesh=mesh(h.mesh);else delete next.headposts![i].mesh})
 if(!Object.hasOwn(p,'headposts'))delete next.headposts
 p.avoidRegions?.forEach((r,i)=>{if(r.surfacePatch)next.avoidRegions![i].surfacePatch=mesh(r.surfacePatch);else delete next.avoidRegions![i].surfacePatch})
 p.surfaceOpenings?.forEach((o,i)=>{if(o.patch)next.surfaceOpenings![i].patch=mesh(o.patch);else delete next.surfaceOpenings![i].patch})
 if(!Object.hasOwn(p,'avoidRegions'))delete next.avoidRegions
 if(!Object.hasOwn(p,'surfaceOpenings'))delete next.surfaceOpenings
 return next
}
