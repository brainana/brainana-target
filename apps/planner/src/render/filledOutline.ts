import type {Vec3} from '@brainana/planning-core/model.ts'
import {sub,cross,normalize,dot,add,scale,length} from '@brainana/planning-core/geometry.ts'
/** Fill a planar outline with independent overlapping stamps, never connecting across concavities. */
export function fillOutline(points:Vec3[],radius:number):Vec3[]{
 if(points.length<3)return []
 const origin=points[0],u=normalize(sub(points[1],origin));let normal:Vec3|null=null
 for(let i=2;i<points.length;i++){const n=cross(u,sub(points[i],origin));if(length(n)>.001){normal=normalize(n);break}}
 if(!normal)return []
 const v=cross(normal,u),polygon=points.map(p=>{const d=sub(p,origin);return [dot(d,u),dot(d,v)]})
 const lo=[Math.min(...polygon.map(p=>p[0])),Math.min(...polygon.map(p=>p[1]))],hi=[Math.max(...polygon.map(p=>p[0])),Math.max(...polygon.map(p=>p[1]))]
 const step=Math.max(.1,radius*.8),count=Math.ceil((hi[0]-lo[0])/step)*Math.ceil((hi[1]-lo[1])/step)
 if(count>16000)throw new Error('Outline is too large for this brush size. Use a larger radius or several smaller outlines.')
 const stamps:Vec3[]=[]
 for(let y=lo[1];y<=hi[1];y+=step)for(let x=lo[0];x<=hi[0];x+=step){
  let inside=false
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside}
  if(inside)stamps.push(add(origin,add(scale(u,x),scale(v,y))))
 }
 return stamps
}
