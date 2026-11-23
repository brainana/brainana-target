import type {Electrode} from '@brainana/planning-core/model.ts'
import {add,axes,scale} from '@brainana/planning-core/geometry.ts'
import {cylinder,blade,type MeshGeometry} from './primitives.ts'
/** Published overall dimensions define an occupied envelope, not a machining model. */
export function connectorGeometry(c:NonNullable<Electrode['connector']>):MeshGeometry{
 const top=add(c.pose.origin,scale(axes(c.pose)[2],c.height))
 return c.shape==='cylinder'?cylinder(c.pose.origin,top,c.width/2,48):blade(c.pose.origin,top,c.pose,c.width,c.depth,0)
}
