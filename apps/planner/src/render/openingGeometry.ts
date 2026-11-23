import type { Vec3 } from '@brainana/planning-core/model.ts'
export interface OpeningMeasurement {
  diameter: number
  minimumWidth: number
  maximumWidth: number
  resolutionMm: number
  source: 'ct' | 'mesh'
}
export interface Aperture {
  center: Vec3
  radius: number
  diameter: number
  minimumWidth: number
  maximumWidth: number
  circularity: number
  normal: Vec3
  patch?: {pts:number[];tris:number[]}
}
export function planeBasis(normal:Vec3):[Vec3,Vec3]{
  const axis:Vec3=Math.abs(normal[2])<.9?[0,0,1]:[1,0,0]
  const u:Vec3=[normal[1]*axis[2]-normal[2]*axis[1],normal[2]*axis[0]-normal[0]*axis[2],normal[0]*axis[1]-normal[1]*axis[0]]
  const length=Math.hypot(...u);for(let k=0;k<3;k++)u[k]/=length
  return [u,[normal[1]*u[2]-normal[2]*u[1],normal[2]*u[0]-normal[0]*u[2],normal[0]*u[1]-normal[1]*u[0]]]
}
/** Caliper widths of a planar outline; angular sampling cannot add a full voxel to a small slit. */
export function apertureWidths(points:number[][]):[number,number]{
  let minimum=Infinity,maximum=0
  for(let a=0;a<360;a++){
    const c=Math.cos(a*Math.PI/360),s=Math.sin(a*Math.PI/360)
    let lo=Infinity,hi=-Infinity
    for(const p of points){const d=p[0]*c+p[1]*s;lo=Math.min(lo,d);hi=Math.max(hi,d)}
    minimum=Math.min(minimum,hi-lo);maximum=Math.max(maximum,hi-lo)
  }
  return [minimum,maximum]
}
/** Area-equivalent aperture diameter, distinct from the conservative enclosing radius. */
export function measureBoundary(points:Vec3[]):Aperture|null{
  if(points.length<3)return null
  const origin=points.reduce((sum,p)=>sum.map((q,k)=>q+p[k]) as Vec3,[0,0,0] as Vec3).map(q=>q/points.length) as Vec3,n:Vec3=[0,0,0]
  for(let i=0;i<points.length;i++){
    const a=points[i].map((v,k)=>v-origin[k]),b=points[(i+1)%points.length].map((v,k)=>v-origin[k])
    n[0]+=a[1]*b[2]-a[2]*b[1];n[1]+=a[2]*b[0]-a[0]*b[2];n[2]+=a[0]*b[1]-a[1]*b[0]
  }
  const length=Math.hypot(...n);if(length<1e-9)return null
  const normal=n.map(v=>v/length) as Vec3,[u,v]=planeBasis(normal)
  const xy=points.map(p=>[p.reduce((s,q,k)=>s+(q-origin[k])*u[k],0),p.reduce((s,q,k)=>s+(q-origin[k])*v[k],0)])
  let area2=0,cx=0,cy=0,perimeter=0
  for(let i=0;i<xy.length;i++){const a=xy[i],b=xy[(i+1)%xy.length],cross=a[0]*b[1]-b[0]*a[1];area2+=cross;cx+=(a[0]+b[0])*cross;cy+=(a[1]+b[1])*cross;perimeter+=Math.hypot(a[0]-b[0],a[1]-b[1])}
  if(Math.abs(area2)<1e-9)return null
  cx/=3*area2;cy/=3*area2
  const center=origin.map((q,k)=>q+cx*u[k]+cy*v[k]) as Vec3
  const area=Math.abs(area2)/2,diameter=2*Math.sqrt(area/Math.PI),radius=Math.max(...points.map(p=>Math.hypot(...p.map((q,k)=>q-center[k]))))
  const [minimumWidth,maximumWidth]=apertureWidths(xy)
  return {center,radius,diameter,minimumWidth,maximumWidth,circularity:4*Math.PI*area/perimeter**2,normal}
}
export function apertureInRange(candidate:Pick<Aperture,'diameter'|'minimumWidth'|'maximumWidth'>,min:number,max:number){
  return candidate.diameter>=min&&candidate.minimumWidth>=min&&candidate.maximumWidth<=max
}
