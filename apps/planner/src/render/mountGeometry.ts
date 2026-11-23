import type {Chamber} from '@brainana/planning-core/model.ts'
import {localToWorld} from '@brainana/planning-core/geometry.ts'
import {ring,type MeshGeometry} from './primitives.ts'
export function chamberBody(c:Chamber):MeshGeometry{
 return ring(c.pose,c.innerRadius,c.innerRadius+c.wallThickness,c.height,64,c.mounting==='pedestal'||c.mounting==='acrylic'?undefined:c.baseFit)
}
/** Annular support from a fixed cylinder's flat base down to the fitted skull boundary. */
export function chamberSupport(c:Chamber):MeshGeometry|null{
 if(!c.baseFit||!['pedestal','acrylic'].includes(c.mounting??''))return null
 const profile={...c.baseFit,innerDepths:c.baseFit.innerDepths.map(d=>d-c.height),outerDepths:c.baseFit.outerDepths.map(d=>d-c.height)}
 if([...profile.innerDepths,...profile.outerDepths].some(d=>d<0))return null
 return ring({...c.pose,origin:localToWorld(c.pose,[0,0,-c.height])},c.innerRadius,c.innerRadius+c.wallThickness,Math.max(...profile.outerDepths),64,profile)
}
export function mountingSummary(c:Chamber):string{
 if(!c.baseFit)return 'No surface fit yet.'
 const depths=[...c.baseFit.innerDepths,...c.baseFit.outerDepths]
 if(c.mounting==='pedestal'||c.mounting==='acrylic')return `${c.mounting==='pedestal'?'Pedestal':'Acrylic / cement'} height beneath the unchanged ${c.height.toFixed(2)} mm cylinder: ${(Math.min(...depths)-c.height).toFixed(2)}–${(Math.max(...depths)-c.height).toFixed(2)} mm. Dimensions follow the chamber axis; the fit leaves ${c.baseFit.gap.toFixed(2)} mm clearance from the surface.`
 if(c.mounting==='cut')return `Remove ${(c.height-Math.max(...depths)).toFixed(2)}–${(c.height-Math.min(...depths)).toFixed(2)} mm from the stock rim. Remaining wall: ${Math.min(...depths).toFixed(2)}–${Math.max(...depths).toFixed(2)} mm.`
 return `Custom fitted wall lengths: ${Math.min(...depths).toFixed(2)}–${Math.max(...depths).toFixed(2)} mm.`
}
