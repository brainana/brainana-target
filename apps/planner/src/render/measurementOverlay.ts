import type {Niivue} from '@niivue/niivue'
import type {Project,Vec3} from '@brainana/planning-core/model.ts'
import {measureDistance} from '@brainana/planning-core/measurements.ts'
import {cross,dot,normalize,sub} from '@brainana/planning-core/geometry.ts'

type Ruler={name:string;color:string;from:Vec3;to:Vec3;distance:number}
/** Invert the displayed plane's pixel basis, including mirrored and oblique views. */
export function measurementSliceProjection(origin:Vec3,dx:Vec3,dy:Vec3,pixel:[number,number]){
 const xx=dot(dx,dx),xy=dot(dx,dy),yy=dot(dy,dy),det=xx*yy-xy*xy
 if(!Number.isFinite(det)||det<=1e-18)return null
 const normal=normalize(cross(dx,dy))
 return {
  project:(point:Vec3):[number,number]=>{const delta=sub(point,origin),x=dot(delta,dx),y=dot(delta,dy);return [pixel[0]+(x*yy-y*xy)/det,pixel[1]+(y*xx-x*xy)/det]},
  distance:(point:Vec3)=>Math.abs(dot(sub(point,origin),normal)),
 }
}
/** Screen annotations never change geometry, scene fitting or collision calculations. */
export class MeasurementOverlay {
 readonly canvas=document.createElement('canvas')
 #rulers:Ruler[]=[]
 #points:Array<{name:string;point:Vec3}>=[]
 #pending=0
 constructor(private source:HTMLCanvasElement,private viewer:Niivue,private mode:'3d'|'slices'){
  this.canvas.className='measurement-overlay cardinal-overlay';this.canvas.hidden=true
  this.canvas.setAttribute('aria-label',mode==='3d'?'3D measurement rulers':'Slice measurement rulers')
  this.canvas.setAttribute('aria-hidden','true');this.canvas.style.pointerEvents='none'
  source.parentElement!.append(this.canvas)
  const draw=viewer.drawScene.bind(viewer)
  viewer.drawScene=(...args)=>{const result=draw(...args);this.schedule();return result}
 }
 update(project:Project|null):void {
  this.#rulers=(project?.measurements??[]).flatMap(m=>{const value=project&&m.visible?measureDistance(project,m):null;return value?[{name:m.name,color:m.color,from:value.from.point,to:value.to.point,distance:value.distanceMm}]:[]})
  this.#points=(project?.landmarks??[]).map(p=>({name:p.name,point:p.point}))
  this.canvas.hidden=!this.#rulers.length&&!this.#points.length
  if(!this.canvas.hidden)this.schedule()
 }
 schedule():void {if(!this.#pending&&(this.#rulers.length||this.#points.length))this.#pending=requestAnimationFrame(()=>{this.#pending=0;this.draw()})}
 draw():void {
  const source=this.source,overlay=this.canvas
  if((!this.#rulers.length&&!this.#points.length)||!source.isConnected||source.hidden||!source.width||!source.height){overlay.hidden=true;return}
  const rect=source.getBoundingClientRect();if(!rect.width||!rect.height){overlay.hidden=true;return}
  overlay.hidden=false
  if(overlay.width!==source.width)overlay.width=source.width
  if(overlay.height!==source.height)overlay.height=source.height
  Object.assign(overlay.style,{inset:'auto',left:source.offsetLeft+'px',top:source.offsetTop+'px',width:rect.width+'px',height:rect.height+'px'})
  const ctx=overlay.getContext('2d');if(!ctx)return
  ctx.clearRect(0,0,overlay.width,overlay.height)
  const dpr=source.width/rect.width
  ctx.font=`${12*dpr}px system-ui`;ctx.lineWidth=2*dpr
  let region=[0,0,overlay.width,overlay.height],placed:Array<{x:number;y:number;width:number;height:number}>=[]
  const label=(text:string,x:number,y:number,color:string)=>{
   const width=Math.min(region[2]-8*dpr,ctx.measureText(text).width+8*dpr),height=18*dpr
   if(width<=0)return
   x=Math.max(region[0]+4*dpr,Math.min(x,region[0]+region[2]-width-4*dpr))
   const clamp=(v:number)=>Math.max(region[1]+height,Math.min(v,region[1]+region[3]-4*dpr))
   const originalY=y
   for(const shift of [0,1,-1,2,-2,3,-3,4,-4]){
    y=clamp(originalY+shift*(height+3*dpr))
    if(!placed.some(r=>x<r.x+r.width&&x+width>r.x&&y-height<r.y&&y>r.y-r.height))break
   }
   placed.push({x,y,width,height})
   ctx.fillStyle='rgba(8,10,12,.85)';ctx.fillRect(x-3*dpr,y-height+2*dpr,width,height)
   ctx.fillStyle=color;ctx.fillText(text,x,y-2*dpr,width-6*dpr)
  }
  const point=(xy:ArrayLike<number>,color:string)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(xy[0],xy[1],3.5*dpr,0,2*Math.PI);ctx.fill()}
  const ruler=(r:Ruler,a:ArrayLike<number>,b:ArrayLike<number>,projected:boolean)=>{
   ctx.strokeStyle=r.color;ctx.setLineDash(projected?[5*dpr,4*dpr]:[]);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();ctx.setLineDash([])
   point(a,r.color);point(b,r.color)
   label(`${r.name} · ${r.distance.toFixed(2)} mm${projected?' · 3D projection':''}`,(a[0]+b[0])/2+5*dpr,(a[1]+b[1])/2-5*dpr,r.color)
  }
  if(this.mode==='3d'){
   if(!this.viewer.gl)return
   const bounds=[0,0,source.width,source.height],matrix=this.viewer.calculateMvpMatrix(null,bounds,this.viewer.scene.renderAzimuth,this.viewer.scene.renderElevation)[0]
   const project=(p:Vec3)=>this.viewer.calculateScreenPoint(p,matrix,bounds)
   for(const r of this.#rulers){const a=project(r.from),b=project(r.to);if([...a,...b].every(Number.isFinite))ruler(r,a,b,false)}
   for(const p of this.#points){const xy=project(p.point);if([...xy].every(Number.isFinite)){point(xy,'#ffca55');label(p.name,xy[0]+6*dpr,xy[1]-6*dpr,'#ffca55')}}
   return
  }
  for(const tile of this.viewer.screenSlices){
   if(tile.axCorSag>2)continue
   const [tileLeft,top,tileWidth,height]=tile.leftTopWidthHeight
   const left=tileWidth<0?tileLeft+tileWidth:tileLeft,width=Math.abs(tileWidth)
   if(width<=0||height<=0)continue
   const center=this.viewer.screenXY2mm(left+width/2,top+height/2),right=this.viewer.screenXY2mm(left+width/2+1,top+height/2),down=this.viewer.screenXY2mm(left+width/2,top+height/2+1)
   const origin=Array.from(center).slice(0,3) as Vec3
   const projection=measurementSliceProjection(origin,sub(Array.from(right).slice(0,3) as Vec3,origin),sub(Array.from(down).slice(0,3) as Vec3,origin),[left+width/2,top+height/2])
   if(!projection)continue
   const {project,distance}=projection
   region=[left,top,width,height];placed=[]
   ctx.save();ctx.beginPath();ctx.rect(left,top,width,height);ctx.clip()
   for(const r of this.#rulers){const a=project(r.from),b=project(r.to);if(a&&b&&[...a,...b].every(Number.isFinite))ruler(r,a,b,distance(r.from)>.5||distance(r.to)>.5)}
   for(const p of this.#points){if(distance(p.point)>.75)continue;const xy=project(p.point);if(xy){point(xy,'#ffca55');label(p.name,xy[0]+6*dpr,xy[1]-6*dpr,'#ffca55')}}
   ctx.restore()
  }
 }
}
