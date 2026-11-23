import type {Chamber,Grid,Vec3} from '@brainana/planning-core/model.ts'
import {gridSeatHeight,gridCenterHeight,gridAxes,holeLocal,add,scale,localToWorld} from '@brainana/planning-core/geometry.ts'
import type {MeshGeometry} from './primitives.ts'
/** Seated cylindrical insert with a sloped top face. Channels are drawn separately. */
export function gridWedge(c:Chamber,g:Grid):MeshGeometry{
 const pts:number[]=[],tris:number[]=[],n=64,p=(g.tiltAzimuth??0)*Math.PI/180,t=(g.tiltAngle??0)*Math.PI/180,h=gridCenterHeight(c,g)
 for(let i=0;i<n;i++){const a=2*Math.PI*i/n,x=c.innerRadius*Math.cos(a),y=c.innerRadius*Math.sin(a);pts.push(...localToWorld(c.pose,[x,y,gridSeatHeight(c,g)]),...localToWorld(c.pose,[x,y,h+(x*Math.cos(p)+y*Math.sin(p))*Math.tan(t)]))}
 pts.push(...localToWorld(c.pose,[0,0,gridSeatHeight(c,g)]),...localToWorld(c.pose,[0,0,h]))
 for(let i=0;i<n;i++){const a=2*i,b=2*((i+1)%n);tris.push(a,b,a+1,a+1,b,b+1,2*n,a,b,2*n+1,b+1,a+1)}
 return {pts:new Float32Array(pts),tris:new Uint32Array(tris)}
}
export function gridChannel(c:Chamber,g:Grid,hole:[number,number]):[Vec3,Vec3]{
 const start=holeLocal(g,hole,c),direction=scale(gridAxes(g)[2],-1),depth=((gridSeatHeight(c,g))-start[2])/direction[2]
 return [localToWorld(c.pose,start),localToWorld(c.pose,add(start,scale(direction,depth)))]
}
export function gridChannelLength(c:Chamber,g:Grid,hole:[number,number]):number{const [a,b]=gridChannel(c,g,hole);return Math.hypot(...a.map((v,k)=>v-b[k]))}
