import { axes, localToWorld } from './geometry.ts'
import type { Species, Stereotax, StereotaxArm, Vec3 } from './model.ts'
import { compatibleEarBars, compatibleBiteAdaptors, defaultEarBar, manipulatorDefaults, stereotaxPresets, type StereotaxPreset, type ManipulatorPreset } from './stereotax.ts'

export const basePlatePresets = {
 '900-C': { name:'Kopf 900-C · standard', widthMm:254, lengthMm:353.06, posteriorMm:222.5802, earHeightMm:53, source:stereotaxPresets['kopf-940'].source },
 '900-E': { name:'Kopf 900-E · rotating', widthMm:254, lengthMm:353.06, posteriorMm:222.5802, earHeightMm:53, source:stereotaxPresets['kopf-900ls'].source },
 '930-B': { name:'Kopf 930-B · open frame', widthMm:254, lengthMm:431.8, posteriorMm:234.95, earHeightMm:53, source:stereotaxPresets['kopf-930'].source },
 'narishige-sr': { name:'Narishige SR · published footprint', widthMm:400, lengthMm:300, source:stereotaxPresets['narishige-sr5rht'].source },
 '912': { name:'Kopf 912 · spinal plate', widthMm:304.8, lengthMm:609.6, thicknessMm:25.4, source:'https://kopfinstruments.com/product/base-plates/' },
 '1211': { name:'Kopf 1211 · portable', widthMm:304.8, lengthMm:406.4, thicknessMm:9.525, socketDiameterMm:19.05, source:'https://kopfinstruments.com/product/model-1211-base-plate/' },
} satisfies Record<string,{name:string;widthMm:number;lengthMm:number;posteriorMm?:number;earHeightMm?:number;thicknessMm?:number;socketDiameterMm?:number;source:string}>
export type BasePlatePreset = keyof typeof basePlatePresets
export interface StereotaxBasePlate {
 preset: BasePlatePreset | 'custom'; widthMm:number; lengthMm:number; thicknessMm:number; posteriorMm:number; earHeightMm:number; show:boolean
}
const smallFrames: StereotaxPreset[] = ['kopf-900','kopf-900ls','kopf-902','kopf-940','kopf-942','kopf-962','kopf-930','kopf-900m','narishige-sr5rht','narishige-sr5mht']
export function frameChoices(species?: Species): StereotaxPreset[] {
 const all=Object.keys(stereotaxPresets) as StereotaxPreset[]
 if(!species||species==='other')return all
 if(species==='macaque')return all.filter(id=>!smallFrames.includes(id)&&id!=='narishige-sr6cht')
 if(species==='marmoset')return ['narishige-sr6cht','narishige-sr5rht','narishige-sr5mht']
 return smallFrames
}
export function defaultFrame(species?: Species): StereotaxPreset {
 return species==='marmoset'?'narishige-sr6cht':species&&species!=='macaque'&&species!=='other'?'kopf-900':'kopf-1430'
}
export function speciesEarBars(frame:StereotaxPreset|'custom',species?:Species) {
 const bars=compatibleEarBars(frame)
 if(!species||species==='other')return bars
 return bars.filter(bar=>{
  if(bar.id==='EB-3A')return species!=='mouse'
  if(bar.id==='EB-3B')return species==='mouse'||species==='tree-shrew'
  if(bar.id==='922M')return species==='mouse'||species==='tree-shrew'
  if(bar.id==='955M')return species==='rat'||species==='tree-shrew'
  if(bar.id==='851M')return species==='macaque'||species==='marmoset'
  const suffix=bar.id.slice(-2)
  return species==='mouse'?['21','22'].includes(suffix):species==='rat'?['55','57'].includes(suffix):species==='tree-shrew'?['21','22','55','57'].includes(suffix):['51','52','53'].includes(suffix)
 })
}
export function basePlateDefaults(preset:BasePlatePreset):StereotaxBasePlate {
 const spec=basePlatePresets[preset]
 return {preset,widthMm:spec.widthMm,lengthMm:spec.lengthMm,thicknessMm:'thicknessMm' in spec?spec.thicknessMm:6,
  posteriorMm:'posteriorMm' in spec?spec.posteriorMm:spec.lengthMm/2,earHeightMm:'earHeightMm' in spec?spec.earHeightMm:100,show:true}
}
export function defaultPlateForFrame(frame:StereotaxPreset|'custom'): StereotaxBasePlate | undefined {
 if(frame.startsWith('narishige-'))return basePlateDefaults('narishige-sr')
 if(frame==='kopf-930')return basePlateDefaults('930-B')
 if(frame==='kopf-900ls')return basePlateDefaults('900-E')
 if(['kopf-900','kopf-902','kopf-940','kopf-942','kopf-962'].includes(frame))return basePlateDefaults('900-C')
 return undefined
}
/** Published total stage travels. Stage offsets are relative to the entered assembly position. */
export const manipulatorTravel:Record<ManipulatorPreset,readonly[number,number,number]> = {
 'kopf-960':[80,80,80], 'kopf-961':[80,80,80], 'kopf-940-digital':[80,80,80],
 'kopf-1460':[80,0,80], 'kopf-1460-61':[80,25,80], 'kopf-1760':[80,0,80], 'kopf-1760-61':[80,25,80],
 'narishige-sm15':[60,0,50], 'narishige-smm100':[80,20,80], 'narishige-smm200':[80,20,80],
}
export function armStageLimits(arm:StereotaxArm): readonly[number,number,number] {
 return arm.model?manipulatorTravel[arm.model]:arm.stageTravelMm??[80,80,80]
}
export function createStereotax(species:Species|undefined,origin:Vec3):Stereotax {
 const preset=defaultFrame(species),profile=speciesEarBars(preset,species)[0]
 const preferred=species==='mouse'?'922':defaultEarBar[preset]
 return {preset,pose:{origin:[...origin],angles:[0,0,0]},railDropMm:0,earTipSpacingMm:species==='mouse'?10:species==='macaque'?70:25,
  showEarBars:true,earBarId:speciesEarBars(preset,species).find(bar=>bar.id===preferred)?.id??profile?.id??defaultEarBar[preset],
  basePlate:defaultPlateForFrame(preset),arms:includedManipulators(preset)}
}
export function standardArm(frame:StereotaxPreset|'custom',side:'left'|'right'='left'):StereotaxArm {
 return {id:crypto.randomUUID(),model:frame==='custom'?undefined:manipulatorDefaults[frame],side,apMm:0,heightMm:65,reachMm:55,
  stageXmm:0,stageYmm:0,stageZmm:0,toolTiltXDeg:0,toolTiltYDeg:0,holderLengthMm:20,holderDiameterMm:4}
}

export function armKinematics(rig:Stereotax,arm:StereotaxArm) {
 const spec=rig.dimensions??(rig.preset==='custom'?{spacingMm:177.8}:stereotaxPresets[rig.preset])
 const single=['kopf-930','kopf-900m','narishige-sr5rht','narishige-sr5mht'].includes(rig.preset)
 const side=arm.side==='left'?-1:1, x=single?rig.railLateralMm??0:side*spec.spacingMm/2
 const az=(arm.azimuthDeg??0)*Math.PI/180,el=(arm.elevationDeg??0)*Math.PI/180
 const anchor:Vec3=[x,arm.apMm,-rig.railDropMm+arm.heightMm]
 const joint:Vec3=[anchor[0]-side*Math.cos(az)*Math.cos(el)*arm.reachMm,anchor[1]-side*Math.sin(az)*Math.cos(el)*arm.reachMm,anchor[2]+Math.sin(el)*arm.reachMm]
 const stageAxes=axes({origin:[0,0,0],angles:[arm.toolTiltXDeg??0,arm.toolTiltYDeg??0,arm.azimuthDeg??0]})
 const move=(p:Vec3,axis:Vec3,amount:number)=>p.map((v,i)=>v+axis[i]*amount) as Vec3
 const xCarriage=move(joint,stageAxes[0],arm.stageXmm??0)
 const yCarriage=move(xCarriage,stageAxes[1],arm.stageYmm??0)
 const holder=move(yCarriage,stageAxes[2],arm.stageZmm??0)
 const tip=move(holder,stageAxes[2],-(arm.holderLengthMm??20))
 return {anchor,joint,stageAxes,xCarriage,yCarriage,holder,tip,worldTip:localToWorld(rig.pose,tip),move}
}

export function adaptorTravel(id:string):{ap:number;dv?:readonly[number,number]}|undefined {
 if(['920','926'].includes(id))return {ap:44,dv:[-20,10]}
 if(['920M','923M'].includes(id))return {ap:46,dv:[-10,10]}
 return undefined
}

export function speciesAdaptors(frame:StereotaxPreset|'custom',species?:Species) {
 const choices=compatibleBiteAdaptors(frame)
 if(!species||species==='other')return choices
 const ids=species==='macaque'?['1245','1245M','1745','1535','1535M','866']:species==='marmoset'?['1248','CA-6','SR-6C-HT-jaw']:species==='mouse'?['926','923-B','923M','MA-6N','1923-B']:species==='rat'?['920','920M','RA-6N','1929-B']:['920','920M','926','923-B','923M','MA-6N','RA-6N']
 return choices.filter(item=>item.id==='custom'||ids.includes(item.id))
}
export function armModelChoices(frame:StereotaxPreset|'custom'):ManipulatorPreset[] {
 if(frame==='custom')return Object.keys(manipulatorTravel) as ManipulatorPreset[]
 if(frame.startsWith('narishige'))return ['narishige-sm15','narishige-smm100','narishige-smm200']
 if(['kopf-900','kopf-900ls','kopf-902','kopf-940','kopf-942','kopf-962'].includes(frame))return ['kopf-960','kopf-961','kopf-940-digital']
 return ['kopf-1460','kopf-1460-61','kopf-1760','kopf-1760-61']
}

export function includedManipulators(frame:StereotaxPreset|'custom'):StereotaxArm[] {
 const count=['kopf-902','kopf-942','kopf-962'].includes(frame)?2:['kopf-900','kopf-900ls','kopf-940'].includes(frame)?1:0
 return Array.from({length:count},(_,i)=>standardArm(frame,i?'right':'left'))
}
