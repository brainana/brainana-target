import type {Project,Vec3} from '@brainana/planning-core/model.ts'
import {alignmentInputSignature,alignmentSetupSignature,alignmentStatus,applyAlignment,calculateAlignment,calibrationGeometryWarning,calibrationResiduals,defaultCalibration,frameReadings,type AlignmentResult,type Directions,type FiducialPair,type FiducialReference} from '@brainana/planning-core/calibration.ts'
import {armReferenceId,pointReferences,referenceKey,resolvePoint} from '@brainana/planning-core/measurements.ts'
import {calibrateTool,calibratedTool,toolStatus} from '@brainana/planning-core/armCalibration.ts'
import type {MeasurementOptions} from './measurements.ts'
import {h} from '@brainana/ui/dom.ts'
import {button,download,note,readout,section} from './controls.ts'
import {calibrationCsv} from '../data/calibrationExport.ts'

const xyz=['X / ML','Y / AP','Z / DV']
const positives=[['Right','Left'],['Front','Back'],['Up','Down']]
const fmt=(point:Vec3)=>point.map(n=>(Math.abs(n)<.0005?0:n).toFixed(3)).join(' / ')+' mm'
const label=(text:string,element:HTMLElement)=>h('label',{class:'field'},[h('span',{},[text]),element])
const numeric=(name:string,value?:number)=>h('input',{type:'number',step:'any',ariaLabel:name,...(value===undefined?{placeholder:'Measured mm'}:{value:String(value)})})
const valid=(inputs:HTMLInputElement[])=>inputs.every(input=>input.value.trim()!==''&&Number.isFinite(input.valueAsNumber))
const vec=(inputs:HTMLInputElement[])=>inputs.map(input=>input.valueAsNumber) as Vec3
const sync=(input:HTMLInputElement,value:number)=>{if(document.activeElement!==input)input.value=String(value)}
const choose=(name:string,values:Array<[string,string]>,value:string)=>{
 const input=h('select',{ariaLabel:name},values.map(([value,name])=>h('option',{value},[name])));input.value=value;return input
}
export function calibrationPanel(options:MeasurementOptions):{element:HTMLElement;update:(p:Project)=>void} {
 let view=options.current()!,candidate:AlignmentResult|undefined,error=''
 const root=h('div',{class:'calibration-panel'}),status=h('div',{class:'calibration-status',ariaLive:'polite'}),residuals=h('div',{class:'calibration-residuals'}),pairs=h('div',{class:'fiducial-pairs'}),coordinates=h('div',{class:'calibrated-coordinates',ariaLive:'polite'})
 const c=()=>view.frameCalibration??defaultCalibration()
 const edit=(change:(p:Project)=>void)=>{error='';try{options.edit(change);const p=options.current();if(p)update(p)}catch(e){error=e instanceof Error?e.message:String(e);renderStatus()}}
 const change=(fn:(calibration:NonNullable<Project['frameCalibration']>)=>void)=>edit(p=>fn(p.frameCalibration??=defaultCalibration()))
 const directionControls=xyz.map((axis,i)=>{
  const input=choose('Frame positive '+axis,positives[i].map((name,j)=>[String(j===0?1:-1),name]),String(c().directions[i]))
  input.addEventListener('change',()=>change(c=>{c.directions[i]=Number(input.value) as 1|-1}));return input
 })
 const source=choose('Image fiducial',[],'');const pairName=h('input',{type:'text',maxLength:120,ariaLabel:'Fiducial pair name',placeholder:'Optional name'})
 const frameInputs=xyz.map(axis=>numeric('New fiducial '+axis))
 const role=choose('New fiducial role',[['fit','Use to fit alignment'],['check','Independent check only']],'fit')
 let captured:FiducialReference|undefined
 const capture=button('Capture crosshair',()=>{captured={kind:'point',name:pairName.value.trim()||'Crosshair fiducial',point:[...options.crosshair()]};renderSources();source.value='snapshot'})
 function renderSources(){
  const selected=source.value
  const choices=pointReferences(view).filter(v=>['landmark','target'].includes(v.reference.kind))
  source.replaceChildren(h('option',{value:''},['Choose an image point…']),...choices.map(v=>h('option',{value:referenceKey(v.reference)},[v.name])),...(captured?[h('option',{value:'snapshot'},['Captured crosshair: '+fmt(captured.kind==='point'?captured.point:[0,0,0])])]:[]))
  source.value=Array.from(source.options).some(o=>o.value===selected)?selected:''
 }
 const pairForm=h('form',{class:'fiducial-form'},[label('Image point',source),capture,label('Pair name',pairName),h('div',{class:'calibration-triple'},frameInputs.map((input,i)=>label(xyz[i]+' (mm)',input))),label('Role',role),h('button',{type:'submit'},['Add fiducial pair'])])
 pairForm.addEventListener('submit',event=>{
  event.preventDefault()
  const reference=source.value==='snapshot'?captured:source.value?JSON.parse(source.value) as FiducialReference:null
  if(!reference||!valid(frameInputs)){error='Choose an image point or capture the crosshair, and enter all three measured frame coordinates.';renderStatus();return}
  const name=pairName.value.trim()||resolvePoint(view,reference)?.name||'Fiducial'
  change(c=>c.pairs.push({id:crypto.randomUUID(),name,image:structuredClone(reference),framePoint:vec(frameInputs),role:role.value as 'fit'|'check',enabled:true}))
  pairName.value='';frameInputs.forEach(input=>{input.value=''});captured=undefined;renderSources()
 })
 const rows=new Map<string,{element:HTMLElement;update:(pair:FiducialPair)=>void}>()
 function renderPairs(){
  for(const [id,row] of rows)if(!c().pairs.some(p=>p.id===id)){row.element.remove();rows.delete(id)}
  for(const pair of c().pairs){
   let row=rows.get(pair.id)
   if(!row){
    const id=pair.id,mutate=(fn:(pair:FiducialPair)=>void)=>change(c=>{const pair=c.pairs.find(v=>v.id===id);if(pair)fn(pair)})
    const name=h('strong'),image=note(''),measured=note(''),enabled=h('input',{type:'checkbox',ariaLabel:'Include '+pair.name}),role=choose('Role for '+pair.name,[['fit','Fit'],['check','Independent check']],pair.role)
    const numbers=xyz.map((axis,i)=>numeric(pair.name+' '+axis,pair.framePoint[i]))
    enabled.addEventListener('change',()=>mutate(pair=>{pair.enabled=enabled.checked}));role.addEventListener('change',()=>mutate(pair=>{pair.role=role.value as 'fit'|'check'}))
    numbers.forEach((input,i)=>input.addEventListener('change',()=>{if(valid(numbers))mutate(pair=>{pair.framePoint[i]=input.valueAsNumber})}))
    const nameInput=h('input',{type:'text',maxLength:120,value:pair.name,ariaLabel:'Rename '+pair.name})
    nameInput.addEventListener('change',()=>{if(nameInput.value.trim())mutate(pair=>{pair.name=nameInput.value.trim()})})
    const element=h('article',{class:'reference-point-card fiducial-pair'},[h('div',{class:'measurement-title'},[name,label('Include',enabled)]),image,measured,h('details',{},[h('summary',{},['Edit / locate point']),label('Role',role),h('div',{class:'calibration-triple'},numbers.map((input,i)=>label(xyz[i],input))),label('Pair name',nameInput),button('Locate image point',()=>{const pair=c().pairs.find(v=>v.id===id),point=pair&&resolvePoint(view,pair.image);if(point)options.locate(point.point)}),button('Remove fiducial pair',()=>change(c=>{c.pairs=c.pairs.filter(v=>v.id!==id)}),'danger')])])
    row={element,update:pair=>{name.textContent=pair.name;measured.textContent=`${pair.role==='fit'?'Fit':'Independent check'} · frame X / Y / Z: ${fmt(pair.framePoint)}`;const point=resolvePoint(view,pair.image);image.textContent=point?'Image R / A / S: '+fmt(point.point):'Image point unavailable';enabled.checked=pair.enabled;role.value=pair.role;numbers.forEach((input,i)=>sync(input,pair.framePoint[i]));if(document.activeElement!==nameInput)nameInput.value=pair.name}}
    rows.set(id,row);pairs.append(element)
   }
   row.update(pair)
  }
 }
 const calculate=button('Calculate alignment',()=>{
  try{const p=options.current();if(!p)return;candidate=calculateAlignment(p);error='';update(p)}catch(e){candidate=undefined;error=e instanceof Error?e.message:String(e);renderStatus()}
 })
 const apply=button('Apply alignment',()=>{if(!candidate)return;const result=candidate;edit(p=>applyAlignment(p,result));if(options.current()?.frameCalibration?.result?.fittedAt===result.fittedAt)candidate=undefined;update(options.current()??view)},'primary')
 function renderStatus(){
  const state=alignmentStatus(view),usableCandidate=!!candidate&&candidate.inputSignature===alignmentInputSignature(view)&&candidate.setupSignature===alignmentSetupSignature(view)
  apply.disabled=!usableCandidate
  const text=usableCandidate?'Alignment calculated. Review the fit and independent checks, then apply.':candidate?'Inputs changed after calculation. Calculate again.':state==='current'?'Applied alignment is current.':state==='changed'?'Alignment needs checking: image points, coordinate directions or frame setup changed. Recalculate and apply.':'No alignment applied.'
  status.replaceChildren(note(text),...(error?[h('p',{class:'calibration-error',role:'alert'},[error])]:[]))
  const transform=usableCandidate?candidate:state==='current'?c().result:undefined,values=transform?calibrationResiduals(view,transform):[]
  const summary=(role:'fit'|'check')=>{
   const group=values.filter(v=>v.pair.role===role),errors=group.flatMap(v=>v.errorMm===null?[]:[v.errorMm])
   return readout(role==='fit'?'Fit RMS mismatch':'Independent check RMS',errors.length?`${Math.sqrt(errors.reduce((sum,n)=>sum+n*n,0)/errors.length).toFixed(3)} mm (${errors.length} ${errors.length===1?'point':'points'})`:'No '+(role==='fit'?'current fit':'independent check'))
  }
  residuals.replaceChildren(summary('fit'),summary('check'),...values.map(v=>readout(v.pair.name+' · '+v.pair.role,v.errorMm===null?'Image point unavailable':v.errorMm.toFixed(3)+' mm')),...(calibrationGeometryWarning(view)?[note(calibrationGeometryWarning(view)!)]:[]))
 }
 const selectedPoint=choose('Point for calibrated coordinates',[],'')
 function renderCoordinates(){
  const selected=selectedPoint.value,choices=pointReferences(view).filter(v=>!['frame-zero','ear-left','ear-right','ear-midpoint','arm-tip','tool-tip'].includes(v.reference.kind))
  selectedPoint.replaceChildren(...choices.map(v=>h('option',{value:referenceKey(v.reference)},[v.name])))
  selectedPoint.value=choices.some(v=>referenceKey(v.reference)===selected)?selected:referenceKey(choices.find(v=>v.reference.kind==='target')?.reference??choices[0]?.reference??{kind:'point',name:'No point',point:[0,0,0]})
  const ref=choices.find(v=>referenceKey(v.reference)===selectedPoint.value)?.reference,point=ref&&resolvePoint(view,ref)
  coordinates.replaceChildren(...(point?[readout('Image R / A / S',fmt(point.point)),readout('Frame X / Y / Z',alignmentStatus(view)==='current'?fmt(frameReadings(c().result!,point.point,c().directions)):'Apply a current alignment first')]:[note('Add a target or named reference point to compare image and frame coordinates.')]))
 }
 selectedPoint.addEventListener('change',renderCoordinates)
 root.append(
  section('1 · Coordinate directions',[note('Enter measured frame readings in millimetres. X / ML is lateral, Y / AP is front–back, Z / DV is up–down. Choose the positive direction of each instrument axis.'),...directionControls.map((input,i)=>label('Positive '+xyz[i],input))]),
  section('2 · Match fiducials',[note('Use the same physical point in the image and on the instrument. Add at least three spread-out fit points. Reserve additional points as independent checks; they do not influence the fit.'),pairForm,pairs]),
  section('3 · Check and apply',[status,residuals,h('div',{class:'button-row'},[calculate,apply]),note('Rigid alignment preserves millimetres. Applying aligns the modeled frame; anatomy and implants stay in image space. Fit mismatch does not measure targeting accuracy. Independent checks assess only their measured locations.'),button('Export calibration CSV',()=>download('calibration.csv',calibrationCsv(options.current()??view),'text/csv'))]),
  section('Image and frame coordinates',[label('Selected point',selectedPoint),coordinates]),
 )
 function update(p:Project){view=p;directionControls.forEach((input,i)=>{input.value=String(c().directions[i])});renderSources();renderPairs();renderStatus();renderCoordinates()}
 update(view);return {element:root,update}
}

export function toolCalibrationPanel(options:MeasurementOptions):{element:HTMLElement;update:(p:Project)=>void} {
 let view=options.current()!,last=''
 const root=h('div',{class:'tool-calibration-panel'}),body=h('div'),error=note('')
 root.append(section('Working tips and slide readings',[note('The holder end is a modeled reference. Enter the working-tip offset from that end along the holder’s local X / Y / Z axes. A tip extending below the holder usually has a negative Z offset. Enter the actual slide readings now, then record this position. The arm will not move.'),error,body]))
 const entries=new Map<string,{element:HTMLElement;update:()=>void}>()
 function update(p:Project){
  view=p;const rig=p.stereotax
  if(!rig){body.replaceChildren(note('Configure a frame and add an arm first.'));entries.clear();last='';return}
  const ids=rig.arms.map(armReferenceId).join('|')
  if(ids!==last){body.replaceChildren();entries.clear();last=ids}
  for(const [i,arm] of rig.arms.entries()){
   const id=armReferenceId(arm,i);let entry=entries.get(id)
   if(!entry){
    const saved=arm.toolCalibration;let savedSignature=JSON.stringify(saved??null),dirtyZero=false
    const tip=xyz.map((axis,j)=>numeric('Arm '+(i+1)+' tip offset '+axis,saved?.tipOffsetMm[j]??0)),zero=xyz.map((axis,j)=>numeric('Arm '+(i+1)+' current reading '+axis,saved?.zeroReadingsMm[j]??0)),directions=xyz.map((axis,j)=>choose('Arm '+(i+1)+' positive '+axis,[['1','Same as modeled slide'],['-1','Opposite to modeled slide']],String(saved?.directions[j]??1)))
    zero.forEach(input=>input.addEventListener('input',()=>{dirtyZero=true}))
    const name=h('input',{type:'text',maxLength:120,value:saved?.name??`Arm ${i+1} tool`,ariaLabel:'Arm '+(i+1)+' tool name'}),readings=h('div',{class:'tool-readout',ariaLive:'polite'})
    const record=button('Record tool and readings',()=>{
     if(!name.value.trim()||!valid(tip)||!valid(zero)){error.textContent='Enter a tool name and all six finite millimetre values.';return}
     dirtyZero=false
     options.edit(p=>{const rig=p.stereotax,arm=rig?.arms.find((a,i)=>armReferenceId(a,i)===id);if(rig&&arm)calibrateTool(rig,arm,{name:name.value.trim(),tipOffsetMm:vec(tip),zeroReadingsMm:vec(zero),directions:directions.map(d=>Number(d.value)) as Directions})})
     error.textContent='';const p=options.current();if(p)update(p)
    },'primary')
    const element=h('article',{class:'reference-point-card tool-calibration-card'},[h('h4',{},[`Arm ${i+1}`]),readings,h('details',{},[h('summary',{},['Set tool offset and zero']),label('Tool name',name),h('strong',{},['Working-tip offset (mm)']),...tip.map((input,j)=>label(xyz[j],input)),h('strong',{},['Current instrument readings (mm)']),...zero.map((input,j)=>label(xyz[j],input)),...directions.map((input,j)=>label('Positive '+xyz[j],input)),record,button('Remove tool calibration',()=>{options.edit(p=>{const a=p.stereotax?.arms.find((a,i)=>armReferenceId(a,i)===id);if(a)delete a.toolCalibration});const p=options.current();if(p)update(p)})])])
    entry={element,update:()=>{
     const r=view.stereotax!,a=r.arms.find((a,i)=>armReferenceId(a,i)===id)!,tool=calibratedTool(r,a),state=toolStatus(r,a)
     const signature=JSON.stringify(a.toolCalibration??null)
     if(signature!==savedSignature){
      savedSignature=signature;dirtyZero=false
      name.value=a.toolCalibration?.name??`Arm ${i+1} tool`
      tip.forEach((input,j)=>sync(input,a.toolCalibration?.tipOffsetMm[j]??0))
      directions.forEach((input,j)=>{input.value=String(a.toolCalibration?.directions[j]??1)})
     }
     if(!dirtyZero)zero.forEach((input,j)=>sync(input,tool?.readings[j]??a.toolCalibration?.zeroReadingsMm[j]??0))
     readings.replaceChildren(note(state==='missing'?'No tool calibration recorded.':state==='changed'?'Tool setup changed. Check the offset and instrument readings, then record again.':a.toolCalibration!.name+' · recorded'),...(tool?[readout('Slide X / Y / Z',fmt(tool.readings)),readout('Working tip · image R / A / S',fmt(tool.point)),readout('Working tip · frame X / Y / Z',alignmentStatus(view)==='current'?fmt(frameReadings(view.frameCalibration!.result!,tool.point,view.frameCalibration!.directions)):'Apply a current frame alignment first'),button('Locate working tip',()=>options.locate(tool.point))]:[]))
    }};entries.set(id,entry);body.append(element)
   }
   entry.update()
  }
  if(!rig.arms.length)body.replaceChildren(note('Add a manipulator arm in Configure stereotax.'))
 }
 update(view);return {element:root,update}
}
