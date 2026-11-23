import { h } from '@brainana/ui/dom.ts'
import type { Stereotax, StereotaxArm, Vec3 } from '@brainana/planning-core/model.ts'
import { worldToLocal } from '@brainana/planning-core/geometry.ts'
import { armKinematics, armStageLimits, basePlateDefaults, basePlatePresets, type BasePlatePreset } from '@brainana/planning-core/stereotaxSetup.ts'
import { frameDimensions, singleRail } from '@brainana/planning-core/stereotax.ts'
import { button, note } from './controls.ts'

/** Paired sliders and exact entries update a single physical parameter. */
export function stereotaxAdjustment(label:string,value:number,min:number,max:number,step:number,changed:(value:number)=>void) {
 const range=h('input',{type:'range',value:String(value),min:String(min),max:String(max),step:String(step),ariaLabel:label})
 const number=h('input',{type:'number',value:String(value),min:String(min),max:String(max),step:'any',ariaLabel:label+' value',required:true})
 range.disabled=max===min
 const update=(input:HTMLInputElement)=>{if(!input.checkValidity()||!Number.isFinite(input.valueAsNumber))return;range.value=number.value=input.value;changed(input.valueAsNumber)}
 range.addEventListener('input',()=>update(range));number.addEventListener('input',()=>update(number))
 return h('label',{class:'image-slider'},[h('span',{},[label]),range,number])
}
export function basePlateControls(rig:Stereotax,changed:()=>void) {
 const root=h('div'),select=h('select',{ariaLabel:'Base plate model'}),fields=h('div'),details=note(''),link=h('a',{target:'_blank',rel:'noopener noreferrer'},['Base plate reference'])
 const refresh=()=>{
  select.replaceChildren(h('option',{value:''},['No base plate']),...Object.entries(basePlatePresets).map(([value,spec])=>h('option',{value},[spec.name])),h('option',{value:'custom'},['Custom base plate']))
  select.value=rig.basePlate?.preset??'';fields.replaceChildren();details.hidden=link.hidden=!rig.basePlate
  const plate=rig.basePlate;if(!plate)return
  const published=plate.preset==='custom'?undefined:basePlatePresets[plate.preset]
  link.hidden=!published;if(published)link.href=published.source
  details.textContent=published?`Published footprint ${published.lengthMm} × ${published.widthMm} mm. ${'earHeightMm' in published?`Ear axis ${published.earHeightMm} mm above the plate; ear zero ${published.posteriorMm} mm from its posterior edge. `:'Ear-axis height and fore/aft position need measurement; their initial drawing values are illustrative. '}${'thicknessMm' in published?`Plate thickness ${published.thicknessMm} mm.`:'Plate thickness is not published here; the initial 6 mm drawing is illustrative. Enter your measurement.'}`:'Set the dimensions and position of your measured base plate.'
  const show=h('input',{type:'checkbox',checked:plate.show,ariaLabel:'Show base plate'})
  show.addEventListener('change',()=>{plate.show=show.checked;changed()})
  fields.append(h('label',{},[show,'Show base plate']),...([
   ['Plate width (mm)','widthMm',1,1000],['Plate length (mm)','lengthMm',1,1500],['Plate thickness (mm)','thicknessMm',.1,100],
   ['Ear axis above plate (mm)','earHeightMm',1,500],['Ear zero from posterior plate edge (mm)','posteriorMm',-500,1500],
  ] as const).map(([label,key,min,max])=>stereotaxAdjustment(label,plate[key],min,max,.1,value=>{plate[key]=value;changed()})))
 }
 select.addEventListener('change',()=>{rig.basePlate=select.value?(select.value==='custom'?{preset:'custom',widthMm:254,lengthMm:350,thicknessMm:6,posteriorMm:220,earHeightMm:53,show:true}:basePlateDefaults(select.value as BasePlatePreset)):undefined;refresh();changed()})
 root.append(h('label',{class:'field'},[h('span',{},['Base plate']),select]),details,link,fields);refresh()
 return {element:root,refresh}
}
export function earBlockControls(rig:Stereotax,crosshair:()=>Vec3,changed:()=>void,syncSpacing:()=>void) {
 const root=h('details'),body=h('div'),status=note('')
 root.append(h('summary',{},['Individual ear-bar blocks']),body,status)
 const offsets=()=>rig.earBlockOffsets??={left:{apMm:0,heightMm:0},right:{apMm:0,heightMm:0}}
 const refresh=()=>{
  const dimensions=frameDimensions(rig),span=singleRail(rig.preset)?rig.earSupportSpanMm??dimensions.spacingMm:dimensions.spacingMm-dimensions.widthMm
  const margin=Math.max(0,(span-rig.earTipSpacingMm)/2)
  body.replaceChildren(stereotaxAdjustment('Ear-tip center left/right (mm)',rig.earTipCenterMm??0,-margin,margin,.1,value=>{rig.earTipCenterMm=value;changed()}),...(['left','right'] as const).map(side=>{
   const label=side==='left'?'Left':'Right'
   return h('fieldset',{},[h('legend',{},[label+' ear bar']),
    stereotaxAdjustment(label+' block front/back (mm)',rig.earBlockOffsets?.[side].apMm??0,-100,100,.1,value=>{offsets()[side].apMm=value;changed()}),
    stereotaxAdjustment(label+' block up/down (mm)',rig.earBlockOffsets?.[side].heightMm??0,-100,100,.1,value=>{offsets()[side].heightMm=value;changed()}),
    button('Use crosshair as '+side+' ear tip',()=>{
     const point=worldToLocal(rig.pose,crosshair()),center=rig.earTipCenterMm??0
     const left=side==='left'?point[0]:center-rig.earTipSpacingMm/2,right=side==='right'?point[0]:center+rig.earTipSpacingMm/2
     if(right<left||Math.abs(left)>span/2||Math.abs(right)>span/2){status.textContent='The ear tip must be inside the support span, with left and right tips in order.';return}
     rig.earTipSpacingMm=right-left;rig.earTipCenterMm=(right+left)/2;offsets()[side]={apMm:point[1],heightMm:point[2]}
     syncSpacing();refresh();changed();status.textContent=label+' ear tip set from crosshair.'
    })])
  }),note('Offsets describe measured ear-bar block locations relative to the frame origin. They do not imply that every frame has independent adjustment knobs.'))
 }
 refresh();return {element:root,refresh}
}
export function armStageControls(rig:Stereotax,arm:StereotaxArm,changed:()=>void,locate?: (point:Vec3)=>void) {
 const root=h('div');let travel=armStageLimits(arm)
 const travelNote=note('')
 const updateTravelNote=()=>{travelNote.textContent=`${arm.model?'Published':arm.stageTravelMm?'Entered custom':'Illustrative custom'} total XYZ stage travel: ${travel.join(' × ')} mm. Offsets below are measured from the middle position at the entered assembly location.`}
 updateTravelNote();root.append(travelNote)
 const stageFields=(['stageXmm','stageYmm','stageZmm'] as const).map((key,i)=>stereotaxAdjustment('Stage '+['X','Y','Z'][i]+' offset (mm)',arm[key]??0,-travel[i]/2,travel[i]/2,.01,value=>{arm[key]=value;changed()}))
 root.append(...stageFields)
 if(!arm.model){
  const total=h('fieldset',{},[h('legend',{},['Measured custom stage travel'])])
  for(let i=0;i<3;i++){
   const input=h('input',{type:'number',min:'0',max:'1000',step:'any',required:true,value:String(travel[i]),ariaLabel:'Custom '+['X','Y','Z'][i]+' travel (mm)'})
   input.addEventListener('change',()=>{
    if(!input.checkValidity()||!Number.isFinite(input.valueAsNumber))return
    arm.stageTravelMm??=[...travel] as Vec3;arm.stageTravelMm[i]=input.valueAsNumber;travel=armStageLimits(arm)
    const key=(['stageXmm','stageYmm','stageZmm'] as const)[i];arm[key]=0
    for(const field of stageFields[i].querySelectorAll('input')){field.min=String(-travel[i]/2);field.max=String(travel[i]/2);field.value='0';field.disabled=travel[i]===0&&field.type==='range'}
    updateTravelNote();changed()
   })
   total.append(h('label',{class:'field'},[h('span',{},[['X','Y','Z'][i]+' total travel (mm)']),input]))
  }
  root.prepend(total)
 }
 root.append(button('Center XYZ stages',()=>{arm.stageXmm=arm.stageYmm=arm.stageZmm=0;for(const field of stageFields)for(const input of field.querySelectorAll('input'))input.value='0';changed()}))
 root.append(stereotaxAdjustment('Tool tilt X from vertical (°)',arm.toolTiltXDeg??0,-90,90,1,value=>{arm.toolTiltXDeg=value;changed()}),
  stereotaxAdjustment('Tool tilt Y from vertical (°)',arm.toolTiltYDeg??0,-90,90,1,value=>{arm.toolTiltYDeg=value;changed()}),
  stereotaxAdjustment('Holder length (mm)',arm.holderLengthMm??20,1,150,.1,value=>{arm.holderLengthMm=value;changed()}),
  stereotaxAdjustment('Holder diameter (mm)',arm.holderDiameterMm??4,.1,30,.1,value=>{arm.holderDiameterMm=value;changed()}),
  note('Stage axes turn with the tool tilt and swivel. Knob, carriage and holder body details are schematic; enter holder measurements to refine its occupied space.'))
 if(locate)root.append(button('Locate holder tip in slices',()=>locate(armKinematics(rig,arm).worldTip)))
 return root
}
