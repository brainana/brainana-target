import {transformVertices} from './meshTransform.ts'
import {headpostReferences} from '@brainana/planning-core/headposts.ts'
import type {Headpost,Vec3} from '@brainana/planning-core/model.ts'
import {localToWorld} from '@brainana/planning-core/geometry.ts'
import {cylinder,combine,type MeshGeometry} from './primitives.ts'
export function headpostGeometry(h:Headpost):MeshGeometry{
 if(h.mesh)return {pts:transformVertices(h.mesh.pts,h.pose),tris:new Uint32Array(h.mesh.tris)}
 const p=(z:number)=>localToWorld(h.pose,[0,0,z])
 const base=cylinder(p(0),p(h.baseThickness!),h.baseDiameter!/2,48)
 const reference=headpostReferences.find(r=>r.id===h.reference)
 if(reference?.profile!=='trapezoid')return combine([base,cylinder(p(h.baseThickness!),p(h.baseThickness!+h.postHeight!),h.postDiameter!/2,32)])
 const ratio=h.postDiameter!/reference.dimensions.postDiameter!
 const corners=[[-5.5,-7.5],[5.5,-7.5],[3.5,7.5],[-3.5,7.5]]
 const pts=new Float32Array([h.baseThickness!,h.baseThickness!+h.postHeight!].flatMap(z=>corners.flatMap(([x,y])=>localToWorld(h.pose,[x*ratio,y*ratio,z] as Vec3))))
 const tris=new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7])
 return combine([base,{pts,tris}])
}
