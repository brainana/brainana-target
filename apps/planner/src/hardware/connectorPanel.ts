import {withActivity} from '../ui/activity.ts'
import {placementInputs} from '../state/placementPreview.ts'
import type {Electrode,Vec3} from '@brainana/planning-core/model.ts'
import {connectorPresets,connectorPreset} from '@brainana/planning-core/connectors.ts'
import {axes,normalize,sub,dot,scale,poseFromAxes,trajectoryAxes} from '@brainana/planning-core/geometry.ts'
import type {FeatureContext} from '../features/contracts.ts'
import {h} from '@brainana/ui/dom.ts'
import {section,selectField,note,button,numberField,readout,errorDialog} from '../ui/controls.ts'
export function connectorPanel(ctx:FeatureContext,e:Electrode):HTMLElement{
 const set=(fn:(e:Electrode)=>void)=>ctx.edit(d=>fn(d.electrodes.find(x=>x.id===e.id)!))
 const custom=()=>{
  const dialog=h('dialog',{ariaLabel:'Measured skull connector',class:'settings-dialog'}),error=note(''),inputs=(['Width / diameter','Depth','Height'] as const).map(label=>{const input=h('input',{type:'number',min:'0.1',max:'200',step:'0.1',required:true});return {input,field:h('label',{},[label+' (mm)',input])}})
  const shape=h('select',{},[h('option',{value:'box'},['Box']),h('option',{value:'cylinder'},['Cylinder'])])
  dialog.append(h('header',{class:'modal-head'},[h('h2',{},['Measured connector / pedestal']),button('×',()=>dialog.close())]),note('Enter the complete occupied dimensions of your ordered connector and pedestal. FMA pedestal variants differ; include the pedestal, not just its connector insert.'),shape,...inputs.map(x=>x.field),error,button('Save measured connector',()=>{
   if(!inputs.every(x=>x.input.reportValidity()))return
   const [width,depth,height]=inputs.map(x=>x.input.valueAsNumber)
   try{set(el=>{el.connector={presetId:'measured',shape:shape.value as 'box'|'cylinder',width,depth:shape.value==='cylinder'?width:depth,height,pose:{origin:ctx.crosshair(),angles:[0,0,0]},unplaced:true,sources:e.hardware?.presetId==='micro-fma'?['https://www.microprobes.com/products/multichannel-arrays/fma']:[]}});dialog.close()}catch(err){error.textContent=String(err)}
  },'primary'))
  dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal()
 }
 const c=e.connector
 const place=(point:Vec3,normal?:Vec3)=>{set(el=>{el.connector!.pose=normal?poseFromAxes(point,trajectoryAxes(normal)):{...el.connector!.pose,origin:[...point]};el.connector!.unplaced=false});ctx.scene.setSurfaceFitHandler?.(null)}
 const onSurface=(point:Vec3)=>{
  // Use the closest surface triangle normal, oriented away from the surface centroid.
  let best=Infinity,normal:Vec3|undefined;const surfaces=ctx.scene.mountingSurface.surfaces,centroid:Vec3=[0,0,0];let count=0;for(const s of surfaces)for(let i=0;i<s.pts.length;i+=3){for(let k=0;k<3;k++)centroid[k]+=s.pts[i+k];count++}if(count)for(let k=0;k<3;k++)centroid[k]/=count
  for(const s of surfaces)for(let i=0;i<s.tris.length;i+=3){const a=[0,1,2].map(k=>s.pts[3*s.tris[i]+k]) as Vec3,b=[0,1,2].map(k=>s.pts[3*s.tris[i+1]+k]) as Vec3,d=[0,1,2].map(k=>s.pts[3*s.tris[i+2]+k]) as Vec3,center=a.map((v,k)=>(v+b[k]+d[k])/3) as Vec3,dist=Math.hypot(...sub(center,point));if(dist>=best)continue;best=dist;const u=sub(b,a),v=sub(d,a);normal=normalize([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]])}
  if(normal&&dot(normal,sub(point,centroid))<0)normal=scale(normal,-1)
  place(point,normal)
 }
 return section('Skull connector / pedestal',[
  selectField('Connector model',c?.presetId??'none',[{value:'none',label:'No connector model'},...connectorPresets.filter(p=>e.hardware?.presetId==='utah'||p.id===c?.presetId).map(p=>({value:p.id,label:p.label})),{value:'measured',label:e.hardware?.presetId==='micro-fma'?'FMA pedestal — enter ordered dimensions':'Custom — enter measured dimensions'}],id=>{if(id==='none')set(el=>{delete el.connector});else if(id==='measured')custom();else set(el=>{el.connector=connectorPreset(id,ctx.crosshair())!})}),
  note('The skull connector has its own position; moving the array does not move this connector. The model is an occupied-space envelope. The cable, contacts and screw holes are not modeled.'),
  ...(c?[readout('Overall dimensions',`${c.width} × ${c.depth} × ${c.height} mm`),...(c.neckDiameter?[readout('Published neck diameter',`${c.neckDiameter} mm — base contour not specified`)]:[]),
  ...c.sources.map(url=>h('a',{href:url,target:'_blank',rel:'noopener'},['Manufacturer specifications'])),
  readout('Connector position',c.unplaced?'Not placed — choose a skull location':'Placed independently of the electrode'),
  button(ctx.scene.surfaceFitActive?'Stop connector placement':'Place connector on 3D skull',()=>{if(ctx.scene.surfaceFitActive)ctx.scene.setSurfaceFitHandler?.(null);else if(!ctx.scene.placementSurface)errorDialog(new Error('Finalize a planning surface first.'));else ctx.scene.setSurfaceFitHandler?.(point=>{const key=placementInputs(ctx.store.project!);void withActivity('Positioning skull connector…',()=>{if(key!==placementInputs(ctx.store.project!))throw new Error('The project changed. Choose the connector location again.');onSurface(point)}).catch(errorDialog)});ctx.refresh()}),
  button('Place connector base at crosshair',()=>place(ctx.crosshair())),
  ...(['X','Y','Z'] as const).map((label,i)=>numberField(`Connector ${label} angle (°)`,c.pose.angles[i],value=>set(el=>{el.connector!.pose.angles[i]=value}),{min:-360,max:360})),
  button('Edit measured dimensions…',custom),
  note('This connector is included as a conservative hard obstacle for later electrode and chamber searches. Its exported STL is a reference envelope, not a printable connector design.'),
  readout('Outward axis',axes(c.pose)[2].map(v=>v.toFixed(2)).join(' · '))]:[])
 ])
}
