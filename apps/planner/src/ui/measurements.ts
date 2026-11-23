import {alignmentStatus,frameReadings} from '@brainana/planning-core/calibration.ts'
import {calibrationPanel,toolCalibrationPanel} from './calibration.ts'
import type {Project,Vec3} from '@brainana/planning-core/model.ts'
import {axisReferences,identifyArms,measureDistance,pointReferences,referenceKey,resolvePoint,type DistanceMeasurement,type MeasurementAxes,type PointReference} from '@brainana/planning-core/measurements.ts'
import {h} from '@brainana/ui/dom.ts'
import {button,download,note,numberField,readout,section,textField} from './controls.ts'
import {measurementCsv} from '../data/measurementExport.ts'

export interface MeasurementOptions {
 current:()=>Project|null
 edit:(change:(project:Project)=>void)=>boolean|void
 crosshair:()=>Vec3
 locate:(point:Vec3)=>void
 configure?:()=>void
 save?:()=>void
 saveNote?:string
}
const controllers=new WeakMap<HTMLElement,(project:Project|null)=>void>()
export function updateMeasurementPanels(container:HTMLElement,project:Project|null):void {
 for(const element of container.querySelectorAll<HTMLElement>('.measurement-panel,.measurement-summary-panel,.frame-calibration-summary-panel'))controllers.get(element)?.(project)
}
const signed=(n:number)=>{const value=Math.abs(n)<.005?0:n;return `${value>=0?'+':''}${value.toFixed(2)} mm`}
const names=(p:Project,r:PointReference)=>resolvePoint(p,r)?.name??'Unavailable reference — choose another point'
export function measurementSummary(project:Project):HTMLElement {
 const content=(project:Project)=>project.measurements?.length?project.measurements.map(m=>{
  const value=measureDistance(project,m)
  return h('div',{class:'measurement-summary'},[h('strong',{},[m.name]),note(value?`${value.from.name} → ${value.to.name} · ${value.distanceMm.toFixed(2)} mm · ${value.axes.name}`:'Reference unavailable — restore or edit this measurement.'),...(value?[note(value.offsetsMm.map((n,i)=>`${value.axes.labels[i]} ${signed(n)}`).join(' · '))]:[])])
 }):[note('Save useful distances in Stereotax to include them here and in exports.')]
 const root=section('Saved measurements',content(project));root.classList.add('measurement-summary-panel')
 controllers.set(root,p=>{if(p)root.replaceChildren(h('h3',{},['Saved measurements']),...content(p))});return root
}
export function frameCalibrationSummary(project:Project):HTMLElement {
 const content=(p:Project)=>{
  const state=alignmentStatus(p),c=p.frameCalibration
  return [note(state==='current'?'Frame alignment is current.':state==='changed'?'Frame alignment needs checking in Stereotax → Alignment.':'Set up measured frame coordinates in Stereotax → Alignment.'),...(state==='current'&&c?p.targets.map(t=>readout(t.name+' · frame X / Y / Z',frameReadings(c.result!,t.point,c.directions).map(n=>n.toFixed(3)).join(' / ')+' mm')):[])]
 }
 const root=section('Calibrated frame coordinates',content(project));root.classList.add('frame-calibration-summary-panel')
 controllers.set(root,p=>{if(p)root.replaceChildren(h('h3',{},['Calibrated frame coordinates']),...content(p))});return root
}
export function measurementPanel(options:MeasurementOptions):HTMLElement {
 const root=h('div',{class:'measurement-panel'}),draftForm=h('form',{class:'measurement-form'}),saved=h('div',{class:'saved-measurements'}),points=h('div',{class:'named-reference-points'})
 let view=options.current()
 root.dataset.projectId=view?.id??''
 const list=()=>view?pointReferences(view):[]
 let from:PointReference=list().find(p=>p.reference.kind==='ear-midpoint')?.reference??list()[0]?.reference??{kind:'point',name:'From snapshot',point:[...options.crosshair()]}
 let to:PointReference=list().find(p=>p.reference.kind==='chamber-center')?.reference??list().find(p=>referenceKey(p.reference)!==referenceKey(from))?.reference??{kind:'point',name:'To snapshot',point:[...options.crosshair()]}
 let basis:MeasurementAxes=view?.stereotax?{kind:'frame'}:{kind:'image'}
 const title=h('input',{type:'text',maxLength:120,ariaLabel:'Measurement name',placeholder:'Optional name'}),fromSelect=h('select',{ariaLabel:'Measure from'}),toSelect=h('select',{ariaLabel:'Measure to'}),axesSelect=h('select',{ariaLabel:'Measurement axes'}),preview=h('div',{class:'measurement-readout',ariaLive:'polite'})
 const add=h('button',{type:'submit',class:'primary'},['Save measurement'])
 const pointName=h('input',{type:'text',maxLength:120,ariaLabel:'Reference point name',placeholder:'For example: Fiducial 1'})
 const label=(name:string,element:HTMLElement)=>h('label',{class:'field'},[h('span',{},[name]),element])
 const edit=(change:(p:Project)=>void)=>{options.edit(p=>{identifyArms(p);change(p)});view=options.current();refresh()}
 function fill(select:HTMLSelectElement,values:Array<{value:string;label:string}>,current:string,fallback:string){
  select.replaceChildren(...values.map(v=>h('option',{value:v.value},[v.label])))
  if(!values.some(v=>v.value===current))select.append(h('option',{value:current},[fallback]))
  select.value=current
 }
 function renderPreview(){
  if(!view){add.disabled=true;preview.replaceChildren(note('Load anatomy to make measurements.'));return}
  const value=measureDistance(view,{id:'preview',name:'Preview',from,to,axes:basis,visible:true,color:'#ffca55'})
  add.disabled=!value
  preview.replaceChildren(...(value?[readout('Straight-line distance',`${value.distanceMm.toFixed(2)} mm`),...value.offsetsMm.map((n,i)=>readout('Δ '+value.axes.labels[i],signed(n)))]:[note('A selected reference or coordinate system is unavailable. Choose another reference.')]))
 }
 fromSelect.addEventListener('change',()=>{from=JSON.parse(fromSelect.value) as PointReference;renderPreview()})
 toSelect.addEventListener('change',()=>{to=JSON.parse(toSelect.value) as PointReference;renderPreview()})
 axesSelect.addEventListener('change',()=>{basis=JSON.parse(axesSelect.value) as MeasurementAxes;renderPreview()})
 const snapshot=(side:'from'|'to')=>{const point:PointReference={kind:'point',name:side==='from'?'From snapshot':'To snapshot',point:[...options.crosshair()]};if(side==='from')from=point;else to=point;refresh()}
 draftForm.append(label('Name',title),label('From',fromSelect),label('To',toSelect),h('div',{class:'measurement-capture'},[
  Object.assign(button('From crosshair',()=>snapshot('from')),{ariaLabel:'Use crosshair for From'}),Object.assign(button('To crosshair',()=>snapshot('to')),{ariaLabel:'Use crosshair for To'}),Object.assign(button('↔',()=>{[from,to]=[to,from];refresh()}),{ariaLabel:'Swap From and To'}),
 ]),label('Reference axes',axesSelect),note('Offsets are To minus From. Positive image/frame directions are right, front and up. Chamber, grid and arm offsets follow their own rotated X/Y/Z axes.'),preview,add)
 draftForm.addEventListener('submit',event=>{
  event.preventDefault();const p=options.current();if(!p||!measureDistance(p,{id:'preview',name:'Preview',from,to,axes:basis,visible:true,color:'#ffca55'}))return
  const colors=['#ffca55','#81d9ff','#d7a0ff','#c8ef79','#f2f2f2']
  const measurement:DistanceMeasurement={id:crypto.randomUUID(),name:title.value.trim()||`${names(p,from)} → ${names(p,to)}`.slice(0,120),from:structuredClone(from),to:structuredClone(to),axes:structuredClone(basis),visible:true,color:colors[(p.measurements?.length??0)%colors.length]}
  edit(p=>{(p.measurements??=[]).push(measurement)})
  title.value=''
 })
 function renderSaved(){
  const p=view;if(!p)return
  saved.replaceChildren(...(p.measurements??[]).map(m=>{
   const value=measureDistance(p,m)
   const mutate=(change:(item:DistanceMeasurement)=>void)=>edit(p=>{const item=p.measurements?.find(item=>item.id===m.id);if(item)change(item)})
   const visible=h('input',{type:'checkbox',checked:m.visible,ariaLabel:'Show ruler '+m.name}),color=h('input',{type:'color',value:m.color,ariaLabel:'Color for measurement '+m.name})
   visible.addEventListener('change',()=>mutate(item=>{item.visible=visible.checked}));color.addEventListener('change',()=>mutate(item=>{item.color=color.value}))
   const referenceField=(side:'from'|'to')=>{
    const select=h('select',{ariaLabel:`${side==='from'?'From':'To'} reference for ${m.name}`})
    fill(select,pointReferences(p).map(v=>({value:referenceKey(v.reference),label:v.name})),referenceKey(m[side]),names(p,m[side]))
    select.addEventListener('change',()=>mutate(item=>{item[side]=JSON.parse(select.value) as PointReference}))
    return label(side==='from'?'From':'To',select)
   }
   const axes=h('select',{ariaLabel:'Axes for '+m.name})
   fill(axes,axisReferences(p).map(v=>({value:referenceKey(v.reference),label:v.name})),referenceKey(m.axes),'Unavailable coordinate system')
   axes.addEventListener('change',()=>mutate(item=>{item.axes=JSON.parse(axes.value) as MeasurementAxes}))
   return h('article',{class:'measurement-card'},[
    h('div',{class:'measurement-title'},[h('strong',{},[m.name]),h('label',{},[visible,'Ruler']),color]),
    ...(value?[readout('Distance',`${value.distanceMm.toFixed(2)} mm`),note(`${value.from.name} → ${value.to.name} · ${value.axes.name}`),...value.offsetsMm.map((n,i)=>readout('Δ '+value.axes.labels[i],signed(n))),h('div',{class:'button-row'},[button('Locate From',()=>options.locate(value.from.point)),button('Locate To',()=>options.locate(value.to.point))])]:[note('Reference unavailable. Restore the removed object or edit the references below.')]),
    h('details',{},[h('summary',{},['Edit measurement']),textField('Measurement name',m.name,name=>mutate(item=>{item.name=name})),referenceField('from'),referenceField('to'),label('Reference axes',axes),button('Remove measurement',()=>edit(p=>{p.measurements=p.measurements?.filter(item=>item.id!==m.id)}),'danger')]),
   ])
  }))
  if(!p.measurements?.length)saved.append(note('No saved measurements yet.'))
 }
 function renderPoints(){
  const p=view;if(!p)return
  points.replaceChildren(...(p.landmarks??[]).map(mark=>h('article',{class:'reference-point-card'},[
   h('strong',{},[mark.name]),note(`Image R / A / S: ${mark.point.map(n=>n.toFixed(2)).join(' / ')} mm`),
   h('div',{class:'button-row'},[button('Locate '+mark.name,()=>options.locate(mark.point)),button('Update '+mark.name+' from crosshair',()=>{const point=[...options.crosshair()] as Vec3;edit(p=>{const item=p.landmarks?.find(item=>item.id===mark.id);if(item)item.point=point})})]),
   h('details',{},[h('summary',{},['Edit '+mark.name]),textField('Point name',mark.name,name=>edit(p=>{const item=p.landmarks?.find(item=>item.id===mark.id);if(item)item.name=name})),...(['R','A','S'] as const).map((axis,i)=>numberField(axis+' coordinate (mm)',mark.point[i],n=>edit(p=>{const item=p.landmarks?.find(item=>item.id===mark.id);if(item)item.point[i]=n}))),button('Remove '+mark.name,()=>edit(p=>{p.landmarks=p.landmarks?.filter(item=>item.id!==mark.id)}),'danger')]),
  ])))
 }
 function refresh(project=view){
  view=project;if(!view)return
  const references=pointReferences(view).map(v=>({value:referenceKey(v.reference),label:v.name}))
  fill(fromSelect,references,referenceKey(from),names(view,from));fill(toSelect,references,referenceKey(to),names(view,to))
  fill(axesSelect,axisReferences(view).map(v=>({value:referenceKey(v.reference),label:v.name})),referenceKey(basis),'Unavailable coordinate system')
  renderPreview();renderSaved();renderPoints();alignment.update(view);tools.update(view)
 }
 const alignment=calibrationPanel(options),tools=toolCalibrationPanel(options)
 const measurements=h('div',{class:'measurement-workspace'}),alignmentTab=alignment.element,toolTab=tools.element
 const panes=[measurements,alignmentTab,toolTab]
 const tabs=['Measurements','Alignment','Tools'].map((name,i)=>{const b=button(name,()=>{panes.forEach((p,j)=>{p.hidden=j!==i});tabs.forEach((b,j)=>b.setAttribute('aria-pressed',String(j===i)))});b.setAttribute('aria-pressed',String(i===0));return b})
 alignmentTab.hidden=true;toolTab.hidden=true
 root.append(h('div',{class:'calibration-tabs',role:'group',ariaLabel:'Stereotax tools'},tabs))
 measurements.append(
  section('Measure between references',[draftForm]),
  section('Saved measurements',[saved,note('Rulers remain linked to their objects. Dashed slice rulers show a projection; the label always reports the full 3D distance.'),button('Export measurements CSV',()=>{const p=options.current();if(p)download('measurements.csv',measurementCsv(p),'text/csv')})]),
  section('Named reference points',[note('Place the crosshair in the slices, give the point a name and save it. Existing imported landmarks are included here.'),label('Point name',pointName),button('Add named point at crosshair',()=>{
   const p=options.current();if(!p)return
   const point={id:crypto.randomUUID(),name:pointName.value.trim()||`Reference ${p.landmarks?.length? p.landmarks.length+1:1}`,point:[...options.crosshair()] as Vec3,frameId:p.frame.id}
   edit(p=>{(p.landmarks??=[]).push(point)});pointName.value=''
  }),points]),
 )
 root.prepend(...(options.configure?[section('Frame and arms',[note('Configure the frame and ear contacts, then measure, align or define arm tools below.'),button('Configure stereotax…',options.configure)])]:[]))
 root.append(...panes,...(options.save?[section('Save',[button('Save project with measurements',options.save),...(options.saveNote?[note(options.saveNote)]:[])])]:[]))
 controllers.set(root,refresh);refresh();return root
}
