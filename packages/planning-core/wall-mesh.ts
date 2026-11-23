import type {Chamber,Vec3} from './model.ts'
const add=(a:Vec3,b:Vec3):Vec3=>a.map((v,k)=>v+b[k]) as Vec3
const sub=(a:Vec3,b:Vec3):Vec3=>a.map((v,k)=>v-b[k]) as Vec3
const mul=(a:Vec3,s:number):Vec3=>a.map(v=>v*s) as Vec3
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,k)=>s+v*b[k],0)
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
function segmentDistance(a:Vec3,b:Vec3,c:Vec3,d:Vec3):number{
 const u=sub(b,a),v=sub(d,c),w=sub(a,c),aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w),clamp=(x:number)=>Math.max(0,Math.min(1,x));let s=0,t=0
 if(aa<1e-12)t=cc>1e-12?clamp(ee/cc):0
 else if(cc<1e-12)s=clamp(-dd/aa)
 else{s=aa*cc-bb*bb>1e-12?clamp((bb*ee-cc*dd)/(aa*cc-bb*bb)):0;t=(bb*s+ee)/cc;if(t<0){t=0;s=clamp(-dd/aa)}else if(t>1){t=1;s=clamp((bb-dd)/aa)}}
 return Math.hypot(...sub(add(a,mul(u,s)),add(c,mul(v,t))))
}
function pointTriangle(p:Vec3,a:Vec3,b:Vec3,c:Vec3):number{
 const ab=sub(b,a),ac=sub(c,a),n=cross(ab,ac),nn=dot(n,n)
 if(nn<1e-16)return Math.min(segmentDistance(p,p,a,b),segmentDistance(p,p,b,c),segmentDistance(p,p,c,a))
 const distance=dot(sub(p,a),n)/nn,q=sub(p,mul(n,distance)),v0=ab,v1=ac,v2=sub(q,a),aa=dot(v0,v0),bb=dot(v0,v1),cc=dot(v1,v1),dd=dot(v2,v0),ee=dot(v2,v1),den=aa*cc-bb*bb
 const u=(cc*dd-bb*ee)/den,v=(aa*ee-bb*dd)/den
 if(u>=0&&v>=0&&u+v<=1)return Math.abs(distance)*Math.sqrt(nn)
 return Math.min(segmentDistance(p,p,a,b),segmentDistance(p,p,b,c),segmentDistance(p,p,c,a))
}
export function segmentTriangleDistance(p:Vec3,q:Vec3,a:Vec3,b:Vec3,c:Vec3):number{
 const d=sub(q,p),u=sub(b,a),v=sub(c,a),h=cross(d,v),det=dot(u,h)
 if(Math.abs(det)>1e-12){const s=sub(p,a),x=dot(s,h)/det,k=cross(s,u),y=dot(d,k)/det,t=dot(v,k)/det;if(x>=0&&y>=0&&x+y<=1&&t>=0&&t<=1)return 0}
 return Math.min(pointTriangle(p,a,b,c),pointTriangle(q,a,b,c),segmentDistance(p,q,a,b),segmentDistance(p,q,b,c),segmentDistance(p,q,c,a))
}
/** Same 64-sided annular wall topology as the renderer, including fitted lower rim. */
const cache=new Map<string,Array<[Vec3,Vec3,Vec3]>>()
export function chamberWall(c:Chamber):Array<[Vec3,Vec3,Vec3]>{
 const key=JSON.stringify([c.innerRadius,c.wallThickness,c.height,c.baseFit]);const saved=cache.get(key);if(saved)return saved
 const n=c.baseFit?.innerDepths.length??64,faces:Array<[Vec3,Vec3,Vec3]>=[]
 const vertex=(i:number,outer:boolean,bottom:boolean):Vec3=>{const a=(i%n)*2*Math.PI/n,r=c.innerRadius+(outer?c.wallThickness:0),depth=bottom?(outer?c.baseFit?.outerDepths[i%n]:c.baseFit?.innerDepths[i%n])??c.height:0;return [r*Math.cos(a),r*Math.sin(a),-depth]}
 for(let i=0;i<n;i++){
  const it=vertex(i,false,false),jt=vertex(i+1,false,false),ib=vertex(i,false,true),jb=vertex(i+1,false,true),ot=vertex(i,true,false),pt=vertex(i+1,true,false),ob=vertex(i,true,true),pb=vertex(i+1,true,true)
  for(const [a,b,d,e] of [[it,jt,ib,jb],[ot,ob,pt,pb],[it,ot,jt,pt],[ob,ib,pb,jb]])faces.push([a,b,d],[d,b,e])
 }
 if(cache.size>=16)cache.delete(cache.keys().next().value!)
 cache.set(key,faces)
 return faces
}

/** Closed-wall solid membership handles a short guide tube lying wholly within wall material. */
export function insideWall(point:Vec3,faces:Array<[Vec3,Vec3,Vec3]>):boolean{
 const direction:Vec3=[.937,.223,.267],hits:number[]=[]
 for(const [a,b,c] of faces){const u=sub(b,a),v=sub(c,a),h=cross(direction,v),det=dot(u,h);if(Math.abs(det)<1e-12)continue;const s=sub(point,a),x=dot(s,h)/det,k=cross(s,u),y=dot(direction,k)/det,t=dot(v,k)/det;if(x>=-1e-10&&y>=-1e-10&&x+y<=1+1e-10&&t>1e-9)hits.push(t)}
 hits.sort((a,b)=>a-b);return hits.filter((t,i)=>!i||t-hits[i-1]>1e-7).length%2===1
}
